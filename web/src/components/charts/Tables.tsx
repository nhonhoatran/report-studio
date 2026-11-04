import { useMemo, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { NumberFormat, QueryResult, Widget } from '@/api/types';
import { formatCell, formatNumber } from '@/lib/format';
import { useI18nStore, useT } from '@/i18n';
import { canTotal, columnLabel, dimensionAliases, measureAgg, measureAliases, measureLabel, num, pivot, str, sum, type Row } from './shape';

interface Props { widget: Widget; result: QueryResult }

const fmtOf = (w: Widget): NumberFormat => w.options.numberFormat ?? 'auto';

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

/** The table visual: every column sortable from its header, optional totals row and data bars. */
export function DataTable({ widget, result }: Props) {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const fmt = fmtOf(widget);
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
  const totals = widget.options.showTotals
    ? measures.map((m) => (canTotal(measureAgg(widget, m)) ? sum(result.rows.map((r) => num(r[m]))) : null))
    : null;
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
                  {numeric.has(c.alias) ? formatNumber(r[c.alias], fmt, lang) : formatCell(r[c.alias], lang)}
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
                    {i === 0 && mi < 0 ? t('editor.total') : mi >= 0 ? formatNumber(totals[mi], fmt, lang) : ''}
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
 * Power BI's matrix: dim 0 down the rows, dim 1 across the columns, every measure in each cell.
 * Totals add up only the measures that can be added (sums and counts).
 */
export function Matrix({ widget, result }: Props) {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const fmt = fmtOf(widget);
  const pv = useMemo(() => pivot(result), [result]);
  const [rowDim, colDim] = dimensionAliases(result);
  const measures = measureAliases(result);
  const totals = widget.options.showTotals === true;
  const summable = measures.map((m) => canTotal(measureAgg(widget, m)));
  const rowDimLabel = rowDim ? columnLabel(widget, result.columns.find((c) => c.alias === rowDim)!, lang) : '';
  const label = (m: string) => measureLabel(widget, m, lang) ?? m;
  const cellValue = (row: string, col: string, m: string) => num(pv.cell(row, col)?.[m]);
  const rowTotal = (row: string, mi: number) => (summable[mi] ? sum(pv.colKeys.map((c) => cellValue(row, c, measures[mi]!))) : null);
  const colTotal = (col: string, mi: number) => (summable[mi] ? sum(pv.rowKeys.map((r) => cellValue(r, col, measures[mi]!))) : null);
  const grand = (mi: number) => (summable[mi] ? sum(pv.rowKeys.map((r) => rowTotal(r, mi))) : null);
  const colGroups = colDim ? [...pv.colKeys, ...(totals ? [t('editor.total')] : [])] : [''];
  const twoHeaderRows = !!colDim && measures.length > 1;
  const cell = (v: number | null, key: string) => <td key={key} className="num">{formatNumber(v, fmt, lang)}</td>;
  return (
    <div className="chart-table">
      <table className="table matrix">
        <thead>
          <tr>
            <th scope="col" rowSpan={twoHeaderRows ? 2 : 1}>{rowDimLabel}</th>
            {colDim
              ? colGroups.map((c) => <th key={c} scope="col" className="num" colSpan={measures.length}>{c}</th>)
              : measures.map((m) => <th key={m} scope="col" className="num">{label(m)}</th>)}
          </tr>
          {twoHeaderRows && (
            <tr>
              {colGroups.map((c) => measures.map((m) => <th key={`${c}|${m}`} scope="col" className="num">{label(m)}</th>))}
            </tr>
          )}
        </thead>
        <tbody>
          {pv.rowKeys.map((row) => (
            <tr key={row}>
              <th scope="row">{row}</th>
              {colDim
                ? pv.colKeys.map((col) => measures.map((m) => cell(cellValue(row, col, m), `${col}|${m}`)))
                : measures.map((m) => cell(cellValue(row, '', m), m))}
              {colDim && totals && measures.map((m, mi) => cell(rowTotal(row, mi), `total|${m}`))}
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr>
              <th scope="row">{t('editor.total')}</th>
              {colDim
                ? pv.colKeys.map((col) => measures.map((m, mi) => cell(colTotal(col, mi), `${col}|${m}`)))
                : measures.map((m, mi) => cell(colTotal('', mi), m))}
              {colDim && measures.map((m, mi) => cell(grand(mi), `grand|${m}`))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
