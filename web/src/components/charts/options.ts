import type { EChartsOption, SeriesOption } from 'echarts';
import type { LegendPosition, NumberFormat, QueryResult, Widget } from '@/api/types';
import { formatAxis, formatNumber } from '@/lib/format';
import { translate, type Lang, type TKey, type TParams } from '@/i18n';
import { comboRole, measureAlias } from '@/lib/widget';
import { cssPx, cssVar } from '@/store/theme';
import { dimensionAliases, measureAliases, measureLabel, niceCeil, num, shape, str, toShares, type Row, type Shaped } from './shape';

/*
 * One ECharts option per visual type. Every colour, size and spacing is read from the tokens
 * at call time (readChartTheme), so a chart follows the user's look; what ECharts needs as a
 * number and the tokens do not name is a named constant below.
 */

export interface ChartTheme {
  colors: string[]; text: string; faint: string; grid: string; surface: string; border: string; font: string;
  fontSize: number; fontSizeLg: number;
  success: string; danger: string;
  radiusSm: number; s1: number; s2: number; s3: number; s4: number; s6: number; s7: number;
}

export function readChartTheme(): ChartTheme {
  return {
    colors: Array.from({ length: 8 }, (_, i) => cssVar(`--chart-${i + 1}`)).filter(Boolean),
    text: cssVar('--color-text-muted'), faint: cssVar('--color-text-faint'), grid: cssVar('--chart-grid'),
    surface: cssVar('--color-surface'), border: cssVar('--color-border'), font: cssVar('--font-sans'),
    fontSize: cssPx('--text-xs', 11), fontSizeLg: cssPx('--text-xl', 20),
    success: cssVar('--color-success'), danger: cssVar('--color-danger'),
    radiusSm: cssPx('--radius-sm', 4), s1: cssPx('--space-1', 4), s2: cssPx('--space-2', 8), s3: cssPx('--space-3', 12),
    s4: cssPx('--space-4', 16), s6: cssPx('--space-6', 24), s7: cssPx('--space-7', 32),
  };
}

export interface ChartContext { theme: ChartTheme; lang: Lang; fmt: NumberFormat }

// ECharts takes numbers and percent strings: spacing comes from the tokens, the rest are named constants.
const ANIMATION_MS = 300;
const BAR_MAX_WIDTH = 48;
const LINE_SMOOTHNESS = 0.2;
const AREA_FILL_OPACITY = 0.18;
const SLICE_GAP = 2;
const PIE_RADIUS = { full: '72%', inner: '45%' };
const FUNNEL_INSET = '8%';
const FUNNEL_MIN_SIZE = '12%';
const LEGEND_SIDE_WIDTH = '24%';
const BUBBLE_SIZE = { min: 6, max: 40, plain: 10 };
const HEAT_LOW_MIX = 0.85;
const RADAR_RADIUS = '65%';
const RADAR_HEADROOM = 1.1;
const RADAR_SPLIT = 5;
/** ECharts aligns every indicator to RADAR_SPLIT rings, so the bound is a readable interval (1, 2, 3, 5 × 10^k) times the ring count. */
const RADAR_STEPS = [1, 2, 3, 5, 10];
/** the weight base.css gives headings and the KPI value; ECharts needs it as a number */
const HEADLINE_WEIGHT = 600;
const GAUGE = { startAngle: 200, endAngle: -20, width: 14, valueOffset: '-10%', titleOffset: '24%', markLength: '14%', markWidth: 3, markOffset: '-88%' };
const TREEMAP_SATURATION: [number, number] = [0.35, 0.6];
const MARK_LINE_DASH: [number, number] = [4, 4];

interface TipParam { name: string; seriesName: string; value: unknown; marker: string; data: unknown; dataIndex: number }
const asParams = (p: unknown): TipParam[] => (Array.isArray(p) ? p : [p]) as TipParam[];

const t = (lang: Lang, key: TKey, params?: TParams) => translate(lang, key, params);

/** Blend two hex colours (`t` = 0 → a, 1 → b); the heat map's pale end comes from the surface. */
function mixHex(a: string, b: string, t: number): string {
  const parse = (h: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
    if (!m) return null;
    const n = parseInt(m[1]!, 16);
    return [n >> 16, (n >> 8) & 255, n & 255] as const;
  };
  const ca = parse(a); const cb = parse(b);
  if (!ca || !cb) return a;
  const c = ca.map((v, i) => Math.round(v + (cb[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function legendOption(show: boolean, pos: LegendPosition, th: ChartTheme): EChartsOption['legend'] {
  if (!show) return { show: false };
  const common = { type: 'scroll' as const, textStyle: { color: th.text }, itemWidth: th.s3, itemHeight: th.s2, pageTextStyle: { color: th.text } };
  if (pos === 'top') return { ...common, top: 0 };
  if (pos === 'right') return { ...common, right: 0, top: 'middle', orient: 'vertical' };
  return { ...common, bottom: 0 };
}

function gridOption(show: boolean, pos: LegendPosition, th: ChartTheme, extraBottom = 0): EChartsOption['grid'] {
  return {
    left: th.s2,
    right: show && pos === 'right' ? LEGEND_SIDE_WIDTH : th.s4,
    top: show && pos === 'top' ? th.s7 : th.s4,
    bottom: (show && pos === 'bottom' ? th.s7 : th.s2) + extraBottom,
    containLabel: true,
  };
}

function base(widget: Widget, ctx: ChartContext, showLegend: boolean, trigger: 'axis' | 'item'): EChartsOption {
  const { theme: th, fmt, lang } = ctx;
  return {
    color: th.colors,
    animationDuration: ANIMATION_MS,
    textStyle: { fontFamily: th.font, fontSize: th.fontSize },
    tooltip: {
      trigger,
      backgroundColor: th.surface, borderColor: th.border, textStyle: { color: cssVar('--color-text') },
      valueFormatter: (v) => formatNumber(v as number, fmt, lang),
    },
    legend: legendOption(showLegend, widget.options.legendPosition ?? 'bottom', th),
  };
}

const legendPos = (w: Widget) => w.options.legendPosition ?? 'bottom';
const stackingOf = (w: Widget) => w.options.stacking ?? (w.options.stacked ? 'stacked' : 'none');

/** Reference and average lines on the first series (cartesian analytics). */
function markLine(widget: Widget, ctx: ChartContext, horizontal: boolean) {
  const data: Record<string, unknown>[] = [];
  const ref = widget.options.referenceLine;
  if (typeof ref === 'number' && Number.isFinite(ref)) data.push(horizontal ? { xAxis: ref } : { yAxis: ref });
  if (widget.options.averageLine) data.push({ type: 'average' });
  if (!data.length) return undefined;
  return {
    symbol: 'none', silent: true,
    lineStyle: { color: ctx.theme.text, type: MARK_LINE_DASH },
    label: { color: ctx.theme.text, formatter: (p: { value?: unknown }) => formatAxis(p.value, ctx.lang), position: horizontal ? 'end' as const : 'insideEndTop' as const },
    data,
  };
}

function categoryAxis(data: string[], th: ChartTheme) {
  return { type: 'category' as const, data, axisLine: { lineStyle: { color: th.grid } }, axisTick: { show: false }, axisLabel: { color: th.text, hideOverlap: true } };
}
function valueAxis(ctx: ChartContext, percent = false) {
  return {
    type: 'value' as const, splitLine: { lineStyle: { color: ctx.theme.grid } },
    ...(percent ? { max: 1 } : {}),
    axisLabel: { color: ctx.theme.text, formatter: (v: number) => (percent ? formatNumber(v, 'percent', ctx.lang) : formatAxis(v, ctx.lang)) },
  };
}

// --- cartesian: column, bar, line, area ---------------------------------------------------------

function cartesian(widget: Widget, result: QueryResult, ctx: ChartContext): EChartsOption {
  const { theme: th, lang } = ctx;
  const shaped = shape(result, widget, lang);
  const stacking = stackingOf(widget);
  const percent = stacking === 'percent';
  const series = percent ? toShares(shaped.series) : shaped.series;
  const horizontal = widget.type === 'bar';
  const isLine = widget.type === 'line' || widget.type === 'area';
  const showLegend = widget.options.legend !== false && series.length > 1;
  const pos = legendPos(widget);
  const valueFmt = (v: unknown) => (percent ? formatNumber(v, 'percent', lang) : formatAxis(v, lang));
  const option = base(widget, ctx, showLegend, 'axis');
  if (percent) option.tooltip = { ...(option.tooltip as object), valueFormatter: (v) => formatNumber(v as number, 'percent', lang) };
  const cat = categoryAxis(shaped.categories, th);
  const val = valueAxis(ctx, percent);
  return {
    ...option,
    grid: gridOption(showLegend, pos, th),
    xAxis: horizontal ? val : cat,
    yAxis: horizontal ? { ...cat, inverse: true } : val,
    series: series.map((s, i): SeriesOption => ({
      name: s.name,
      type: isLine ? 'line' : 'bar',
      data: s.data,
      smooth: isLine ? LINE_SMOOTHNESS : undefined,
      areaStyle: widget.type === 'area' ? { opacity: AREA_FILL_OPACITY } : undefined,
      stack: stacking !== 'none' ? 'total' : undefined,
      barMaxWidth: BAR_MAX_WIDTH,
      itemStyle: !isLine && stacking === 'none' ? { borderRadius: horizontal ? [0, th.radiusSm, th.radiusSm, 0] : [th.radiusSm, th.radiusSm, 0, 0] } : undefined,
      emphasis: { focus: 'series' },
      label: widget.options.showValues ? { show: true, position: stacking !== 'none' ? 'inside' : horizontal ? 'right' : 'top', color: stacking !== 'none' ? cssVar('--color-text') : th.text, formatter: (p: { value?: unknown }) => valueFmt(p.value) } : undefined,
      markLine: i === 0 ? markLine(widget, ctx, horizontal) : undefined,
    } as SeriesOption)),
  };
}

// --- combo: columns on the left axis, lines on the right one ------------------------------------

function combo(widget: Widget, result: QueryResult, ctx: ChartContext): EChartsOption {
  const { theme: th, lang } = ctx;
  const shaped = shape(result, widget, lang);
  const measures = widget.query.measures;
  const roleOf = (alias: string) => comboRole(measures, measures.findIndex((m) => measureAlias(m) === alias));
  const hasLine = shaped.series.some((s) => roleOf(s.alias) === 'line');
  const hasColumn = shaped.series.some((s) => roleOf(s.alias) === 'column');
  const showLegend = widget.options.legend !== false && shaped.series.length > 1;
  const pos = legendPos(widget);
  const val = valueAxis(ctx);
  return {
    ...base(widget, ctx, showLegend, 'axis'),
    grid: gridOption(showLegend, pos, th),
    xAxis: categoryAxis(shaped.categories, th),
    yAxis: hasLine && hasColumn ? [val, { ...val, splitLine: { show: false } }] : val,
    series: shaped.series.map((s, i): SeriesOption => {
      const line = roleOf(s.alias) === 'line';
      return {
        name: s.name,
        type: line ? 'line' : 'bar',
        yAxisIndex: line && hasColumn ? 1 : 0,
        data: s.data,
        smooth: line ? LINE_SMOOTHNESS : undefined,
        barMaxWidth: BAR_MAX_WIDTH,
        itemStyle: line ? undefined : { borderRadius: [th.radiusSm, th.radiusSm, 0, 0] },
        emphasis: { focus: 'series' },
        label: widget.options.showValues ? { show: true, position: 'top', color: th.text, formatter: (p: { value?: unknown }) => formatAxis(p.value, lang) } : undefined,
        markLine: i === 0 ? markLine(widget, ctx, false) : undefined,
      } as SeriesOption;
    }),
  };
}

// --- waterfall: running total, increases and decreases coloured, a closing total ---------------

function waterfall(widget: Widget, result: QueryResult, ctx: ChartContext): EChartsOption {
  const { theme: th, lang, fmt } = ctx;
  const shaped = shape(result, widget, lang);
  const deltas = shaped.series[0]?.data ?? [];
  const categories = [...shaped.categories, t(lang, 'editor.total')];
  const baseData: number[] = []; const up: (number | null)[] = []; const down: (number | null)[] = []; const total: (number | null)[] = [];
  let running = 0;
  for (const d of deltas) {
    const v = d ?? 0;
    if (v >= 0) { baseData.push(running); up.push(v); down.push(null); } else { baseData.push(running + v); up.push(null); down.push(-v); }
    total.push(null);
    running += v;
  }
  baseData.push(Math.min(0, running)); up.push(null); down.push(null); total.push(Math.abs(running));
  const showLegend = widget.options.legend !== false;
  const pos = legendPos(widget);
  const option = base(widget, ctx, showLegend, 'axis');
  const names = { base: '__base', up: t(lang, 'editor.increase'), down: t(lang, 'editor.decrease'), total: t(lang, 'editor.total') };
  option.tooltip = {
    ...(option.tooltip as object),
    formatter: (p: unknown) => {
      const params = asParams(p).filter((x) => x.seriesName !== names.base && x.value !== null && x.value !== undefined && x.value !== '-');
      if (!params.length) return '';
      const idx = params[0]!.dataIndex;
      const sign = params[0]!.seriesName === names.down ? '−' : params[0]!.seriesName === names.up ? '+' : '';
      const lines = params.map((x) => `${x.marker} ${x.seriesName}: ${sign}${formatNumber(x.value, fmt, lang)}`);
      const runningTotal = idx < deltas.length ? deltas.slice(0, idx + 1).reduce<number>((acc, d) => acc + (d ?? 0), 0) : running;
      return `${categories[idx]}<br/>${lines.join('<br/>')}<br/>${names.total}: ${formatNumber(runningTotal, fmt, lang)}`;
    },
  };
  const bar = (name: string, data: (number | null)[], color: string): SeriesOption => ({
    name, type: 'bar', stack: 'wf', data, barMaxWidth: BAR_MAX_WIDTH,
    itemStyle: { color, borderRadius: [th.radiusSm, th.radiusSm, 0, 0] },
    label: widget.options.showValues ? { show: true, position: 'top', color: th.text, formatter: (p: { value?: unknown }) => (p.value === null || p.value === undefined ? '' : formatAxis(p.value, lang)) } : undefined,
  } as SeriesOption);
  return {
    ...option,
    legend: showLegend ? { ...(option.legend as object), data: [names.up, names.down, names.total] } : option.legend,
    grid: gridOption(showLegend, pos, th),
    xAxis: categoryAxis(categories, th),
    yAxis: valueAxis(ctx),
    series: [
      { name: names.base, type: 'bar', stack: 'wf', data: baseData, barMaxWidth: BAR_MAX_WIDTH, silent: true, itemStyle: { color: 'transparent' }, emphasis: { disabled: true } } as SeriesOption,
      bar(names.up, up, th.success),
      bar(names.down, down, th.danger),
      bar(names.total, total, th.colors[0] ?? th.text),
    ],
  };
}

// --- part-to-whole: pie, donut, funnel ------------------------------------------------------------

function pie(widget: Widget, result: QueryResult, ctx: ChartContext): EChartsOption {
  const { theme: th, lang, fmt } = ctx;
  const shaped = shape(result, widget, lang);
  const values = shaped.series[0]?.data ?? [];
  const showLegend = widget.options.legend !== false;
  const pos = legendPos(widget);
  const center = !showLegend ? ['50%', '50%'] : pos === 'right' ? ['40%', '50%'] : pos === 'top' ? ['50%', '55%'] : ['50%', '45%'];
  return {
    ...base(widget, ctx, showLegend, 'item'),
    series: [{
      type: 'pie',
      radius: widget.type === 'donut' ? [PIE_RADIUS.inner, PIE_RADIUS.full] : PIE_RADIUS.full,
      center,
      itemStyle: { borderColor: th.surface, borderWidth: SLICE_GAP, borderRadius: th.radiusSm },
      // labels only when asked for: the legend and the tooltip already name every slice
      label: { show: widget.options.showValues === true, color: th.text, formatter: (p) => `${p.name}\n${formatNumber(p.value as number, fmt, lang)}` },
      data: shaped.categories.map((c, i) => ({ name: c, value: values[i] ?? 0 })),
    }],
  };
}

function funnel(widget: Widget, result: QueryResult, ctx: ChartContext): EChartsOption {
  const { theme: th, lang, fmt } = ctx;
  const shaped = shape(result, widget, lang);
  const values = shaped.series[0]?.data ?? [];
  const showLegend = widget.options.legend !== false;
  const pos = legendPos(widget);
  return {
    ...base(widget, ctx, showLegend, 'item'),
    series: [{
      type: 'funnel',
      left: FUNNEL_INSET, right: showLegend && pos === 'right' ? LEGEND_SIDE_WIDTH : FUNNEL_INSET,
      top: showLegend && pos === 'top' ? th.s7 : th.s2, bottom: showLegend && pos === 'bottom' ? th.s7 : th.s2,
      gap: SLICE_GAP, minSize: FUNNEL_MIN_SIZE,
      // the query's own order wins when the author sorted; otherwise widest stage first
      sort: widget.options.sortBy && widget.options.sortBy !== 'none' ? 'none' : 'descending',
      itemStyle: { borderColor: th.surface, borderWidth: SLICE_GAP },
      label: { show: true, position: 'inside', color: cssVar('--color-text'), formatter: (p) => (widget.options.showValues ? `${p.name}\n${formatNumber(p.value as number, fmt, lang)}` : p.name) },
      data: shaped.categories.map((c, i) => ({ name: c, value: values[i] ?? 0 })),
    }],
  };
}

// --- relation: scatter / bubble, heat map, radar ----------------------------------------------------

function scatter(widget: Widget, result: QueryResult, ctx: ChartContext): EChartsOption {
  const { theme: th, lang, fmt } = ctx;
  const [detail, legend] = dimensionAliases(result);
  const [mx, my, msize] = measureAliases(result);
  const label = (alias: string | undefined) => (alias ? measureLabel(widget, alias, lang) ?? alias : '');
  const groups = new Map<string, Row[]>();
  for (const r of result.rows) {
    const g = legend ? str(r[legend]) : label(my);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(r);
  }
  const sizes = msize ? result.rows.map((r) => num(r[msize]) ?? 0) : [];
  const sizeMax = Math.max(...sizes, 0);
  const symbolSize = (p: unknown) => {
    if (!msize || !sizeMax) return BUBBLE_SIZE.plain;
    const v = (p as unknown[])[2] as number;
    return BUBBLE_SIZE.min + Math.sqrt(Math.max(v, 0) / sizeMax) * (BUBBLE_SIZE.max - BUBBLE_SIZE.min);
  };
  const showLegend = widget.options.legend !== false && !!legend && groups.size > 1;
  const pos = legendPos(widget);
  const option = base(widget, ctx, showLegend, 'item');
  option.tooltip = {
    ...(option.tooltip as object),
    formatter: (p: unknown) => {
      const [x, y, size, name] = (asParams(p)[0]!.value as unknown[]);
      const lines = [`${label(mx)}: ${formatNumber(x, fmt, lang)}`, `${label(my)}: ${formatNumber(y, fmt, lang)}`];
      if (msize) lines.push(`${label(msize)}: ${formatNumber(size, fmt, lang)}`);
      return `<b>${str(name)}</b><br/>${lines.join('<br/>')}`;
    },
  };
  const axis = (name: string) => ({ ...valueAxis(ctx), name, nameLocation: 'middle' as const, nameGap: th.s7, nameTextStyle: { color: th.text }, scale: true });
  return {
    ...option,
    grid: { ...(gridOption(showLegend, pos, th) as object), left: th.s4, bottom: (showLegend && pos === 'bottom' ? th.s7 : th.s2) + th.s6 },
    xAxis: axis(label(mx)),
    yAxis: axis(label(my)),
    series: Array.from(groups, ([name, rows]): SeriesOption => ({
      name, type: 'scatter', symbolSize,
      data: rows.map((r) => [num(r[mx!]) ?? 0, num(r[my!]) ?? 0, msize ? num(r[msize]) ?? 0 : 0, detail ? str(r[detail]) : name]),
      itemStyle: { opacity: 0.85 },
      emphasis: { focus: 'series' },
      label: widget.options.showValues ? { show: true, position: 'top', color: th.text, formatter: (p: { value?: unknown }) => str((p.value as unknown[])[3]) } : undefined,
    } as SeriesOption)),
  };
}

function heatmap(widget: Widget, result: QueryResult, ctx: ChartContext): EChartsOption {
  const { theme: th, lang, fmt } = ctx;
  const [dx, dy] = dimensionAliases(result);
  const [m] = measureAliases(result);
  const xs = Array.from(new Set(result.rows.map((r) => str(r[dx!]))));
  const ys = Array.from(new Set(result.rows.map((r) => str(r[dy!]))));
  const data = result.rows.map((r) => [xs.indexOf(str(r[dx!])), ys.indexOf(str(r[dy!])), num(r[m!])]);
  const values = data.map((d) => d[2]).filter((v): v is number => v !== null);
  const min = Math.min(...values, 0); const max = Math.max(...values, 0);
  const showScale = widget.options.legend !== false;
  const high = th.colors[0] ?? th.text;
  const option = base(widget, ctx, false, 'item');
  option.tooltip = {
    ...(option.tooltip as object),
    formatter: (p: unknown) => {
      const [xi, yi, v] = asParams(p)[0]!.value as [number, number, number | null];
      return `${xs[xi]} · ${ys[yi]}<br/>${measureLabel(widget, m!, lang) ?? m}: ${formatNumber(v, fmt, lang)}`;
    },
  };
  return {
    ...option,
    grid: { left: th.s2, right: th.s4, top: th.s4, bottom: showScale ? th.s7 + th.s4 : th.s2, containLabel: true },
    xAxis: { ...categoryAxis(xs, th), splitArea: { show: true } },
    yAxis: { ...categoryAxis(ys, th), splitArea: { show: true }, inverse: true },
    visualMap: {
      show: showScale, min, max, calculable: false, orient: 'horizontal', left: 'center', bottom: 0,
      text: [formatAxis(max, lang), formatAxis(min, lang)],
      itemHeight: th.s7 * 3, itemWidth: th.s3, textStyle: { color: th.text },
      formatter: (v: unknown) => formatAxis(v, lang),
      inRange: { color: [mixHex(high, th.surface, HEAT_LOW_MIX), high] },
    },
    series: [{
      type: 'heatmap', data,
      itemStyle: { borderColor: th.surface, borderWidth: 1 },
      label: { show: widget.options.showValues === true, color: cssVar('--color-text'), formatter: (p) => formatAxis((p.value as unknown[])[2], lang) },
      emphasis: { itemStyle: { borderColor: th.text } },
    }],
  };
}

function radar(widget: Widget, result: QueryResult, ctx: ChartContext): EChartsOption {
  const { theme: th, lang } = ctx;
  const shaped = shape(result, widget, lang);
  const raw = Math.max(...shaped.series.flatMap((s) => s.data.map((v) => v ?? 0)), 0) * RADAR_HEADROOM;
  const max = niceCeil(raw / RADAR_SPLIT, RADAR_STEPS) * RADAR_SPLIT;
  const showLegend = widget.options.legend !== false && shaped.series.length > 1;
  const pos = legendPos(widget);
  return {
    ...base(widget, ctx, showLegend, 'item'),
    radar: {
      indicator: shaped.categories.map((name) => ({ name, max })),
      radius: RADAR_RADIUS, splitNumber: RADAR_SPLIT,
      center: [showLegend && pos === 'right' ? '40%' : '50%', showLegend && pos === 'top' ? '56%' : showLegend && pos === 'bottom' ? '46%' : '50%'],
      axisName: { color: th.text },
      axisLine: { lineStyle: { color: th.grid } },
      splitLine: { lineStyle: { color: th.grid } },
      splitArea: { show: false },
    },
    series: [{
      type: 'radar',
      symbolSize: th.s1,
      areaStyle: { opacity: AREA_FILL_OPACITY },
      lineStyle: { width: 2 },
      label: { show: widget.options.showValues === true, color: th.text, formatter: (p) => formatAxis(p.value, lang) },
      emphasis: { focus: 'series' },
      data: shaped.series.map((s) => ({ name: s.name, value: s.data.map((v) => v ?? 0) })),
    }],
  };
}

// --- single value: gauge --------------------------------------------------------------------------

function gauge(widget: Widget, result: QueryResult, ctx: ChartContext): EChartsOption {
  const { theme: th, lang, fmt } = ctx;
  const [mv, mt] = measureAliases(result);
  const row = result.rows[0] ?? {};
  const value = num(row[mv!]) ?? 0;
  const target = mt ? num(row[mt]) : typeof widget.options.target === 'number' ? widget.options.target : null;
  const min = widget.options.gaugeMin ?? 0;
  const max = widget.options.gaugeMax ?? niceCeil(Math.max(value, target ?? 0) || 1);
  const reached = target === null || value >= target;
  const common = { type: 'gauge' as const, startAngle: GAUGE.startAngle, endAngle: GAUGE.endAngle, min, max, radius: '100%', center: ['50%', '60%'] };
  const series: SeriesOption[] = [{
    ...common,
    progress: { show: true, width: GAUGE.width, roundCap: true, itemStyle: { color: target === null ? th.colors[0] : reached ? th.success : th.colors[0] } },
    axisLine: { roundCap: true, lineStyle: { width: GAUGE.width, color: [[1, th.grid]] } },
    axisTick: { show: false }, splitLine: { show: false },
    splitNumber: 1,
    axisLabel: { color: th.text, distance: -th.s7, formatter: (v: number) => formatAxis(v, lang) },
    pointer: { show: false }, anchor: { show: false },
    title: { show: target !== null && widget.options.showValues !== false, offsetCenter: [0, GAUGE.titleOffset], color: th.text, fontSize: th.fontSize },
    detail: { valueAnimation: true, offsetCenter: [0, GAUGE.valueOffset], color: cssVar('--color-text'), fontSize: th.fontSizeLg, fontWeight: HEADLINE_WEIGHT, formatter: (v: number) => formatNumber(v, fmt, lang) },
    data: [{ value, name: target === null ? '' : t(lang, 'editor.targetLabel', { value: formatNumber(target, fmt, lang) }) }],
  } as SeriesOption];
  if (target !== null) {
    series.push({
      ...common,
      axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
      progress: { show: false }, detail: { show: false }, title: { show: false },
      pointer: { show: true, icon: 'rect', length: GAUGE.markLength, width: GAUGE.markWidth, offsetCenter: [0, GAUGE.markOffset], itemStyle: { color: reached ? th.success : th.danger } },
      data: [{ value: Math.min(Math.max(target, min), max) }],
    } as SeriesOption);
  }
  return { ...base(widget, ctx, false, 'item'), tooltip: { show: false }, series };
}

// --- treemap ------------------------------------------------------------------------------------

function treemap(widget: Widget, result: QueryResult, ctx: ChartContext): EChartsOption {
  const { theme: th, lang, fmt } = ctx;
  const [dg, dd] = dimensionAliases(result);
  const [m] = measureAliases(result);
  type Node = { name: string; value: number; children?: Node[] };
  let data: Node[];
  if (dd) {
    const groups = new Map<string, Node>();
    for (const r of result.rows) {
      const g = str(r[dg!]);
      const v = num(r[m!]) ?? 0;
      if (!groups.has(g)) groups.set(g, { name: g, value: 0, children: [] });
      const node = groups.get(g)!;
      node.children!.push({ name: str(r[dd]), value: v });
      node.value += v;
    }
    data = Array.from(groups.values());
  } else {
    data = result.rows.map((r) => ({ name: str(r[dg!]), value: num(r[m!]) ?? 0 }));
  }
  const label = (p: { name: string; value: unknown }) => (widget.options.showValues ? `${p.name}\n${formatNumber(p.value as number, fmt, lang)}` : p.name);
  return {
    ...base(widget, ctx, false, 'item'),
    tooltip: { ...(base(widget, ctx, false, 'item').tooltip as object), formatter: (p: unknown) => { const x = asParams(p)[0]!; return `${x.name}: ${formatNumber(x.value, fmt, lang)}`; } },
    series: [{
      type: 'treemap', data,
      left: 0, right: 0, top: 0, bottom: 0,
      roam: false, nodeClick: false, breadcrumb: { show: false },
      itemStyle: { borderColor: th.surface, borderWidth: SLICE_GAP, gapWidth: SLICE_GAP },
      label: { show: true, color: cssVar('--color-text'), formatter: label },
      upperLabel: dd ? { show: true, height: th.s6, color: cssVar('--color-text'), formatter: label } : { show: false },
      levels: dd
        ? [
          { itemStyle: { borderWidth: 0, gapWidth: th.s1 }, upperLabel: { show: false } },
          { color: th.colors, itemStyle: { borderColor: th.surface, borderWidth: SLICE_GAP, gapWidth: SLICE_GAP } },
          { colorSaturation: TREEMAP_SATURATION, itemStyle: { gapWidth: 1, borderColorSaturation: TREEMAP_SATURATION[1] } },
        ]
        : [{ color: th.colors, itemStyle: { borderColor: th.surface, borderWidth: SLICE_GAP, gapWidth: SLICE_GAP } }],
    }],
  };
}

// --- the sparkline inside a KPI card ----------------------------------------------------------------

export function sparklineOption(values: (number | null)[], good: boolean, th: ChartTheme): EChartsOption {
  const color = good ? th.success : th.danger;
  return {
    animationDuration: ANIMATION_MS,
    grid: { left: 0, right: 0, top: th.s1, bottom: 0 },
    xAxis: { type: 'category', show: false, data: values.map((_, i) => String(i)) },
    yAxis: { type: 'value', show: false, scale: true },
    tooltip: { show: false },
    series: [{ type: 'line', data: values, smooth: LINE_SMOOTHNESS, symbol: 'none', lineStyle: { color, width: 2 }, areaStyle: { color, opacity: AREA_FILL_OPACITY } }],
  };
}

/** The ECharts option for a widget, or null for the HTML visuals (cards, tables). */
export function buildOption(widget: Widget, result: QueryResult, ctx: ChartContext): EChartsOption | null {
  switch (widget.type) {
    case 'column': case 'bar': case 'line': case 'area': return cartesian(widget, result, ctx);
    case 'combo': return combo(widget, result, ctx);
    case 'waterfall': return waterfall(widget, result, ctx);
    case 'pie': case 'donut': return pie(widget, result, ctx);
    case 'funnel': return funnel(widget, result, ctx);
    case 'scatter': return scatter(widget, result, ctx);
    case 'heatmap': return heatmap(widget, result, ctx);
    case 'radar': return radar(widget, result, ctx);
    case 'gauge': return gauge(widget, result, ctx);
    case 'treemap': return treemap(widget, result, ctx);
    default: return null;
  }
}

export type { Shaped };
