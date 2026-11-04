import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Inbox, X } from 'lucide-react';
import { useT } from '@/i18n';
import { useToasts } from '@/store/toast';
import { Button } from './Button';

export function Spinner({ label, block }: { label?: string; block?: boolean }) {
  const t = useT();
  return (
    <div className={['spinner', block && 'spinner--block'].filter(Boolean).join(' ')} role="status">
      <span className="spinner__ring" aria-hidden />
      <span>{label ?? t('common.loading')}</span>
    </div>
  );
}

/** Inline message box. `error` is the project's error surface; `success` its inline confirmation. */
export function Notice({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) {
  const Icon = kind === 'error' ? AlertCircle : CheckCircle2;
  return (
    <div className={`notice notice--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon size={16} className="notice__icon" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function ErrorBox({ error, children }: { error?: unknown; children?: ReactNode }) {
  const t = useT();
  const message = children ?? (error instanceof Error ? error.message : typeof error === 'string' ? error : t('common.errorGeneric'));
  return <Notice kind="error">{message}</Notice>;
}

export function EmptyState({ title, hint, action, icon, compact }: { title: ReactNode; hint?: ReactNode; action?: ReactNode; icon?: ReactNode; compact?: boolean }) {
  return (
    <div className={['empty', compact && 'empty--compact'].filter(Boolean).join(' ')}>
      <div className="empty__icon" aria-hidden>{icon ?? <Inbox size={compact ? 24 : 36} />}</div>
      <div className="empty__title">{title}</div>
      {hint && <p className="text-sm">{hint}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}

export function Toasts() {
  const t = useT();
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  if (!toasts.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className={`toast toast--${item.kind}`} role="status">
          <span className="grow">{item.message}</span>
          <Button variant="ghost" size="sm" iconOnly icon={<X size={14} />} onClick={() => dismiss(item.id)}>{t('common.close')}</Button>
        </div>
      ))}
    </div>
  );
}
