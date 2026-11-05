import { useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import type { EChartsOption } from 'echarts';
import { echarts } from './echarts';
import type { OrderBy, QueryResult, Widget } from '@/api/types';
import { useTheme } from '@/store/theme';
import { useI18nStore, useT } from '@/i18n';
import { ECHARTS_TYPES } from '@/lib/widget';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { buildOption, readChartTheme } from './options';
import { dimensionAliases, labelOthers, measureAliases, num, str } from './shape';
import { DEFAULT_MAP, listMaps, loadMap, matchRegions, type Matched } from './maps';
import { useQuery } from '@tanstack/react-query';
import { KpiCard, MultiRowCard, TrendCard } from './Cards';
import { DataTable, Matrix } from './Tables';
import './charts.css';

/** A paged table: which page is shown, how to move, which column the reader sorted by, and whether a next page exists. */
export interface Paging { index: number; setIndex: (i: number) => void; sort?: OrderBy; setSort: (s: OrderBy | undefined) => void; more: boolean }
/** What a click or a right-click on a mark means: the first dimension's value there. */
export interface Pick { onSelect?: (value: string) => void; onDrill?: (value: string) => void }
interface Props { widget: Widget; result: QueryResult; paging?: Paging; pick?: Pick }

/**
 * Draws one widget's result. ECharts types go through `options.ts`; cards and tables are HTML
 * (`Cards.tsx`, `Tables.tsx`). Everything reads the tokens at render time and again on the look stamp.
 */
export function ChartRenderer({ widget, result: raw, paging, pick }: Props) {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const look = useTheme((s) => s.stamp);
  const fmt = widget.options.numberFormat ?? 'auto';
  // Top N: the server's "others" row gets its word
  const result = useMemo(() => labelOthers(raw, t('editor.others')), [raw, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // a map: its boundaries load once and register with ECharts; the rows are matched to its regions
  const mapId = widget.type === 'map' ? widget.options.mapName || DEFAULT_MAP : null;
  const mapGeo = useQuery({ queryKey: ['map', mapId], queryFn: () => loadMap(mapId!), enabled: !!mapId, staleTime: Infinity, retry: false });
  const mapInfo = useQuery({ queryKey: ['maps'], queryFn: listMaps, enabled: !!mapId, staleTime: Infinity });
  const matched = useMemo<Matched | null>(() => {
    if (!mapId || !mapGeo.data) return null;
    const info = mapInfo.data?.find((m) => m.id === mapId);
    const nameProperty = widget.options.mapNameProperty || info?.nameProperty || 'name';
    const [dim] = dimensionAliases(result); const [m] = measureAliases(result);
    const rows = dim && m ? result.rows.map((r) => ({ name: str(r[dim]), value: num(r[m]) })) : [];
    return matchRegions(mapGeo.data, nameProperty, info?.properties ?? [], rows, widget.options.mapAliases);
  }, [mapId, mapGeo.data, mapInfo.data, result, widget.options.mapNameProperty, widget.options.mapAliases]);

  const option = useMemo<EChartsOption | null>(() => {
    if (!ECHARTS_TYPES.includes(widget.type) || result.rows.length === 0) return null;
    if (mapId && !matched) return null;
    const nameProperty = widget.options.mapNameProperty || mapInfo.data?.find((m) => m.id === mapId)?.nameProperty || 'name';
    return buildOption(widget, result, { theme: readChartTheme(), lang, fmt, map: mapId && matched ? { id: mapId, nameProperty, data: matched.data } : undefined });
    // the look stamp is a dependency so colours re-read when the theme, accent or palette changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget, result, fmt, lang, look, mapId, matched]);

  if (result.rows.length === 0) return <EmptyState compact title={t('editor.noData')} />;

  switch (widget.type) {
    case 'kpi': return <KpiCard widget={widget} result={result} />;
    case 'trend': return <TrendCard widget={widget} result={result} />;
    case 'multirow': return <MultiRowCard widget={widget} result={result} />;
    case 'table': return <DataTable widget={widget} result={result} paging={paging} pick={pick} />;
    case 'matrix': return <Matrix widget={widget} result={result} pick={pick} />;
    default: break;
  }

  if (mapId && mapGeo.error) return <EmptyState compact title={t('editor.mapMissing', { name: mapId })} />;
  if (mapId && !matched) return <Spinner block />;
  if (!option) return null;
  const note = matched && matched.unmatched.length > 0 ? t('editor.mapUnmatched', { count: matched.unmatched.length, names: matched.unmatched.slice(0, 5).join(', ') }) : null;
  // the category a mark stands for: its name on most series, the detail name on a scatter point
  const nameOf = (p: { name?: string; value?: unknown; seriesType?: string }) => (p.seriesType === 'scatter' && Array.isArray(p.value) ? String(p.value[3] ?? '') : String(p.name ?? ''));
  const events = pick?.onSelect || pick?.onDrill ? {
    click: (p: { name?: string; value?: unknown; seriesType?: string }) => { const v = nameOf(p); if (v && pick?.onSelect) pick.onSelect(v); },
    contextmenu: (p: { name?: string; value?: unknown; seriesType?: string; event?: { event?: Event } }) => { p.event?.event?.preventDefault(); const v = nameOf(p); if (v && pick?.onDrill) pick.onDrill(v); },
  } : undefined;
  const chart = <ReactEChartsCore echarts={echarts} option={option} notMerge lazyUpdate className={['chart-fill', pick?.onSelect && 'chart-fill--pick'].filter(Boolean).join(' ')} style={{ height: '100%', width: '100%' }} onEvents={events} />;
  if (!note) return chart;
  return <div className="chart-with-note">{chart}<p className="chart-note text-xs text-muted" title={matched!.unmatched.join(', ')}>{note}</p></div>;
}
