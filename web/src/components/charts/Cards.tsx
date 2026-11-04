import { useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { echarts } from './echarts';
import type { NumberFormat, QueryResult, Widget } from '@/api/types';
import { formatNumber } from '@/lib/format';
import { useTheme } from '@/store/theme';
import { useI18nStore, useT } from '@/i18n';
import { dimensionAliases, measureAliases, measureLabel, num, str } from './shape';
import { readChartTheme, sparklineOption } from './options';

interface Props { widget: Widget; result: QueryResult }

const fmtOf = (w: Widget): NumberFormat => w.options.numberFormat ?? 'auto';

/** One headline number and its label. */
export function KpiCard({ widget, result }: Props) {
  const lang = useI18nStore((s) => s.lang);
  const m = measureAliases(result)[0] ?? result.columns[0]?.alias;
  const value = m ? result.rows[0]?.[m] : undefined;
  return (
    <div className="kpi">
      <div className="kpi__value">{formatNumber(value, fmtOf(widget), lang)}</div>
      <div className="kpi__label">{(m && measureLabel(widget, m, lang)) ?? m}</div>
    </div>
  );
}

/**
 * Power BI's KPI: the latest value on the trend axis, how it moved against the previous period,
 * the target when there is one (a second measure or the option), and a sparkline of the whole series.
 */
export function TrendCard({ widget, result }: Props) {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const look = useTheme((s) => s.stamp);
  const fmt = fmtOf(widget);
  const [mv, mt] = measureAliases(result);
  const axis = dimensionAliases(result)[0];
  const rows = result.rows;
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const value = num(last?.[mv!]);
  const previous = num(prev?.[mv!]);
  const target = mt ? num(last?.[mt]) : typeof widget.options.target === 'number' ? widget.options.target : null;
  const delta = value !== null && previous !== null ? value - previous : null;
  const pct = delta !== null && previous ? delta / Math.abs(previous) : null;
  // like Power BI's KPI: the value is judged against the goal, the change by its direction
  const onTarget = target === null ? null : (value ?? 0) >= target;
  const rising = delta === null ? null : delta >= 0;
  const good = onTarget ?? rising ?? true;
  const option = useMemo(() => sparklineOption(rows.map((r) => num(r[mv!])), good, readChartTheme()),
    // the look stamp is a dependency so colours re-read when the theme, accent or palette changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, mv, good, look]);
  const Arrow = rising === false ? TrendingDown : TrendingUp;
  return (
    <div className="kpi kpi--trend">
      <div className="kpi__head">
        <div className={['kpi__value', onTarget === true && 'kpi__value--good', onTarget === false && 'kpi__value--bad'].filter(Boolean).join(' ')}>{formatNumber(value, fmt, lang)}</div>
        <div className="kpi__label">
          {(mv && measureLabel(widget, mv, lang)) ?? mv}{axis && last ? ` · ${str(last[axis])}` : ''}
          {target !== null && ` · ${t('editor.targetLabel', { value: formatNumber(target, fmt, lang) })}`}
        </div>
        {delta !== null && (
          <div className={['kpi__delta', rising ? 'kpi__delta--good' : 'kpi__delta--bad'].join(' ')}>
            <Arrow size={14} aria-hidden />
            <span>{delta > 0 ? '+' : ''}{formatNumber(delta, fmt, lang)}{pct !== null && ` (${pct > 0 ? '+' : ''}${formatNumber(pct, 'percent', lang)})`}</span>
            <span className="text-faint">{t('editor.vsPrevious')}</span>
          </div>
        )}
      </div>
      {rows.length > 1 && (
        <div className="kpi__spark" aria-hidden>
          <ReactEChartsCore echarts={echarts} option={option} notMerge lazyUpdate style={{ height: '100%', width: '100%' }} />
        </div>
      )}
    </div>
  );
}

/** Power BI's multi-row card: one small card per category, each listing every measure. */
export function MultiRowCard({ widget, result }: Props) {
  const lang = useI18nStore((s) => s.lang);
  const fmt = fmtOf(widget);
  const cat = dimensionAliases(result)[0];
  const measures = measureAliases(result);
  return (
    <div className="multirow">
      {result.rows.map((r, i) => (
        <article key={i} className="multirow__item">
          <div className="multirow__title truncate" title={cat ? str(r[cat]) : undefined}>{cat ? str(r[cat]) : ''}</div>
          <dl className="multirow__rows">
            {measures.map((m) => (
              <div key={m} className="multirow__row">
                <dt className="truncate">{measureLabel(widget, m, lang) ?? m}</dt>
                <dd>{formatNumber(r[m], fmt, lang)}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </div>
  );
}
