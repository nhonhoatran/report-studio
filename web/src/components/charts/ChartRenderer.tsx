import { useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import type { EChartsOption } from 'echarts';
import { echarts } from './echarts';
import type { OrderBy, QueryResult, Widget } from '@/api/types';
import { useTheme } from '@/store/theme';
import { useI18nStore, useT } from '@/i18n';
import { ECHARTS_TYPES } from '@/lib/widget';
import { EmptyState } from '@/components/ui/Feedback';
import { buildOption, readChartTheme } from './options';
import { labelOthers } from './shape';
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

  const option = useMemo<EChartsOption | null>(() => {
    if (!ECHARTS_TYPES.includes(widget.type) || result.rows.length === 0) return null;
    return buildOption(widget, result, { theme: readChartTheme(), lang, fmt });
    // the look stamp is a dependency so colours re-read when the theme, accent or palette changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget, result, fmt, lang, look]);

  if (result.rows.length === 0) return <EmptyState compact title={t('editor.noData')} />;

  switch (widget.type) {
    case 'kpi': return <KpiCard widget={widget} result={result} />;
    case 'trend': return <TrendCard widget={widget} result={result} />;
    case 'multirow': return <MultiRowCard widget={widget} result={result} />;
    case 'table': return <DataTable widget={widget} result={result} paging={paging} pick={pick} />;
    case 'matrix': return <Matrix widget={widget} result={result} pick={pick} />;
    default: break;
  }

  if (!option) return null;
  // the category a mark stands for: its name on most series, the detail name on a scatter point
  const nameOf = (p: { name?: string; value?: unknown; seriesType?: string }) => (p.seriesType === 'scatter' && Array.isArray(p.value) ? String(p.value[3] ?? '') : String(p.name ?? ''));
  const events = pick?.onSelect || pick?.onDrill ? {
    click: (p: { name?: string; value?: unknown; seriesType?: string }) => { const v = nameOf(p); if (v && pick?.onSelect) pick.onSelect(v); },
    contextmenu: (p: { name?: string; value?: unknown; seriesType?: string; event?: { event?: Event } }) => { p.event?.event?.preventDefault(); const v = nameOf(p); if (v && pick?.onDrill) pick.onDrill(v); },
  } : undefined;
  return <ReactEChartsCore echarts={echarts} option={option} notMerge lazyUpdate className={['chart-fill', pick?.onSelect && 'chart-fill--pick'].filter(Boolean).join(' ')} style={{ height: '100%', width: '100%' }} onEvents={events} />;
}
