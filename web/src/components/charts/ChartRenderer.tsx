import { useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import type { EChartsOption } from 'echarts';
import { echarts } from './echarts';
import type { QueryResult, Widget } from '@/api/types';
import { formatAxis, formatCell, formatNumber } from '@/lib/format';
import { cssVar, useTheme } from '@/store/theme';
import { useI18nStore, useT } from '@/i18n';
import { CARTESIAN } from '@/lib/widget';
import { EmptyState } from '@/components/ui/Feedback';
import './charts.css';

interface Props { widget: Widget; result: QueryResult }

function palette(): string[] {
  return Array.from({ length: 8 }, (_, i) => cssVar(`--chart-${i + 1}`)).filter(Boolean);
}

/** rows -> { categories, series[] } honouring axis (dim 0) and legend (dim 1). */
function shape(result: QueryResult, widget: Widget) {
  const dims = result.columns.filter((c) => c.role === 'dimension').map((c) => c.alias);
  const measures = result.columns.filter((c) => c.role === 'measure').map((c) => c.alias);
  const axis = dims[0];
  const legend = dims[1];
  const categories = axis ? Array.from(new Set(result.rows.map((r) => String(r[axis] ?? '')))) : [''];
  const labelOf = (alias: string) => {
    const m = widget.query.measures.find((mm) => (mm.alias ?? `${mm.agg}_${mm.field === '*' ? 'all' : mm.field}`) === alias);
    return m ? `${m.agg.replace('_', ' ')}(${m.field})` : alias;
  };
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
  const theme = useTheme((s) => s.resolved);
  const fmt = widget.options.numberFormat ?? 'auto';

  const option = useMemo<EChartsOption | null>(() => {
    if (!CARTESIAN.includes(widget.type) && widget.type !== 'pie' && widget.type !== 'donut') return null;
    const colors = palette();
    const text = cssVar('--color-text-muted');
    const grid = cssVar('--chart-grid');
    const surface = cssVar('--color-surface');
    const border = cssVar('--color-border');
    const { categories, series, measures } = shape(result, widget);
    const horizontal = widget.type === 'bar';
    const showLegend = widget.options.legend !== false && (series.length > 1 || widget.type === 'pie' || widget.type === 'donut');
    const base: EChartsOption = {
      color: colors,
      animationDuration: 300,
      textStyle: { fontFamily: cssVar('--font-sans') },
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
          radius: widget.type === 'donut' ? ['45%', '72%'] : '72%',
          center: ['50%', showLegend ? '45%' : '50%'],
          itemStyle: { borderColor: surface, borderWidth: 2, borderRadius: 4 },
          label: { show: widget.options.showValues !== false, color: text, formatter: (p) => `${p.name}\n${formatNumber(p.value as number, fmt, lang)}` },
          data: categories.map((c, i) => ({ name: c, value: m ? Number(result.rows[i]?.[m] ?? 0) : 0 })),
        }],
      };
    }

    const categoryAxis = { type: 'category' as const, data: categories, axisLine: { lineStyle: { color: grid } }, axisTick: { show: false }, axisLabel: { color: text, hideOverlap: true } };
    const valueAxis = { type: 'value' as const, splitLine: { lineStyle: { color: grid } }, axisLabel: { color: text, formatter: (v: number) => formatAxis(v, lang) } };
    return {
      ...base,
      grid: { left: 8, right: 16, top: 16, bottom: showLegend ? 32 : 8, containLabel: true },
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? { ...categoryAxis, inverse: true } : valueAxis,
      series: series.map((s) => ({
        name: s.name,
        type: widget.type === 'line' || widget.type === 'area' ? 'line' : 'bar',
        data: s.data,
        smooth: widget.type === 'line' || widget.type === 'area' ? 0.2 : undefined,
        areaStyle: widget.type === 'area' ? { opacity: 0.18 } : undefined,
        stack: widget.options.stacked ? 'total' : undefined,
        barMaxWidth: 48,
        itemStyle: widget.type === 'column' || widget.type === 'bar' ? { borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] } : undefined,
        emphasis: { focus: 'series' },
        label: widget.options.showValues ? { show: true, position: horizontal ? 'right' : 'top', color: text, formatter: (p: { value?: unknown }) => formatAxis(p.value, lang) } : undefined,
      })),
    };
    // theme is a dependency so colours re-read when it flips
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget, result, fmt, lang, theme]);

  if (result.rows.length === 0) return <EmptyState compact title={t('editor.noData')} />;

  if (widget.type === 'kpi') {
    const m = result.columns.find((c) => c.role === 'measure')?.alias ?? result.columns[0]?.alias;
    const value = m ? result.rows[0]?.[m] : undefined;
    const measure = widget.query.measures[0];
    return (
      <div className="kpi" style={{ containerType: 'inline-size' }}>
        <div className="kpi__value">{formatNumber(value, fmt, lang)}</div>
        <div className="kpi__label">{measure ? `${t(`agg.${measure.agg}`)} · ${measure.field}` : m}</div>
      </div>
    );
  }

  if (widget.type === 'table') {
    const numeric = new Set(result.columns.filter((c) => c.role === 'measure' || typeof result.rows[0]?.[c.alias] === 'number').map((c) => c.alias));
    return (
      <div className="chart-table">
        <table className="table">
          <thead><tr>{result.columns.map((c) => <th key={c.alias} className={numeric.has(c.alias) ? 'num' : undefined}>{c.alias}</th>)}</tr></thead>
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
