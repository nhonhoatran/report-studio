import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import type { Role } from '@/api/types';
import { useAuth } from '@/store/auth';
import { useTheme, type ThemePref } from '@/store/theme';
import { toast } from '@/store/toast';
import { useI18nStore, useT } from '@/i18n';
import { Toolbar } from '@/components/ui/Toolbar';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Input, Labelled, Select } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Segmented } from '@/components/ui/Segmented';
import { ErrorBox, Spinner } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import '@/components/layout/layout.css';

function ChangePassword() {
  const t = useT();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const m = useMutation({
    mutationFn: () => api.auth.changePassword(current, next),
    onSuccess: () => { toast.success(t('settings.passwordChanged')); setCurrent(''); setNext(''); },
  });
  return (
    <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate(); }}>
      <Input label={t('settings.currentPassword')} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      <Input label={t('settings.newPassword')} type="password" autoComplete="new-password" required minLength={8} help={t('settings.minPassword')} value={next} onChange={(e) => setNext(e.target.value)} />
      {m.error && <ErrorBox error={m.error} />}
      <div><Button type="submit" variant="primary" loading={m.isPending} disabled={!current || next.length < 8}>{t('settings.changePassword')}</Button></div>
    </form>
  );
}

function Users() {
  const t = useT();
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<{ id: number; username: string } | null>(null);
  const [form, setForm] = useState({ username: '', displayName: '', password: '', role: 'editor' as Role });
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.auth.users().then((r) => r.users) });
  const create = useMutation({
    mutationFn: () => api.auth.createUser(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setOpen(false); setForm({ username: '', displayName: '', password: '', role: 'editor' }); },
  });
  const update = useMutation({
    mutationFn: ({ id, role }: { id: number; role: Role }) => api.auth.updateUser(id, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.auth.deleteUser(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setToDelete(null); toast.success(t('common.deleted')); },
    onError: (e) => toast.error(e.message),
  });
  const roles: Role[] = ['admin', 'editor', 'viewer'];
  const roleLabel = (r: Role) => t(r === 'admin' ? 'settings.roleAdmin' : r === 'editor' ? 'settings.roleEditor' : 'settings.roleViewer');

  return (
    <Panel title={t('settings.users')} actions={<Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setOpen(true)}>{t('settings.addUser')}</Button>} flush>
      {users.isLoading && <Spinner block />}
      {users.error && <div className="panel__body"><ErrorBox error={users.error} /></div>}
      {users.data && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('login.username')}</th><th>{t('settings.displayName')}</th><th>{t('settings.role')}</th><th></th></tr></thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id}>
                  <td className="mono">{u.username}</td>
                  <td>{u.displayName}</td>
                  <td>
                    <Select size="sm" className="field--auto" value={u.role} disabled={u.id === me?.id} aria-label={t('settings.role')} onChange={(e) => update.mutate({ id: u.id, role: e.target.value as Role })}>
                      {roles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                    </Select>
                  </td>
                  <td className="num">{u.id !== me?.id && <Button variant="ghost" size="sm" iconOnly icon={<Trash2 size={15} />} onClick={() => setToDelete({ id: u.id, username: u.username })}>{t('common.delete')}</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={open} title={t('settings.addUser')} onClose={() => setOpen(false)}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button type="submit" form="user-form" variant="primary" loading={create.isPending} disabled={!form.username || !form.displayName || form.password.length < 8}>{t('common.create')}</Button></>}>
        <form id="user-form" className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }}>
          <Input label={t('login.username')} required autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <Input label={t('settings.displayName')} required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          <Input label={t('login.password')} type="password" autoComplete="new-password" required minLength={8} help={t('settings.minPassword')} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Select label={t('settings.role')} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {roles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </Select>
          {create.error && <ErrorBox error={create.error} />}
        </form>
      </Modal>
      <ConfirmDialog open={!!toDelete} title={t('common.delete')} message={t('common.confirmDelete', { name: toDelete?.username ?? '' })} confirmLabel={t('common.delete')}
        loading={remove.isPending} onConfirm={() => toDelete && remove.mutate(toDelete.id)} onClose={() => setToDelete(null)} />
    </Panel>
  );
}

export function SettingsPage() {
  const t = useT();
  const me = useAuth((s) => s.user);
  const { pref, setPref } = useTheme();
  const { lang, setLang } = useI18nStore();
  return (
    <>
      <Toolbar title={t('settings.title')} />
      <div className="settings-grid">
        <Panel title={t('settings.appearance')}>
          <div className="stack">
            <Labelled label={t('common.theme')}>
              <Segmented<ThemePref> ariaLabel={t('common.theme')} value={pref} onChange={setPref} options={[
                { value: 'light', label: t('common.themeLight') }, { value: 'dark', label: t('common.themeDark') }, { value: 'system', label: t('common.themeSystem') },
              ]} />
            </Labelled>
            <Labelled label={t('common.language')}>
              <Segmented ariaLabel={t('common.language')} value={lang} onChange={setLang} options={[{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }]} />
            </Labelled>
          </div>
        </Panel>
        <Panel title={`${t('settings.account')} · ${me?.username}`}>
          <ChangePassword />
        </Panel>
        {me?.role === 'admin' && <div className="settings-grid__full"><Users /></div>}
      </div>
    </>
  );
}
