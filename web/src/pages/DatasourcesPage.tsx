import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Pencil, Plug, Plus, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import type { Datasource, DatasourceInput } from '@/api/types';
import { useAuth, canEdit } from '@/store/auth';
import { toast } from '@/store/toast';
import { useT } from '@/i18n';
import { Toolbar } from '@/components/ui/Toolbar';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Panel } from '@/components/ui/Panel';
import { EmptyState, ErrorBox, Spinner } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import '@/components/layout/layout.css';

const blank: DatasourceInput = { name: '', host: '', port: 3306, database: '', username: '', password: '', ssl: false };

export function DatasourceForm({ initial, onClose }: { initial: Datasource | null; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState<DatasourceInput>(initial ? { ...initial, password: '' } : blank);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const set = <K extends keyof DatasourceInput>(k: K, v: DatasourceInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const test = useMutation({
    mutationFn: () => api.datasources.test({ ...form, id: initial?.id }),
    onSuccess: (r) => { setTestOk(r.ok); setTestResult(r.ok ? t('datasources.testOk', { version: r.version ?? '', ms: r.latencyMs ?? 0 }) : t('datasources.testFail', { error: r.error ?? '' })); },
    onError: (e) => { setTestOk(false); setTestResult(e.message); },
  });
  const save = useMutation({
    mutationFn: () => initial
      ? api.datasources.update(initial.id, { ...form, password: form.password || undefined })
      : api.datasources.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['datasources'] }); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const onSubmit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  const valid = form.name && form.host && form.database && form.username && form.port > 0;

  return (
    <form id="datasource-form" onSubmit={onSubmit} className="stack">
      <p className="text-sm text-muted">{t('datasources.readonlyHint')}</p>
      <div className="form-grid">
        <Input className="span-2" label={t('common.name')} required value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        <Input label={t('datasources.host')} required value={form.host} onChange={(e) => set('host', e.target.value)} placeholder="db.example.com" />
        <Input label={t('datasources.port')} type="number" min={1} max={65535} required value={form.port} onChange={(e) => set('port', Number(e.target.value))} />
        <Input className="span-2" label={t('datasources.database')} required value={form.database} onChange={(e) => set('database', e.target.value)} />
        <Input label={t('datasources.username')} required autoComplete="off" value={form.username} onChange={(e) => set('username', e.target.value)} />
        <Input label={t('datasources.password')} type="password" autoComplete="new-password" hint={initial ? t('common.optional') : undefined} help={initial ? t('datasources.passwordKeep') : undefined} value={form.password ?? ''} onChange={(e) => set('password', e.target.value)} />
        <Checkbox label={t('datasources.ssl')} checked={form.ssl} onChange={(e) => set('ssl', e.target.checked)} />
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Button icon={<Plug size={16} />} onClick={() => test.mutate()} loading={test.isPending} disabled={!form.host || !form.database || !form.username}>{test.isPending ? t('datasources.testing') : t('datasources.test')}</Button>
        {testResult && (testOk ? <span className="text-sm" style={{ color: 'var(--color-success)' }}>{testResult}</span> : <ErrorBox>{testResult}</ErrorBox>)}
      </div>
      <div className="modal__footer" style={{ margin: 'calc(-1 * var(--space-5))', marginTop: 0 }}>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={!valid} loading={save.isPending}>{t('common.save')}</Button>
      </div>
    </form>
  );
}

export function DatasourcesPage() {
  const t = useT();
  const user = useAuth((s) => s.user);
  const editable = canEdit(user);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Datasource | null | 'new'>(null);
  const [toDelete, setToDelete] = useState<Datasource | null>(null);

  const list = useQuery({ queryKey: ['datasources'], queryFn: () => api.datasources.list().then((r) => r.datasources) });
  const remove = useMutation({
    mutationFn: (id: number) => api.datasources.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['datasources'] }); setToDelete(null); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <Toolbar title={t('datasources.title')} actions={editable && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>{t('datasources.add')}</Button>} />
      {list.isLoading && <Spinner block />}
      {list.error && <ErrorBox error={list.error} />}
      {list.data && list.data.length === 0 && (
        <EmptyState icon={<Database size={36} />} title={t('datasources.empty')} hint={t('datasources.emptyHint')}
          action={editable && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>{t('datasources.add')}</Button>} />
      )}
      {list.data && list.data.length > 0 && (
        <Panel flush>
          <div className="table-wrap" style={{ border: 0 }}>
            <table className="table">
              <thead>
                <tr><th>{t('common.name')}</th><th>{t('datasources.host')}</th><th>{t('datasources.database')}</th><th>{t('datasources.username')}</th><th className="num">{t('common.actions')}</th></tr>
              </thead>
              <tbody>
                {list.data.map((d) => (
                  <tr key={d.id}>
                    <td><Link to={`/datasources/${d.id}`}>{d.name}</Link> <span className="badge">{t('datasources.typeMaria')}</span></td>
                    <td className="mono">{d.host}:{d.port}</td>
                    <td className="mono">{d.database}</td>
                    <td className="mono">{d.username}</td>
                    <td className="num">
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <Link className="btn btn--secondary btn--sm" to={`/datasources/${d.id}`}>{t('datasources.detail')}</Link>
                        {editable && <Button variant="ghost" size="sm" iconOnly icon={<Pencil size={15} />} onClick={() => setEditing(d)}>{t('common.edit')}</Button>}
                        {editable && <Button variant="ghost" size="sm" iconOnly icon={<Trash2 size={15} />} onClick={() => setToDelete(d)}>{t('common.delete')}</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <Modal open={editing !== null} title={editing === 'new' ? t('datasources.addTitle') : t('datasources.editTitle')} onClose={() => setEditing(null)}>
        {editing !== null && <DatasourceForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      </Modal>
      <ConfirmDialog open={!!toDelete} title={t('common.delete')} message={t('common.confirmDelete', { name: toDelete?.name ?? '' })} confirmLabel={t('common.delete')}
        loading={remove.isPending} onConfirm={() => toDelete && remove.mutate(toDelete.id)} onClose={() => setToDelete(null)} />
    </>
  );
}
