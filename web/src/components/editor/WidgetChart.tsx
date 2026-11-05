import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Code2, Download, FileSpreadsheet, FileText, Printer, Rows3 } from 'lucide-react';
import { api } from '@/api/client';
import type { OrderBy, Widget } from '@/api/types';
import { useI18nStore, useT } from '@/i18n';
import { formatDateTime } from '@/lib/format';
import { useEditor, usePageFilters } from '@/store/editor';
import { CHART_SPECS, autoTitle, invalidFormula, isRunnable, missingWells, pageSizeOf, toQueryRequest, widgetQueryKey } from '@/lib/widget';
import { columnLabel } from '@/components/charts/shape';
import { toast } from '@/store/toast';
import { applyCrossFilters, applyDashboardFilters, needsSourceFields } from '@/lib/filters';
import { useSourceFields } from './useSourceFields';
import { ChartRenderer, type Paging, type Pick } from '@/components/charts/ChartRenderer';
import { dimensionName } from '@/lib/widget';
import { EmptyState, ErrorBox, Spinner } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

/** Runs the widget's query and renders it with loading / error / empty states. */
/** A refresh pressed this recently makes the next fetch skip the server's result cache. */
const REFRESH_WINDOW_MS = 5_000;

export function WidgetChart({ widget, showMeta = true }: { widget: Widget; /** the editor's extras: the SQL button */ showMeta?: boolean }) {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const [sqlOpen, setSqlOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const refreshedAt = useEditor((s) => s.refreshedAt);
  // a paged table: the page and the reader's sort are part of the request
  const pageSize = pageSizeOf(widget);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSort, setPageSort] = useState<OrderBy | undefined>(undefined);
  const runnable = isRunnable(widget);
  const missing = missingWells(widget);
  // a formula that does not parse or names a missing measure is reported in the pane; the query waits
  const brokenFormula = invalidFormula(widget);
  // dashboard filters: those of this page or of the whole report; a field filter from another source applies only when this source has the column
  const dashboardFilters = usePageFilters();
  const filterValues = useEditor((s) => s.filterValues);
  const crossFilters = useEditor((s) => s.crossFilters);
  const toggleCrossFilter = useEditor((s) => s.toggleCrossFilter);
  const [drill, setDrill] = useState<{ value?: string } | null>(null);
  const wantFields = needsSourceFields(widget, dashboardFilters) || crossFilters.some((cf) => cf.widgetId !== widget.id);
  const fields = useSourceFields(wantFields ? widget.datasourceId : null, wantFields ? widget.source : null);
  const extras = useMemo(() => {
    const applied = applyDashboardFilters(widget, dashboardFilters, filterValues, fields.data);
    return { ...applied, filters: [...applied.filters, ...applyCrossFilters(widget, crossFilters, fields.data)], page: pageSize ? { index: pageIndex, sort: pageSort } : undefined };
  }, [widget, dashboardFilters, filterValues, fields.data, crossFilters, pageSize, pageIndex, pageSort]);
  const fieldsSettled = !wantFields || fields.isSuccess || fields.isError;
  const query = useQuery({
    queryKey: [...widgetQueryKey(widget, extras), refreshedAt],
    queryFn: ({ signal }) => api.query.run({ ...toQueryRequest(widget, extras)!, fresh: Date.now() - refreshedAt < REFRESH_WINDOW_MS || undefined }, signal),
    enabled: runnable && !missing && !brokenFormula && fieldsSettled,
    staleTime: 30_000,
    retry: false,
    placeholderData: (prev) => prev,
  });

  const exportRows = useMutation({
    mutationFn: async (format: 'csv' | 'xlsx') => {
      const req = toQueryRequest(widget, { ...extras, page: undefined })!;
      const headers = Object.fromEntries((query.data?.columns ?? []).map((c) => [c.alias, columnLabel(widget, c, lang)]));
      await api.query.export(req, format, headers, autoTitle(widget, t));
    },
    onSuccess: () => setExportOpen(false),
    onError: (e) => toast.error(e),
  });
  const paging: Paging | undefined = pageSize ? { index: pageIndex, setIndex: setPageIndex, sort: pageSort, setSort: setPageSort, more: query.data?.truncated === true } : undefined;
  // a click on a category of a plain (unbucketed) first dimension filters the page's other visuals; a right-click opens the rows behind it
  const firstDim = widget.query.dimensions[0];
  const pickable = !!firstDim && (!firstDim.bucket || firstDim.bucket === 'none');
  const pick: Pick = {
    onSelect: pickable && widget.options.crossFilter !== false ? (value) => toggleCrossFilter({ widgetId: widget.id, field: firstDim!.field, value, label: `${dimensionName(firstDim!)}: ${value}` }) : undefined,
    onDrill: pickable ? (value) => setDrill({ value }) : undefined,
  };
  const drillWidget = useMemo((): Widget => ({
    ...widget, type: 'table', title: '', options: { numberFormat: widget.options.numberFormat },
    query: { dimensions: [], measures: [], orderBy: [], filters: [...widget.query.filters, ...(drill?.value !== undefined && firstDim ? [{ id: 'drill', field: firstDim.field, op: 'eq' as const, value: drill.value }] : [])] },
  }), [widget, drill, firstDim]);

  if (!runnable) return <div className="widget__center"><EmptyState compact title={t('editor.needsFields')} /></div>;
  if (missing) return <div className="widget__center"><EmptyState compact title={t(missing.message, { well: t(missing.well) })} /></div>;
  if (brokenFormula) return <div className="widget__center"><EmptyState compact title={t('editor.formulaBroken', { well: t(CHART_SPECS[widget.type].wells.measures) })} /></div>;
  if (query.isPending) return <div className="widget__center"><Spinner /></div>;
  if (query.error) return <div className="widget__body"><ErrorBox error={query.error} /></div>;
  const result = query.data!;
  return (
    <>
      <div className={['widget__body', query.isFetching && 'widget__body--refreshing'].filter(Boolean).join(' ')}>
        <ChartRenderer widget={widget} result={result} paging={paging} pick={pick} />
      </div>
      {/* row count, duration and when the data was read, in a chip that appears on hover; the SQL for editors */}
      <div className="widget__meta">
        <span>
          {result.truncated ? t('editor.truncated', { count: result.rowCount }) : t('editor.rows', { count: result.rowCount })}, {t('editor.ms', { ms: result.durationMs })}
          {result.dataAt && ` · ${t('editor.dataAt', { time: formatDateTime(result.dataAt, lang) })}${result.fromCache ? ` (${t('editor.fromCache')})` : ''}`}
        </span>
        <Button variant="ghost" size="sm" iconOnly icon={<Rows3 size={13} />} onClick={() => setDrill({})}>{t('editor.drill')}</Button>
        <Button variant="ghost" size="sm" iconOnly icon={<Download size={13} />} onClick={() => setExportOpen(true)}>{t('editor.export')}</Button>
        {showMeta && <Button variant="ghost" size="sm" iconOnly icon={<Code2 size={13} />} onClick={() => setSqlOpen(true)}>{t('editor.showSql')}</Button>}
      </div>
      <Modal open={!!drill} wide title={t('editor.drillTitle', { title: autoTitle(widget, t), value: drill?.value ?? '' })} onClose={() => setDrill(null)}>
        {drill && <DrillRows widget={drillWidget} extras={{ ...extras, page: undefined }} />}
      </Modal>
      <Modal open={exportOpen} title={t('editor.exportTitle')} onClose={() => setExportOpen(false)}>
        <div className="stack">
          <p className="text-sm text-muted">{t('editor.exportHint')}</p>
          <div className="row row--wrap">
            <Button icon={<FileText size={16} />} loading={exportRows.isPending && exportRows.variables === 'csv'} onClick={() => exportRows.mutate('csv')}>{t('editor.exportCsv')}</Button>
            <Button icon={<FileSpreadsheet size={16} />} loading={exportRows.isPending && exportRows.variables === 'xlsx'} onClick={() => exportRows.mutate('xlsx')}>{t('editor.exportExcel')}</Button>
            <Button icon={<Printer size={16} />} onClick={() => { setExportOpen(false); setTimeout(() => window.print(), 100); }}>{t('editor.exportPrint')}</Button>
          </div>
        </div>
      </Modal>
      <Modal open={sqlOpen} title={t('editor.sqlTitle')} onClose={() => setSqlOpen(false)} wide>
        <pre className="sql-box">{result.sql}</pre>
      </Modal>
    </>
  );
}

/** How many source rows a drill-through shows at most. */
const DRILL_LIMIT = 500;

/** The rows behind a visual (or behind one of its categories): the source's own columns, under the same filters. */
function DrillRows({ widget, extras }: { widget: Widget; extras: Parameters<typeof toQueryRequest>[1] }) {
  const t = useT();
  const query = useQuery({
    queryKey: ['drill', widgetQueryKey(widget, extras)],
    queryFn: ({ signal }) => api.query.run({ ...toQueryRequest(widget, extras)!, limit: DRILL_LIMIT }, signal),
    retry: false,
  });
  if (query.isPending) return <Spinner block />;
  if (query.error) return <ErrorBox error={query.error} />;
  const result = query.data!;
  if (result.rows.length === 0) return <EmptyState compact title={t('editor.noData')} />;
  return (
    <div className="stack">
      <p className="text-sm text-muted">{result.truncated ? t('editor.truncated', { count: result.rowCount }) : t('editor.rows', { count: result.rowCount })}</p>
      <div className="drill-rows"><ChartRenderer widget={widget} result={result} /></div>
    </div>
  );
}
