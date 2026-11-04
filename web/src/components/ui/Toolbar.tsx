import type { ReactNode } from 'react';

/** Page header row: one h1 per page lives here. */
export function Toolbar({ title, meta, actions }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="toolbar">
      <div className="toolbar__title">
        <h1 className="truncate">{title}</h1>
        {meta}
      </div>
      {actions && <div className="toolbar__actions">{actions}</div>}
    </div>
  );
}
