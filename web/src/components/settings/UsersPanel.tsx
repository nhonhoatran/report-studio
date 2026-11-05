import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import type { RoleDefinition, User } from '@/api/types';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/toast';
import { useT } from '@/i18n';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorBox, Spinner } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { AttributesEditor, fromRows, toRows, type AttributeRow } from './AttributesEditor';
import { roleLabel } from './RolesPanel';

const USER_FORM_ID = 'user-form';

interface UserForm { username: string; displayName: string; password: string; role: string; attributes: AttributeRow[] }

/** Add / edit dialog: the account, its role (any row of the roles table) and its ABAC attributes. */
function UserModal({ open, initial, roles, onClose }: { open: boolean; initial: User | null; roles: RoleDefinition[]; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const [form, setForm] = useState<UserForm>(initial
    ? { username: initial.username, displayName: initial.displayName, password: '', role: initial.role, attributes: toRows(initial.attributes) }
    : { username: '', displayName: '', password: '', role: 'editor', attributes: [] });
  const set = (patch: Partial<UserForm>) => setForm((f) => ({ ...f, ...patch }));
  const save = useMutation({
    mutationFn: async () => {
      if (initial) await api.auth.updateUser(initial.id, { displayName: form.displayName, role: form.role, password: form.password || undefined, attributes: fromRows(form.attributes) });
      else await api.auth.createUser({ username: form.username, displayName: form.displayName, password: form.password, role: form.role, attributes: fromRows(form.attributes) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); if (initial?.id === me?.id) void useAuth.getState().load(); onClose(); },
  });
  const valid = !!form.displayName && !!form.role && (initial ? form.password === '' || form.password.length >= 8 : !!form.username && form.password.length >= 8);
  return (
    <Modal open={open} title={initial ? t('settings.editUser') : t('settings.addUser')} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form={USER_FORM_ID} variant="primary" loading={save.isPending} disabled={!valid}>{t('common.save')}</Button></>}>
      <form id={USER_FORM_ID} className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); if (valid) save.mutate(); }}>
        <div className="form-grid">
          {initial
            ? <Input label={t('login.username')} value={form.username} disabled />
            : <Input label={t('login.username')} required autoComplete="off" value={form.username} onChange={(e) => set({ username: e.target.value })} autoFocus />}
          <Input label={t('settings.displayName')} required value={form.displayName} onChange={(e) => set({ displayName: e.target.value })} />
          {(!initial || initial.hasPassword) && (
            <Input label={initial ? t('settings.newPassword') : t('login.password')} type="password" autoComplete="new-password" required={!initial} minLength={8}
              hint={initial ? t('common.optional') : undefined} help={t('settings.minPassword')} value={form.password} onChange={(e) => set({ password: e.target.value })} />
          )}
          <Select label={t('settings.role')} value={form.role} disabled={initial?.id === me?.id} onChange={(e) => set({ role: e.target.value })}>
            {roles.map((r) => <option key={r.name} value={r.name}>{roleLabel(r, r.name, t)}</option>)}
          </Select>
        </div>
        <div className="field">
          <span className="field__label">{t('settings.attributes')}</span>
          <AttributesEditor rows={form.attributes} onChange={(attributes) => set({ attributes })} hint={t('settings.attributesHint')} />
        </div>
        {save.error && <ErrorBox error={save.error} />}
      </form>
    </Modal>
  );
}

/** Settings › users: accounts, their role and their attributes. */
export function UsersPanel() {
  const t = useT();
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<User | null>(null);
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.auth.users().then((r) => r.users) });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.roles.list().then((r) => r.roles) });
  const update = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) => api.auth.updateUser(id, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.auth.deleteUser(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setToDelete(null); toast.success(t('common.deleted')); },
    onError: (e) => toast.error(e),
  });
  const roleList = roles.data ?? [];

  return (
    <Panel title={t('settings.users')} actions={<Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>{t('settings.addUser')}</Button>} flush>
      {(users.isLoading || roles.isLoading) && <Spinner block />}
      {users.error && <div className="panel__body"><ErrorBox error={users.error} /></div>}
      {users.data && roles.data && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('login.username')}</th><th>{t('settings.displayName')}</th><th>{t('settings.loginMethod')}</th><th>{t('settings.role')}</th><th>{t('settings.attributes')}</th><th className="num">{t('common.actions')}</th></tr></thead>
            <tbody>
              {users.data.map((u) => {
                const attrs = Object.entries(u.attributes ?? {});
                return (
                  <tr key={u.id}>
                    <td className="mono">{u.username}</td>
                    <td>{u.displayName}</td>
                    <td><span className="badge">{u.provider === 'entra' ? t('settings.providerEntra') : t('settings.providerLocal')}</span></td>
                    <td>
                      <Select size="sm" className="field--auto" value={u.role} disabled={u.id === me?.id} aria-label={t('settings.role')} onChange={(e) => update.mutate({ id: u.id, role: e.target.value })}>
                        {roleList.map((r) => <option key={r.name} value={r.name}>{roleLabel(r, r.name, t)}</option>)}
                        {!roleList.some((r) => r.name === u.role) && <option value={u.role}>{u.role}</option>}
                      </Select>
                    </td>
                    <td>
                      {attrs.length === 0
                        ? <span className="text-faint">{t('settings.noAttributes')}</span>
                        : <span className="row row--wrap">{attrs.map(([k, v]) => <span key={k} className="badge" title={`${k} = ${v.join(', ')}`}>{k} = {v.join(', ')}</span>)}</span>}
                    </td>
                    <td className="num">
                      <div className="row row--end">
                        <Button variant="ghost" size="sm" iconOnly icon={<Pencil size={15} />} onClick={() => setEditing(u)}>{t('common.edit')}</Button>
                        {u.id !== me?.id && <Button variant="ghost" size="sm" iconOnly icon={<Trash2 size={15} />} onClick={() => setToDelete(u)}>{t('common.delete')}</Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <UserModal key={editing === 'new' ? 'new' : editing?.id ?? 'closed'} open={editing !== null} initial={editing === 'new' || editing === null ? null : editing} roles={roleList} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!toDelete} title={t('common.delete')} message={t('common.confirmDelete', { name: toDelete?.username ?? '' })} confirmLabel={t('common.delete')}
        loading={remove.isPending} onConfirm={() => toDelete && remove.mutate(toDelete.id)} onClose={() => setToDelete(null)} />
    </Panel>
  );
}
