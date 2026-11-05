import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import { PERMISSIONS, type Permission, type RoleDefinition } from '@/api/types';
import { toast } from '@/store/toast';
import { useT, type TKey } from '@/i18n';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorBox, Spinner } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';

const ROLE_FORM_ID = 'role-form';
const ROLE_NAME_PATTERN = /^[a-z][a-z0-9_-]{1,31}$/;

/** The dictionary key of a permission's label ("dashboards.view" → settings.permissionLabels.dashboards_view). */
export const permissionLabelKey = (p: Permission): TKey => `settings.permissionLabels.${p.replace('.', '_') as 'dashboards_view'}`;

/** The label of a role as the roles table names it; the built-in three are translated. */
export function roleLabel(role: RoleDefinition | undefined, name: string, t: (k: TKey) => string): string {
  if (name === 'admin') return t('settings.roleAdmin');
  if (name === 'editor') return t('settings.roleEditor');
  if (name === 'viewer') return t('settings.roleViewer');
  return role?.label ?? name;
}

function AddRoleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', label: '' });
  const create = useMutation({
    mutationFn: () => api.roles.create({ name: form.name, label: form.label, permissions: ['dashboards.view'] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); onClose(); },
  });
  const valid = ROLE_NAME_PATTERN.test(form.name) && form.label.trim().length > 0;
  return (
    <Modal open={open} title={t('settings.addRoleTitle')} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form={ROLE_FORM_ID} variant="primary" disabled={!valid} loading={create.isPending}>{t('common.save')}</Button></>}>
      <form id={ROLE_FORM_ID} className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); if (valid) create.mutate(); }}>
        <Input label={t('settings.roleName')} required help={t('settings.roleNameHint')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        <Input label={t('settings.roleLabel')} required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        {create.error && <ErrorBox error={create.error} />}
      </form>
    </Modal>
  );
}

/** Settings › roles & permissions: one column per role, one row per permission; a change saves at once. */
export function RolesPanel() {
  const t = useT();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<RoleDefinition | null>(null);
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.roles.list().then((r) => r.roles) });
  const update = useMutation({
    mutationFn: ({ name, permissions }: { name: string; permissions: Permission[] }) => api.roles.update(name, { permissions }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({
    mutationFn: (name: string) => api.roles.remove(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); setToDelete(null); toast.success(t('common.deleted')); },
    onError: (e) => toast.error(e),
  });
  const toggle = (role: RoleDefinition, p: Permission, on: boolean) => {
    const permissions = on ? [...role.permissions, p] : role.permissions.filter((x) => x !== p);
    update.mutate({ name: role.name, permissions });
  };

  return (
    <Panel title={t('settings.roles')} actions={<Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setAdding(true)}>{t('settings.addRole')}</Button>} flush>
      {roles.isLoading && <Spinner block />}
      {roles.error && <div className="panel__body"><ErrorBox error={roles.error} /></div>}
      {roles.data && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('settings.permission')}</th>
                {roles.data.map((r) => (
                  <th key={r.name} className="num">
                    <span className="row row--end">
                      <span title={r.name}>{roleLabel(r, r.name, t)}</span>
                      {r.builtin
                        ? <span className="badge">{t('settings.builtin')}</span>
                        : <Button variant="ghost" size="sm" iconOnly icon={<Trash2 size={14} />} onClick={() => setToDelete(r)}>{t('settings.deleteRole')}</Button>}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p}>
                  <td><span className="stack-tight"><span>{t(permissionLabelKey(p))}</span><span className="mono text-faint text-xs">{p}</span></span></td>
                  {roles.data!.map((r) => (
                    <td key={r.name} className="num">
                      <input type="checkbox" className="checkbox" aria-label={`${roleLabel(r, r.name, t)}: ${t(permissionLabelKey(p))}`}
                        checked={r.permissions.includes(p)} disabled={r.name === 'admin' || update.isPending} onChange={(e) => toggle(r, p, e.target.checked)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="panel__body"><p className="text-sm text-muted">{t('settings.rolesHint')}</p></div>
      <AddRoleModal key={adding ? 'open' : 'closed'} open={adding} onClose={() => setAdding(false)} />
      <ConfirmDialog open={!!toDelete} title={t('settings.deleteRole')} message={t('common.confirmDelete', { name: toDelete?.label ?? '' })} confirmLabel={t('common.delete')}
        loading={remove.isPending} onConfirm={() => toDelete && remove.mutate(toDelete.name)} onClose={() => setToDelete(null)} />
    </Panel>
  );
}
