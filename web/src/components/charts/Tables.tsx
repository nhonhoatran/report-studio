import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp, ChevronsDownUp, ChevronsUpDown, Minus, Plus } from 'lucide-react';
import type { QueryResult, Widget } from '@/api/types';
import { formatCell, formatNumber } from '@/lib/format';
import { useI18nStore, useT } from '@/i18n';
import { canTotal, columnFormat, columnLabel, measureAgg, measureAliases, measureLabel, num, str, sum, type Row } from './shape';
import { allParents, buildMatrix, colKeyOf, columnGroups, defaultExpanded, visibleNodes, type MatrixNode } from './matrix';

interface Props { widget: Widget; result: QueryResult }

type Sort = { alias: string; dir: 'asc' | 'desc' } | null;

/** Client-side sort of the rows already loaded; numbers compare as numbers, everything else as text. */
function sortRows(rows: Row[], sort: Sort, numeric: Set<string>): Row[] {
  if (!sort) return rows;
  const { alias, dir } = sort;
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (numeric.has(alias)) return ((num(a[alias]) ?? -Infinity) - (num(b[alias]) ?? -Infinity)) * sign;
    return str(a[alias]).localeCompare(str(b[alias])) * sign;
  });
}

/**
 * A measure's total: what the server computed over every group when it was asked to (a ratio's
 * total is then the ratio of the totals); otherwise, for an older answer, the loaded rows added up
 * where that is sound (sums and counts), and nothing for anything else.
 */
function grandTotal(widget: Widget, result: QueryResult, alias: string): number | null {
  if (result.totals) return num(result.totals.grand[alias]);
  return canTotal(measureAgg(widget, alias)) ? sum(result.rows.map((r) => num(r[alias]))) : null;
}

/** The table visual: every column sortable from its header, optional totals row and data bars. */
export function DataTable({ widget, result }: Props) {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const fmt = (alias: string) => columnFormat(widget, alias);
  const [sort, setSort] = useState<Sort>(null);
  const numeric = useMemo(() => new Set(result.columns.filter((c) => c.role === 'measure' || typeof result.rows[0]?.[c.alias] === 'number').map((c) => c.alias)), [result]);
  const rows = useMemo(() => sortRows(result.rows, sort, numeric), [result.rows, sort, numeric]);
  const measures = useMemo(() => measureAliases(result), [result]);
  const maxima = useMemo(() => {
    const out = new Map<string, number>();
    if (!widget.options.dataBars) return out;
    for (const m of measures) out.set(m, Math.max(...result.rows.map((r) => Math.abs(num(r[m]) ?? 0)), 0));
    return out;
  }, [widget.options.dataBars, measures, result.rows]);
  const totals = widget.options.showTotals ? measures.map((m) => grandTotal(widget, result, m)) : null;
  const toggle = (alias: string) => setSort((s) => (s?.alias !== alias ? { alias, dir: numeric.has(alias) ? 'desc' : 'asc' } : s.dir === 'asc' ? { alias, dir: 'desc' } : s.dir === 'desc' && !numeric.has(alias) ? null : { alias, dir: 'asc' }));
  const barStyle = (alias: string, v: unknown): CSSProperties | undefined => {
    const max = maxima.get(alias);
    if (!max) return undefined;
    return { '--bar': `${Math.round((Math.abs(num(v) ?? 0) / max) * 100)}%` } as CSSProperties;
  };
  return (
    <div className="chart-table">
      <table className="table">
        <thead>
          <tr>
            {result.columns.map((c) => {
              const active = sort?.alias === c.alias;
              return (
                <th key={c.alias} className={numeric.has(c.alias) ? 'num' : undefined} aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className={['chart-table__sort', active && 'chart-table__sort--active'].filter(Boolean).join(' ')} onClick={() => toggle(c.alias)} title={t('editor.sortColumn')}>
                    <span>{columnLabel(widget, c, lang)}</span>
                    {active && (sort!.dir === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {result.columns.map((c) => (
                <td key={c.alias} className={[numeric.has(c.alias) && 'num', maxima.has(c.alias) && 'bar'].filter(Boolean).join(' ') || undefined} style={barStyle(c.alias, r[c.alias])}>
                  {numeric.has(c.alias) ? formatNumber(r[c.alias], fmt(c.alias), lang) : formatCell(r[c.alias], lang)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr>
              {result.columns.map((c, i) => {
                const mi = measures.indexOf(c.alias);
                return (
                  <td key={c.alias} className={numeric.has(c.alias) ? 'num' : undefined}>
                    {i === 0 && mi < 0 ? t('editor.total') : mi >= 0 ? formatNumber(totals[mi], fmt(c.alias), lang) : ''}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/**
 * Power BI's matrix: the leading dimensions are row levels that open and close, the trailing ones
 * go across the columns, every measure in each cell. A parent row shows its level's values (the
 * subtotal) and the totals row and column come from the server with the rest, so a ratio totals as
 * a ratio and nothing is fetched when a level opens.
 */
export function Matrix({ widget, result }: Props) {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const fmt = (alias: string) => columnFormat(widget, alias);
  const tree = useMemo(() => buildMatrix(result, widget), [result, widget]);
  const { measures, colKeys, colLevels, rowLevels } = tree;
  const totals = widget.options.showTotals === true;
  const expandLevel = Math.max(1, widget.options.matrixExpand ?? 1);
  // null = the author's default; a viewer's clicks live here for the session
  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  useEffect(() => setExpanded(null), [expandLevel]);
  const open = expanded ?? defaultExpanded(tree, expandLevel);
  const toggle = (key: string) => setExpanded((prev) => { const next = new Set(prev ?? defaultExpanded(tree, expandLevel)); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const rows = visibleNodes(tree, open);
  const dimCols = result.columns.filter((c) => c.role === 'dimension');
  const rowHead = dimCols.slice(0, rowLevels).map((c) => columnLabel(widget, c, lang)).join(' / ');
  const label = (m: string) => measureLabel(widget, m, lang) ?? m;
  const hasColumns = colLevels > 0;
  const showMeasureRow = !hasColumns || measures.length > 1;
  const headerRows = (hasColumns ? colLevels : 0) + (showMeasureRow ? 1 : 0);
  const cell = (v: number | null, m: string, key: string) => <td key={key} className="num">{formatNumber(v, fmt(m), lang)}</td>;
  const cellsOf = (node: MatrixNode) => [
    ...colKeys.flatMap((tuple) => measures.map((m) => cell(num(node.cells.get(colKeyOf(tuple))?.[m]), m, `${colKeyOf(tuple)}|${m}`))),
    ...(hasColumns && totals ? measures.map((m) => cell(num(node.rowTotal?.[m]), m, `total|${m}`)) : []),
  ];
  return (
    <div className="chart-table">
      <table className="table matrix">
        <thead>
          {Array.from({ length: hasColumns ? colLevels : 0 }, (_, level) => (
            <tr key={`col-${level}`}>
              {level === 0 && (
                <th scope="col" rowSpan={headerRows}>
                  {rowHead}
                  {rowLevels > 1 && (
                    <span className="matrix__tools">
                      <button type="button" className="matrix__toggle" title={t('editor.expandAll')} onClick={() => setExpanded(allParents(tree))}><ChevronsUpDown size={12} aria-hidden /><span className="sr-only">{t('editor.expandAll')}</span></button>
                      <button type="button" className="matrix__toggle" title={t('editor.collapseAll')} onClick={() => setExpanded(new Set())}><ChevronsDownUp size={12} aria-hidden /><span className="sr-only">{t('editor.collapseAll')}</span></button>
                    </span>
                  )}
                </th>
              )}
              {columnGroups(colKeys, level).map((g, i) => <th key={`${level}-${i}`} scope="col" className="num" colSpan={g.span * measures.length}>{g.label}</th>)}
              {level === 0 && totals && <th scope="col" className="num" rowSpan={colLevels} colSpan={measures.length}>{t('editor.total')}</th>}
            </tr>
          ))}
          {showMeasureRow && (
            <tr>
              {!hasColumns && (
                <th scope="col">
                  {rowHead}
                  {rowLevels > 1 && (
                    <span className="matrix__tools">
                      <button type="button" className="matrix__toggle" title={t('editor.expandAll')} onClick={() => setExpanded(allParents(tree))}><ChevronsUpDown size={12} aria-hidden /><span className="sr-only">{t('editor.expandAll')}</span></button>
                      <button type="button" className="matrix__toggle" title={t('editor.collapseAll')} onClick={() => setExpanded(new Set())}><ChevronsDownUp size={12} aria-hidden /><span className="sr-only">{t('editor.collapseAll')}</span></button>
                    </span>
                  )}
                </th>
              )}
              {colKeys.flatMap((tuple) => measures.map((m) => <th key={`${colKeyOf(tuple)}|${m}`} scope="col" className="num">{label(m)}</th>))}
              {hasColumns && totals && measures.map((m) => <th key={`total|${m}`} scope="col" className="num">{label(m)}</th>)}
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((node) => {
            const parent = node.children.length > 0;
            const isOpen = parent && open.has(node.key);
            return (
              <tr key={node.key} className={parent ? 'matrix__parent' : undefined}>
                <th scope="row" style={{ '--level': node.level - 1 } as CSSProperties}>
                  <span className="matrix__row-head">
                    {rowLevels > 1 && (parent
                      ? <button type="button" className="matrix__toggle" aria-expanded={isOpen} onClick={() => toggle(node.key)}>{isOpen ? <Minus size={12} aria-hidden /> : <Plus size={12} aria-hidden />}<span className="sr-only">{t(isOpen ? 'editor.collapseRow' : 'editor.expandRow', { name: node.label })}</span></button>
                      : <span className="matrix__toggle matrix__toggle--none" aria-hidden />)}
                    <span>{node.label}</span>
                  </span>
                </th>
                {cellsOf(node)}
              </tr>
            );
          })}
        </tbody>
        {totals && (
          <tfoot>
            <tr>
              <th scope="row">{t('editor.total')}</th>
              {colKeys.flatMap((tuple) => measures.map((m) => cell(num(tree.colTotals.get(colKeyOf(tuple))?.[m]), m, `${colKeyOf(tuple)}|${m}`)))}
              {hasColumns && measures.map((m) => cell(num(tree.grand?.[m]), m, `grand|${m}`))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
