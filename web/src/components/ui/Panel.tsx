import type { HTMLAttributes, ReactNode } from 'react';

interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> { title?: ReactNode; actions?: ReactNode; flush?: boolean; children: ReactNode }

export function Panel({ title, actions, flush, className, children, ...rest }: PanelProps) {
  return (
    <section className={['panel', className].filter(Boolean).join(' ')} {...rest}>
      {(title || actions) && (
        <header className="panel__header">
          {title && <h2 className="panel__title">{title}</h2>}
          {actions && <div className="row">{actions}</div>}
        </header>
      )}
      <div className={['panel__body', flush && 'panel__body--flush'].filter(Boolean).join(' ')}>{children}</div>
    </section>
  );
}
