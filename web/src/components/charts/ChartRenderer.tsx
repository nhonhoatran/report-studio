import { useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import type { EChartsOption } from 'echarts';
import { echarts } from './echarts';
import type { QueryResult, QueryResultColumn, Widget } from '@/api/types';
import { formatAxis, formatCell, formatNumber } from '@/lib/format';
import { cssPx, cssVar, useTheme } from '@/store/theme';
import { translate, useI18nStore, useT, type Lang } from '@/i18n';
import { CARTESIAN, dimensionAlias, measureAlias } from '@/lib/widget';
import { EmptyState } from '@/components/ui/Feedback';
import './charts.css';

interface Props { widget: Widget; result: QueryResult }

function palette(): string[] {
  return Array.from({ length: 8 }, (_, i) => cssVar(`--chart-${i + 1}`)).filter(Boolean);
}

// ECharts takes numbers: spacing comes from the tokens, the rest are named constants.
const BAR_MAX_WIDTH = 48;
const ANIMATION_MS = 300;
const PIE_RADIUS = { full: '72%', inner: '45%' };

/** "Tổng revenue" for a measure column, read from the widget's own wells; undefined for anything else. */
function measureLabel(widget: Widget, alias: string, lang: Lang): string | undefined {
  const m = widget.query.measures.find((mm) => measureAlias(mm) === alias);
  if (!m) return undefined;
  return `${translate(lang, `agg.${m.agg}`)} ${m.field === '*' ? '' : m.field}`.trim();
}

/** A column header a reader understands: the field (with its date bucket) or the measure label, never the SQL alias. */
function columnLabel(widget: Widget, c: QueryResultColumn, lang: Lang): string {
  if (c.role === 'measure') return measureLabel(widget, c.alias, lang) ?? c.alias;
  if (c.role === 'dimension') {
    const d = widget.query.dimensions.find((dd) => dimensionAlias(dd) === c.alias);
    if (!d) return c.alias;
    return d.bucket && d.bucket !== 'none' ? `${d.field} (${translate(lang, `bucket.${d.bucket}`)})` : d.field;
  }
  return c.alias;
}

/** rows -> { categories, series[] } honouring axis (dim 0) and legend (dim 1). */
function shape(result: QueryResult, widget: Widget, lang: Lang) {
  const dims = result.columns.filter((c) => c.role === 'dimension').map((c) => c.alias);
  const measures = result.columns.filter((c) => c.role === 'measure').map((c) => c.alias);
  const axis = dims[0];
  const legend = dims[1];
  const categories = axis ? Array.from(new Set(result.rows.map((r) => String(r[axis] ?? '')))) : [''];
  const labelOf = (alias: string) => measureLabel(widget, alias, lang) ?? alias;
  const series: { name: string; data: (number | null)[] }[] = [];
  if (legend && measures[0]) {
    const legendValues = Array.from(new Set(result.rows.map((r) => String(r[legend] ?? ''))));
    for (const lv of legendValues) {
      const data = categories.map((cat) => {
        const row = result.rows.find((r) => String(r[axis!] ?? '') === cat && String(r[legend] ?? '') === lv);
        return row ? Number(row[measures[0]!]) : null;
      });
      series.push({ name: lv, data });
    }
  } else {
    for (const m of measures) {
      series.push({ name: labelOf(m), data: categories.map((cat) => {
        const row = axis ? result.rows.find((r) => String(r[axis] ?? '') === cat) : result.rows[0];
        return row ? Number(row[m]) : null;
      }) });
    }
  }
  return { categories, series, axis, legend, measures };
}

export function ChartRenderer({ widget, result }: Props) {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const look = useTheme((s) => s.stamp);
  const fmt = widget.options.numberFormat ?? 'auto';

  const option = useMemo<EChartsOption | null>(() => {
    if (!CARTESIAN.includes(widget.type) && widget.type !== 'pie' && widget.type !== 'donut') return null;
    const colors = palette();
    const text = cssVar('--color-text-muted');
    const grid = cssVar('--chart-grid');
    const surface = cssVar('--color-surface');
    const border = cssVar('--color-border');
    const { categories, series, measures } = shape(result, widget, lang);
    const radiusSm = cssPx('--radius-sm', 4);
    const s2 = cssPx('--space-2', 8);
    const s4 = cssPx('--space-4', 16);
    const s7 = cssPx('--space-7', 32);
    const horizontal = widget.type === 'bar';
    const showLegend = widget.options.legend !== false && (series.length > 1 || widget.type === 'pie' || widget.type === 'donut');
    const base: EChartsOption = {
      color: colors,
      animationDuration: ANIMATION_MS,
      textStyle: { fontFamily: cssVar('--font-sans'), fontSize: 11 },
      tooltip: {
        trigger: widget.type === 'pie' || widget.type === 'donut' ? 'item' : 'axis',
        backgroundColor: surface, borderColor: border, textStyle: { color: cssVar('--color-text') },
        valueFormatter: (v) => formatNumber(v as number, fmt, lang),
      },
      legend: showLegend ? { bottom: 0, type: 'scroll', textStyle: { color: text } } : { show: false },
    };

    if (widget.type === 'pie' || widget.type === 'donut') {
      const m = measures[0];
      return {
        ...base,
        series: [{
          type: 'pie',
          radius: widget.type === 'donut' ? [PIE_RADIUS.inner, PIE_RADIUS.full] : PIE_RADIUS.full,
          center: ['50%', showLegend ? '45%' : '50%'],
          itemStyle: { borderColor: surface, borderWidth: 2, borderRadius: radiusSm },
          // labels only when asked for: the legend and the tooltip already name every slice
          label: { show: widget.options.showValues === true, color: text, formatter: (p) => `${p.name}\n${formatNumber(p.value as number, fmt, lang)}` },
          data: categories.map((c, i) => ({ name: c, value: m ? Number(result.rows[i]?.[m] ?? 0) : 0 })),
        }],
      };
    }

    const categoryAxis = { type: 'category' as const, data: categories, axisLine: { lineStyle: { color: grid } }, axisTick: { show: false }, axisLabel: { color: text, hideOverlap: true } };
    const valueAxis = { type: 'value' as const, splitLine: { lineStyle: { color: grid } }, axisLabel: { color: text, formatter: (v: number) => formatAxis(v, lang) } };
    return {
      ...base,
      grid: { left: s2, right: s4, top: s4, bottom: showLegend ? s7 : s2, containLabel: true },
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? { ...categoryAxis, inverse: true } : valueAxis,
      series: series.map((s) => ({
        name: s.name,
        type: widget.type === 'line' || widget.type === 'area' ? 'line' : 'bar',
        data: s.data,
        smooth: widget.type === 'line' || widget.type === 'area' ? 0.2 : undefined,
        areaStyle: widget.type === 'area' ? { opacity: 0.18 } : undefined,
        stack: widget.options.stacked ? 'total' : undefined,
        barMaxWidth: BAR_MAX_WIDTH,
        itemStyle: widget.type === 'column' || widget.type === 'bar' ? { borderRadius: horizontal ? [0, radiusSm, radiusSm, 0] : [radiusSm, radiusSm, 0, 0] } : undefined,
        emphasis: { focus: 'series' },
        label: widget.options.showValues ? { show: true, position: horizontal ? 'right' : 'top', color: text, formatter: (p: { value?: unknown }) => formatAxis(p.value, lang) } : undefined,
      })),
    };
    // the look stamp is a dependency so colours re-read when the theme, accent or palette changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget, result, fmt, lang, look]);

  if (result.rows.length === 0) return <EmptyState compact title={t('editor.noData')} />;

  if (widget.type === 'kpi') {
    const m = result.columns.find((c) => c.role === 'measure')?.alias ?? result.columns[0]?.alias;
    const value = m ? result.rows[0]?.[m] : undefined;
    const measure = widget.query.measures[0];
    return (
      <div className="kpi">
        <div className="kpi__value">{formatNumber(value, fmt, lang)}</div>
        <div className="kpi__label">{measure ? `${t(`agg.${measure.agg}`)} ${measure.field === '*' ? '' : measure.field}`.trim() : m}</div>
      </div>
    );
  }

  if (widget.type === 'table') {
    const numeric = new Set(result.columns.filter((c) => c.role === 'measure' || typeof result.rows[0]?.[c.alias] === 'number').map((c) => c.alias));
    return (
      <div className="chart-table">
        <table className="table">
          <thead><tr>{result.columns.map((c) => <th key={c.alias} className={numeric.has(c.alias) ? 'num' : undefined}>{columnLabel(widget, c, lang)}</th>)}</tr></thead>
          <tbody>
            {result.rows.map((r, i) => (
              <tr key={i}>{result.columns.map((c) => <td key={c.alias} className={numeric.has(c.alias) ? 'num' : undefined}>{numeric.has(c.alias) ? formatNumber(r[c.alias], fmt, lang) : formatCell(r[c.alias], lang)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!option) return null;
  return <ReactEChartsCore echarts={echarts} option={option} notMerge lazyUpdate className="chart-fill" style={{ height: '100%', width: '100%' }} />;
}
