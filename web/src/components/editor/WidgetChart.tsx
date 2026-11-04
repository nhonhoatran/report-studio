import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Code2 } from 'lucide-react';
import { api } from '@/api/client';
import type { Widget } from '@/api/types';
import { useT } from '@/i18n';
import { isRunnable, missingWells, toQueryRequest, widgetQueryKey } from '@/lib/widget';
import { ChartRenderer } from '@/components/charts/ChartRenderer';
import { EmptyState, ErrorBox, Spinner } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

/** Runs the widget's query and renders it with loading / error / empty states. */
export function WidgetChart({ widget, showMeta = true }: { widget: Widget; showMeta?: boolean }) {
  const t = useT();
  const [sqlOpen, setSqlOpen] = useState(false);
  const runnable = isRunnable(widget);
  const missing = missingWells(widget);
  const query = useQuery({
    queryKey: widgetQueryKey(widget),
    queryFn: ({ signal }) => api.query.run(toQueryRequest(widget)!, signal),
    enabled: runnable && !missing,
    staleTime: 30_000,
    retry: false,
    placeholderData: (prev) => prev,
  });

  if (!runnable) return <div className="widget__center"><EmptyState compact title={t('editor.needsFields')} /></div>;
  if (missing) return <div className="widget__center"><EmptyState compact title={t(missing)} /></div>;
  if (query.isPending) return <div className="widget__center"><Spinner /></div>;
  if (query.error) return <div className="widget__body"><ErrorBox error={query.error} /></div>;
  const result = query.data!;
  return (
    <>
      <div className={['widget__body', query.isFetching && 'widget__body--refreshing'].filter(Boolean).join(' ')}>
        <ChartRenderer widget={widget} result={result} />
      </div>
      {showMeta && (
        // editors only: row count, duration and the SQL, in a chip that appears on hover
        <div className="widget__meta">
          <span>{result.truncated ? t('editor.truncated', { count: result.rowCount }) : t('editor.rows', { count: result.rowCount })}, {t('editor.ms', { ms: result.durationMs })}</span>
          <Button variant="ghost" size="sm" iconOnly icon={<Code2 size={13} />} onClick={() => setSqlOpen(true)}>{t('editor.showSql')}</Button>
        </div>
      )}
      <Modal open={sqlOpen} title={t('editor.sqlTitle')} onClose={() => setSqlOpen(false)} wide>
        <pre className="sql-box">{result.sql}</pre>
      </Modal>
    </>
  );
}
