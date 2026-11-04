import type { ReactNode } from 'react';
import { AlertCircle, Inbox } from 'lucide-react';
import { useT } from '@/i18n';
import { useToasts } from '@/store/toast';

export function Spinner({ label, block }: { label?: string; block?: boolean }) {
  const t = useT();
  return (
    <div className={['spinner', block && 'spinner--block'].filter(Boolean).join(' ')} role="status">
      <span className="spinner__ring" aria-hidden />
      <span>{label ?? t('common.loading')}</span>
    </div>
  );
}

export function ErrorBox({ error, children }: { error?: unknown; children?: ReactNode }) {
  const t = useT();
  const message = children ?? (error instanceof Error ? error.message : typeof error === 'string' ? error : t('common.errorGeneric'));
  return (
    <div className="errorbox" role="alert">
      <AlertCircle size={16} className="errorbox__icon" aria-hidden />
      <div>{message}</div>
    </div>
  );
}

export function EmptyState({ title, hint, action, icon, compact }: { title: ReactNode; hint?: ReactNode; action?: ReactNode; icon?: ReactNode; compact?: boolean }) {
  return (
    <div className={['empty', compact && 'empty--compact'].filter(Boolean).join(' ')}>
      <div className="empty__icon" aria-hidden>{icon ?? <Inbox size={compact ? 24 : 36} />}</div>
      <div className="empty__title">{title}</div>
      {hint && <p className="text-sm">{hint}</p>}
      {action && <div style={{ marginTop: 'var(--space-2)' }}>{action}</div>}
    </div>
  );
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  if (!toasts.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`} role="status" onClick={() => dismiss(t.id)}>{t.message}</div>
      ))}
    </div>
  );
}
