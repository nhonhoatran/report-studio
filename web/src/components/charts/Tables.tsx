import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, Minus, Plus } from 'lucide-react';
import type { QueryResult, Widget } from '@/api/types';
import { formatCell, formatNumber } from '@/lib/format';
import { useI18nStore, useT } from '@/i18n';
import { canTotal, columnFormat, columnLabel, measureAgg, measureAliases, measureLabel, num, str, sum, type Row } from './shape';
import { allParents, buildMatrix, colKeyOf, columnGroups, defaultExpanded, visibleNodes, type MatrixNode } from './matrix';
import { cellFormat, columnStats, type ColumnStats } from './conditional';

import type { Paging, Pick } from './ChartRenderer';

interface Props { widget: Widget; result: QueryResult }

type Sort = { alias: string; dir: 'asc' | 'desc' } | null;

/** The ▲ / ▼ a rule may add, so a reader who cannot tell the colours still reads the state. */
function CfIcon({ icon }: { icon?: 'up' | 'down' }) {
  if (!icon) return null;
  const Icon = icon === 'up' ? ArrowUp : ArrowDown;
  return <Icon size={11} aria-hidden className="chart-table__cf-icon" />;
}

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

/** The table visual: every column sortable from its header (by the server when paged), optional totals row, data bars and a pager. */
export function DataTable({ widget, result, paging, pick }: Props & { paging?: Paging; pick?: Pick }) {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const fmt = (alias: string) => columnFormat(widget, alias);
  const [localSort, setLocalSort] = useState<Sort>(null);
  // a paged table is sorted by the server, so the reader's choice goes back through the query
  const sort: Sort = paging ? (paging.sort ? { alias: paging.sort.alias, dir: paging.sort.direction } : null) : localSort;
  const setSort = (next: Sort | ((s: Sort) => Sort)) => {
    const value = typeof next === 'function' ? next(sort) : next;
    if (paging) { paging.setSort(value ? { alias: value.alias, direction: value.dir } : undefined); paging.setIndex(0); } else setLocalSort(value);
  };
  const numeric = useMemo(() => new Set(result.columns.filter((c) => c.role === 'measure' || typeof result.rows[0]?.[c.alias] === 'number').map((c) => c.alias)), [result]);
  const rows = useMemo(() => (paging ? result.rows : sortRows(result.rows, sort, numeric)), [paging, result.rows, sort, numeric]);
  const firstDim = result.columns.find((c) => c.role === 'dimension')?.alias;
  const pickable = !!pick?.onSelect && !!firstDim;
  const measures = useMemo(() => measureAliases(result), [result]);
  const maxima = useMemo(() => {
    const out = new Map<string, number>();
    if (!widget.options.dataBars) return out;
    for (const m of measures) out.set(m, Math.max(...result.rows.map((r) => Math.abs(num(r[m]) ?? 0)), 0));
    return out;
  }, [widget.options.dataBars, measures, result.rows]);
  const totals = widget.options.showTotals ? measures.map((m) => grandTotal(widget, result, m)) : null;
  const conditional = widget.options.conditional;
  const stats = useMemo(() => new Map(measures.map((m) => [m, columnStats(result.rows.map((r) => num(r[m])))] as const)), [measures, result.rows]);
  const cf = (alias: string, v: unknown, total = false) => {
    const f = conditional?.[alias];
    return f && (!total || f.totals) ? cellFormat(f, num(v), stats.get(alias)) : undefined;
  };
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
            <tr key={i} className={pickable ? 'chart-table__row--pick' : undefined} onClick={pickable ? () => pick!.onSelect!(str(r[firstDim!])) : undefined}
              onContextMenu={pick?.onDrill && firstDim ? (e) => { e.preventDefault(); pick.onDrill!(str(r[firstDim])); } : undefined}>
              {result.columns.map((c) => {
                const f = cf(c.alias, r[c.alias]);
                return (
                  <td key={c.alias} className={[numeric.has(c.alias) && 'num', maxima.has(c.alias) && 'bar', f?.className].filter(Boolean).join(' ') || undefined} style={{ ...barStyle(c.alias, r[c.alias]), ...f?.style }}>
                    <CfIcon icon={f?.icon} />{numeric.has(c.alias) ? formatNumber(r[c.alias], fmt(c.alias), lang) : formatCell(r[c.alias], lang)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr>
              {result.columns.map((c, i) => {
                const mi = measures.indexOf(c.alias);
                const f = mi >= 0 ? cf(c.alias, totals[mi], true) : undefined;
                return (
                  <td key={c.alias} className={[numeric.has(c.alias) && 'num', f?.className].filter(Boolean).join(' ') || undefined} style={f?.style}>
                    {mi >= 0 && <CfIcon icon={f?.icon} />}{i === 0 && mi < 0 ? t('editor.total') : mi >= 0 ? formatNumber(totals[mi], fmt(c.alias), lang) : ''}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
      {paging && (
        <nav className="chart-table__pager" aria-label={t('editor.pager')}>
          <button type="button" className="matrix__toggle" disabled={paging.index === 0} title={t('editor.pagePrev')} onClick={() => paging.setIndex(paging.index - 1)}><ChevronLeft size={14} aria-hidden /><span className="sr-only">{t('editor.pagePrev')}</span></button>
          <span className="text-sm text-muted">{t('editor.pageLabel', { n: paging.index + 1 })}</span>
          <button type="button" className="matrix__toggle" disabled={!paging.more} title={t('editor.pageNext')} onClick={() => paging.setIndex(paging.index + 1)}><ChevronRight size={14} aria-hidden /><span className="sr-only">{t('editor.pageNext')}</span></button>
        </nav>
      )}
    </div>
  );
}

/**
 * Power BI's matrix: the leading dimensions are row levels that open and close, the trailing ones
 * go across the columns, every measure in each cell. A parent row shows its level's values (the
 * subtotal) and the totals row and column come from the server with the rest, so a ratio totals as
 * a ratio and nothing is fetched when a level opens.
 */
export function Matrix({ widget, result, pick }: Props & { pick?: Pick }) {
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
  const rowHead = dimCols.slice(0, rowLevels).map((c) => columnLabel(widget, c, lang)).join(t('editor.levelJoin'));
  // the corner cell: the row levels' names and, with more than one level, "expand all" and "collapse all"
  const corner = (
    <>
      {rowHead}
      {rowLevels > 1 && (
        <span className="matrix__tools">
          <button type="button" className="matrix__toggle" title={t('editor.expandAll')} onClick={() => setExpanded(allParents(tree))}><ChevronsUpDown size={12} aria-hidden /><span className="sr-only">{t('editor.expandAll')}</span></button>
          <button type="button" className="matrix__toggle" title={t('editor.collapseAll')} onClick={() => setExpanded(new Set())}><ChevronsDownUp size={12} aria-hidden /><span className="sr-only">{t('editor.collapseAll')}</span></button>
        </span>
      )}
    </>
  );
  const label = (m: string) => measureLabel(widget, m, lang) ?? m;
  const hasColumns = colLevels > 0;
  const showMeasureRow = !hasColumns || measures.length > 1;
  const headerRows = (hasColumns ? colLevels : 0) + (showMeasureRow ? 1 : 0);
  const conditional = widget.options.conditional;
  const stats = useMemo(() => new Map<string, ColumnStats | undefined>(measures.map((m) => [m, columnStats(result.rows.map((r) => num(r[m])))])), [measures, result.rows]);
  const cell = (v: number | null, m: string, key: string, isTotal = false) => {
    const f = conditional?.[m];
    const cfm = f && (!isTotal || f.totals) ? cellFormat(f, v, stats.get(m)) : undefined;
    return <td key={key} className={['num', cfm?.className].filter(Boolean).join(' ')} style={cfm?.style}><CfIcon icon={cfm?.icon} />{formatNumber(v, fmt(m), lang)}</td>;
  };
  const cellsOf = (node: MatrixNode) => [
    ...colKeys.flatMap((tuple) => measures.map((m) => cell(num(node.cells.get(colKeyOf(tuple))?.[m]), m, `${colKeyOf(tuple)}|${m}`, node.children.length > 0))),
    ...(hasColumns && totals ? measures.map((m) => cell(num(node.rowTotal?.[m]), m, `total|${m}`, true)) : []),
  ];
  return (
    <div className="chart-table">
      <table className="table matrix">
        <thead>
          {Array.from({ length: hasColumns ? colLevels : 0 }, (_, level) => (
            <tr key={`col-${level}`}>
              {level === 0 && (
                <th scope="col" rowSpan={headerRows}>
                  {corner}
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
                  {corner}
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
                <th scope="row" style={{ '--level': node.level - 1 } as CSSProperties} className={pick?.onSelect && node.level === 1 ? 'chart-table__row--pick' : undefined}
                  onClick={pick?.onSelect && node.level === 1 ? () => pick.onSelect!(node.path[0]!) : undefined}
                  onContextMenu={pick?.onDrill && node.level === 1 ? (e) => { e.preventDefault(); pick.onDrill!(node.path[0]!); } : undefined}>
                  <span className="matrix__row-head">
                    {rowLevels > 1 && (parent
                      ? <button type="button" className="matrix__toggle" aria-expanded={isOpen} title={t(isOpen ? 'editor.collapseRow' : 'editor.expandRow', { name: node.label })} onClick={() => toggle(node.key)}>{isOpen ? <Minus size={12} aria-hidden /> : <Plus size={12} aria-hidden />}<span className="sr-only">{t(isOpen ? 'editor.collapseRow' : 'editor.expandRow', { name: node.label })}</span></button>
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
              {colKeys.flatMap((tuple) => measures.map((m) => cell(num(tree.colTotals.get(colKeyOf(tuple))?.[m]), m, `${colKeyOf(tuple)}|${m}`, true)))}
              {hasColumns && measures.map((m) => cell(num(tree.grand?.[m]), m, `grand|${m}`, true))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
