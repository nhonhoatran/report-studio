import type { ReactNode } from 'react';

/** Page header row: one h1 per page lives here. `back` renders before the heading, outside it. */
export function Toolbar({ title, meta, actions, back }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="toolbar">
      <div className="toolbar__title">
        {back}
        <h1 className="truncate">{title}</h1>
        {meta}
      </div>
      {actions && <div className="toolbar__actions">{actions}</div>}
    </div>
  );
}
