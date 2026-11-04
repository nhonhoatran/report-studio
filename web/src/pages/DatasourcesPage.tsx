import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Pencil, Plug, Plus, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import type { Datasource, DatasourceInput } from '@/api/types';
import { useAuth, canEdit } from '@/store/auth';
import { toast } from '@/store/toast';
import { useT } from '@/i18n';
import { describeError, describeServerError } from '@/lib/errors';
import { Toolbar } from '@/components/ui/Toolbar';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Panel } from '@/components/ui/Panel';
import { EmptyState, ErrorBox, Notice, Spinner } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import '@/components/layout/layout.css';

const blank: DatasourceInput = { name: '', host: '', port: 3306, database: '', username: '', password: '', ssl: false };

const FORM_ID = 'datasource-form';

/** Add / edit dialog. Owns the form state so the footer's Save button reflects validity and pending. */
export function DatasourceModal({ open, initial, onClose }: { open: boolean; initial: Datasource | null; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState<DatasourceInput>(initial ? { ...initial, password: '' } : blank);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const set = <K extends keyof DatasourceInput>(k: K, v: DatasourceInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const test = useMutation({
    mutationFn: () => api.datasources.test({ ...form, id: initial?.id }),
    onSuccess: (r) => {
      setTestOk(r.ok);
      setTestResult(r.ok
        ? t('datasources.testOk', { version: r.version ?? '', ms: r.latencyMs ?? 0 })
        : t('datasources.testFail', { error: describeServerError({ code: r.code, message: r.error, details: r.details }, t) }));
    },
    onError: (e) => { setTestOk(false); setTestResult(describeError(e, t)); },
  });
  const save = useMutation({
    mutationFn: () => initial
      ? api.datasources.update(initial.id, { ...form, password: form.password || undefined })
      : api.datasources.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['datasources'] }); onClose(); },
  });

  const valid = !!(form.name && form.host && form.database && form.username && form.port > 0);
  const onSubmit = (e: FormEvent) => { e.preventDefault(); if (valid) save.mutate(); };

  return (
    <Modal
      open={open}
      title={initial ? t('datasources.editTitle') : t('datasources.addTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={!valid} loading={save.isPending}>{t('common.save')}</Button>
        </>
      }
    >
    <form id={FORM_ID} onSubmit={onSubmit} className="stack">
      <p className="text-sm text-muted">{t('datasources.readonlyHint')}</p>
      <div className="form-grid">
        <Input className="span-2" label={t('common.name')} required value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        <Input label={t('datasources.host')} required value={form.host} onChange={(e) => set('host', e.target.value)} placeholder={t('datasources.hostPlaceholder')} />
        <Input label={t('datasources.port')} type="number" min={1} max={65535} required value={form.port} onChange={(e) => set('port', Number(e.target.value))} />
        <Input className="span-2" label={t('datasources.database')} required value={form.database} onChange={(e) => set('database', e.target.value)} />
        <Input label={t('datasources.username')} required autoComplete="off" value={form.username} onChange={(e) => set('username', e.target.value)} />
        <Input label={t('datasources.password')} type="password" autoComplete="new-password" hint={initial ? t('common.optional') : undefined} help={initial ? t('datasources.passwordKeep') : undefined} value={form.password ?? ''} onChange={(e) => set('password', e.target.value)} />
        <Checkbox label={t('datasources.ssl')} checked={form.ssl} onChange={(e) => set('ssl', e.target.checked)} />
      </div>
      <div className="row row--wrap">
        <Button icon={<Plug size={16} />} onClick={() => test.mutate()} loading={test.isPending} disabled={!form.host || !form.database || !form.username}>{test.isPending ? t('datasources.testing') : t('datasources.test')}</Button>
      </div>
      {testResult && <Notice kind={testOk ? 'success' : 'error'}>{testResult}</Notice>}
      {save.error && <ErrorBox error={save.error} />}
    </form>
    </Modal>
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['datasources'] }); setToDelete(null); toast.success(t('common.deleted')); },
    onError: (e) => toast.error(e),
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
          <div className="table-wrap">
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
                      <div className="row row--end">
                        {editable && <Button variant="ghost" size="sm" iconOnly icon={<Pencil size={15} />} onClick={() => setEditing(d)}>{t('common.edit')}</Button>}
                        {editable && <Button variant="ghost" size="sm" iconOnly icon={<Trash2 size={15} />} onClick={() => setToDelete(d)}>{t('common.delete')}</Button>}
                        <Link className="btn btn--secondary btn--sm" to={`/datasources/${d.id}`}>{t('datasources.detail')}</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <DatasourceModal key={editing === 'new' ? 'new' : editing?.id ?? 'closed'} open={editing !== null} initial={editing === 'new' || editing === null ? null : editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!toDelete} title={t('common.delete')} message={t('common.confirmDelete', { name: toDelete?.name ?? '' })} confirmLabel={t('common.delete')}
        loading={remove.isPending} onConfirm={() => toDelete && remove.mutate(toDelete.id)} onClose={() => setToDelete(null)} />
    </>
  );
}
