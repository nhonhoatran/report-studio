import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import type { Dataset, FieldInfo } from '@/api/types';
import { useAuth, canEdit } from '@/store/auth';
import { toast } from '@/store/toast';
import { useT } from '@/i18n';
import { Toolbar } from '@/components/ui/Toolbar';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Panel } from '@/components/ui/Panel';
import { EmptyState, ErrorBox, Spinner } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { KindBadge } from '@/components/ui/KindBadge';
import '@/components/layout/layout.css';

function DatasetForm({ datasourceId, initial, onClose }: { datasourceId: number; initial: Dataset | null; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [sql, setSql] = useState(initial?.sql ?? 'SELECT\n  \nFROM ');
  const [fields, setFields] = useState<FieldInfo[] | null>(null);

  const preview = useMutation({
    mutationFn: () => api.datasets.previewFields(datasourceId, sql).then((r) => r.fields),
    onSuccess: (f) => setFields(f),
  });
  const save = useMutation({
    mutationFn: () => initial ? api.datasets.update(initial.id, { name, description, sql }) : api.datasets.create({ datasourceId, name, description, sql }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['datasets'] }); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };

  return (
    <form onSubmit={onSubmit} className="stack">
      <div className="form-grid">
        <Input label={t('common.name')} required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Input label={t('common.description')} hint={t('common.optional')} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <Textarea label={t('datasets.sql')} help={t('datasets.sqlHint')} required rows={10} spellCheck={false} value={sql} onChange={(e) => { setSql(e.target.value); setFields(null); }} />
      <div className="row">
        <Button icon={<Play size={16} />} onClick={() => preview.mutate()} loading={preview.isPending} disabled={!sql.trim()}>{t('datasets.preview')}</Button>
        {fields && <span className="text-sm text-muted">{t('datasets.fields')}: {fields.length}</span>}
      </div>
      {preview.error && <ErrorBox error={preview.error} />}
      {fields && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {fields.map((f) => <KindBadge key={f.name} kind={f.kind} label={f.name} />)}
        </div>
      )}
      <div className="modal__footer" style={{ margin: 'calc(-1 * var(--space-5))', marginTop: 0 }}>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={!name || !sql.trim()} loading={save.isPending}>{t('common.save')}</Button>
      </div>
    </form>
  );
}

export function DatasourceDetailPage() {
  const t = useT();
  const id = Number(useParams().id);
  const user = useAuth((s) => s.user);
  const editable = canEdit(user);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Dataset | null | 'new'>(null);
  const [toDelete, setToDelete] = useState<Dataset | null>(null);
  const [openTable, setOpenTable] = useState<string | null>(null);

  const ds = useQuery({ queryKey: ['datasource', id], queryFn: () => api.datasources.get(id).then((r) => r.datasource) });
  const tables = useQuery({ queryKey: ['tables', id], queryFn: () => api.datasources.tables(id).then((r) => r.tables) });
  const datasets = useQuery({ queryKey: ['datasets', id], queryFn: () => api.datasets.list(id).then((r) => r.datasets) });
  const columns = useQuery({ queryKey: ['columns', id, openTable], queryFn: () => api.datasources.columns(id, openTable!).then((r) => r.columns), enabled: !!openTable });
  const remove = useMutation({
    mutationFn: (dsId: number) => api.datasets.remove(dsId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['datasets'] }); setToDelete(null); },
    onError: (e) => toast.error(e.message),
  });

  if (ds.isLoading) return <Spinner block />;
  if (ds.error) return <ErrorBox error={ds.error} />;

  return (
    <>
      <Toolbar
        title={<span className="row"><Link className="btn btn--ghost btn--icon btn--sm" to="/datasources" aria-label={t('common.back')}><ArrowLeft size={18} /></Link>{ds.data?.name}</span>}
        meta={<span className="text-sm text-muted mono">{ds.data?.host}:{ds.data?.port}/{ds.data?.database}</span>}
        actions={editable && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>{t('datasets.add')}</Button>}
      />
      <div className="settings-grid">
        <Panel title={t('datasources.tables')} flush>
          {tables.isLoading && <Spinner block />}
          {tables.error && <div className="panel__body"><ErrorBox error={tables.error} /></div>}
          {tables.data && (
            <div className="table-wrap" style={{ border: 0 }}>
              <table className="table">
                <thead><tr><th>{t('common.name')}</th><th></th><th className="num">{t('datasources.rowsHeader')}</th></tr></thead>
                <tbody>
                  {tables.data.map((tb) => (
                    <tr key={tb.name}>
                      <td><button type="button" className="btn btn--ghost btn--sm" style={{ padding: 0, height: 'auto', fontFamily: 'var(--font-mono)' }} onClick={() => setOpenTable(tb.name)}>{tb.name}</button></td>
                      <td><span className="badge">{tb.type === 'view' ? t('datasources.view') : t('datasources.table')}</span></td>
                      <td className="num text-muted">{tb.rows === null ? '—' : tb.rows.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title={t('datasets.title')} flush>
          {datasets.isLoading && <Spinner block />}
          {datasets.error && <div className="panel__body"><ErrorBox error={datasets.error} /></div>}
          {datasets.data && datasets.data.length === 0 && <EmptyState compact title={t('datasets.empty')} hint={t('datasets.emptyHint')} />}
          {datasets.data && datasets.data.length > 0 && (
            <div className="table-wrap" style={{ border: 0 }}>
              <table className="table">
                <thead><tr><th>{t('common.name')}</th><th>{t('common.description')}</th><th className="num">{t('common.actions')}</th></tr></thead>
                <tbody>
                  {datasets.data.map((d) => (
                    <tr key={d.id}>
                      <td>{d.name}</td>
                      <td className="text-muted">{d.description}</td>
                      <td className="num">
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          {editable && <Button variant="ghost" size="sm" iconOnly icon={<Pencil size={15} />} onClick={() => setEditing(d)}>{t('common.edit')}</Button>}
                          {editable && <Button variant="ghost" size="sm" iconOnly icon={<Trash2 size={15} />} onClick={() => setToDelete(d)}>{t('common.delete')}</Button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Modal open={!!openTable} title={<span className="mono">{openTable}</span>} onClose={() => setOpenTable(null)}>
        {columns.isLoading && <Spinner />}
        {columns.error && <ErrorBox error={columns.error} />}
        {columns.data && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('datasources.columns')}</th><th></th><th></th></tr></thead>
              <tbody>
                {columns.data.map((c) => (
                  <tr key={c.name}><td className="mono">{c.name}{c.isKey && ' 🔑'}</td><td className="mono text-muted">{c.dataType}</td><td><KindBadge kind={c.kind} label={t(`kinds.${c.kind}`)} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
      <Modal open={editing !== null} title={editing === 'new' ? t('datasets.addTitle') : t('datasets.editTitle')} onClose={() => setEditing(null)} wide>
        {editing !== null && <DatasetForm key={editing === 'new' ? 'new' : editing.id} datasourceId={id} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      </Modal>
      <ConfirmDialog open={!!toDelete} title={t('common.delete')} message={t('common.confirmDelete', { name: toDelete?.name ?? '' })} confirmLabel={t('common.delete')}
        loading={remove.isPending} onConfirm={() => toDelete && remove.mutate(toDelete.id)} onClose={() => setToDelete(null)} />
    </>
  );
}
