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
interface Props { widget: Widget; result: QueryResult; paging?: Paging }

/**
 * Draws one widget's result. ECharts types go through `options.ts`; cards and tables are HTML
 * (`Cards.tsx`, `Tables.tsx`). Everything reads the tokens at render time and again on the look stamp.
 */
export function ChartRenderer({ widget, result: raw, paging }: Props) {
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
    case 'table': return <DataTable widget={widget} result={result} paging={paging} />;
    case 'matrix': return <Matrix widget={widget} result={result} />;
    default: break;
  }

  if (!option) return null;
  return <ReactEChartsCore echarts={echarts} option={option} notMerge lazyUpdate className="chart-fill" style={{ height: '100%', width: '100%' }} />;
}
