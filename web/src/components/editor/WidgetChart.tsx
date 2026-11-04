import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Code2 } from 'lucide-react';
import { api } from '@/api/client';
import type { Widget } from '@/api/types';
import { useT } from '@/i18n';
import { isRunnable, toQueryRequest, widgetQueryKey } from '@/lib/widget';
import { ChartRenderer } from '@/components/charts/ChartRenderer';
import { EmptyState, ErrorBox, Spinner } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

/** Runs the widget's query and renders it with loading / error / empty states. */
export function WidgetChart({ widget, showMeta = true }: { widget: Widget; showMeta?: boolean }) {
  const t = useT();
  const [sqlOpen, setSqlOpen] = useState(false);
  const runnable = isRunnable(widget);
  const query = useQuery({
    queryKey: widgetQueryKey(widget),
    queryFn: ({ signal }) => api.query.run(toQueryRequest(widget)!, signal),
    enabled: runnable && (widget.type === 'table' || widget.query.measures.length > 0),
    staleTime: 30_000,
    retry: false,
    placeholderData: (prev) => prev,
  });

  if (!runnable) return <div className="widget__center"><EmptyState compact title={t('editor.needsFields')} /></div>;
  if (widget.type !== 'table' && widget.query.measures.length === 0) return <div className="widget__center"><EmptyState compact title={t('editor.needsMeasure')} /></div>;
  if (query.isPending) return <div className="widget__center"><Spinner /></div>;
  if (query.error) return <div className="widget__body"><ErrorBox error={query.error} /></div>;
  const result = query.data!;
  return (
    <>
      <div className="widget__body" style={{ opacity: query.isFetching ? 0.6 : 1, transition: 'opacity 150ms' }}>
        <ChartRenderer widget={widget} result={result} />
      </div>
      {showMeta && (
        <div className="widget__footer">
          <span>{result.truncated ? t('editor.truncated', { count: result.rowCount }) : t('editor.rows', { count: result.rowCount })} · {t('editor.ms', { ms: result.durationMs })}</span>
          <Button variant="ghost" size="sm" iconOnly icon={<Code2 size={13} />} onClick={() => setSqlOpen(true)}>{t('editor.showSql')}</Button>
        </div>
      )}
      <Modal open={sqlOpen} title={t('editor.sqlTitle')} onClose={() => setSqlOpen(false)} wide>
        <pre className="sql-box">{result.sql}</pre>
      </Modal>
    </>
  );
}
