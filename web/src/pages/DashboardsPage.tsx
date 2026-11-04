import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, LayoutDashboard, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import { emptyDefinition, type Dashboard } from '@/api/types';
import { useAuth, canEdit } from '@/store/auth';
import { toast } from '@/store/toast';
import { useI18nStore, useT } from '@/i18n';
import { formatDateTime } from '@/lib/format';
import { Toolbar } from '@/components/ui/Toolbar';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorBox, Spinner } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import '@/components/layout/layout.css';

export function DashboardsPage() {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const user = useAuth((s) => s.user);
  const editable = canEdit(user);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [toDelete, setToDelete] = useState<Dashboard | null>(null);

  const list = useQuery({ queryKey: ['dashboards'], queryFn: () => api.dashboards.list().then((r) => r.dashboards) });
  const create = useMutation({
    mutationFn: () => api.dashboards.create({ name: t('dashboards.untitled'), definition: emptyDefinition() }),
    onSuccess: ({ dashboard }) => { qc.invalidateQueries({ queryKey: ['dashboards'] }); navigate(`/dashboards/${dashboard.id}/edit`); },
    onError: (e) => toast.error(e),
  });
  const duplicate = useMutation({
    mutationFn: (id: number) => api.dashboards.duplicate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboards'] }),
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.dashboards.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dashboards'] }); setToDelete(null); toast.success(t('common.deleted')); },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <Toolbar title={t('dashboards.title')} actions={editable && <Button variant="primary" icon={<Plus size={16} />} onClick={() => create.mutate()} loading={create.isPending}>{t('dashboards.new')}</Button>} />
      {list.isLoading && <Spinner block />}
      {list.error && <ErrorBox error={list.error} />}
      {list.data && list.data.length === 0 && (
        <EmptyState icon={<LayoutDashboard size={36} />} title={t('dashboards.empty')} hint={t('dashboards.emptyHint')}
          action={editable && <Button variant="primary" icon={<Plus size={16} />} onClick={() => create.mutate()}>{t('dashboards.new')}</Button>} />
      )}
      {list.data && list.data.length > 0 && (
        <div className="cards">
          {list.data.map((d) => (
            <article key={d.id} className="card">
              <h2 className="card__title truncate"><Link to={`/dashboards/${d.id}`}>{d.name}</Link></h2>
              {d.description && <p className="text-sm text-muted">{d.description}</p>}
              <div className="card__meta">
                <span>{t('dashboards.widgets', { count: d.widgetCount })}</span>
                <span>{t('common.updatedAt')} {formatDateTime(d.updatedAt, lang)}</span>
              </div>
              <div className="card__actions">
                {editable && <Button variant="ghost" size="sm" iconOnly icon={<Copy size={15} />} onClick={() => duplicate.mutate(d.id)}>{t('common.duplicate')}</Button>}
                {editable && <Button variant="ghost" size="sm" iconOnly icon={<Pencil size={15} />} onClick={() => navigate(`/dashboards/${d.id}/edit`)}>{t('common.edit')}</Button>}
                {editable && <Button variant="ghost" size="sm" iconOnly icon={<Trash2 size={15} />} onClick={() => setToDelete(d)}>{t('common.delete')}</Button>}
                <Button variant="primary" size="sm" onClick={() => navigate(`/dashboards/${d.id}`)}>{t('dashboards.open')}</Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <ConfirmDialog open={!!toDelete} title={t('common.delete')} message={t('common.confirmDelete', { name: toDelete?.name ?? '' })}
        confirmLabel={t('common.delete')} loading={remove.isPending} onConfirm={() => toDelete && remove.mutate(toDelete.id)} onClose={() => setToDelete(null)} />
    </>
  );
}
