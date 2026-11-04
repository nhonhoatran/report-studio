import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import type { Role } from '@/api/types';
import { useAuth } from '@/store/auth';
import { ACCENTS, PALETTES, RADII, TEXT_SCALES, isDefaultAppearance, useTheme, type Accent, type Palette, type Radius, type TextScale, type ThemePref } from '@/store/theme';
import { toast } from '@/store/toast';
import { LANGUAGES, useI18nStore, useT, type Lang } from '@/i18n';
import { Toolbar } from '@/components/ui/Toolbar';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Input, Labelled, Select } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Segmented } from '@/components/ui/Segmented';
import { Swatches } from '@/components/ui/Swatches';
import { ErrorBox, Spinner } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { AiProvidersPanel } from '@/components/settings/AiProvidersPanel';
import { formatNumber } from '@/lib/format';
import '@/components/layout/layout.css';
import '@/components/charts/charts.css';

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

// Sample values for the preview bars (data, like a chart's rows; the colours come from the tokens).
const PREVIEW_BARS = [42, 68, 55, 80, 61, 73, 49, 88];
const PREVIEW_TOTAL = 1_284_500_000;

/** A sample widget and KPI so a chosen accent and palette can be seen without opening a dashboard. */
function LookPreview() {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  return (
    <div className="look__preview" aria-hidden>
      <div className="look__widget">
        <span className="widget__title">{t('settings.previewWidget')}</span>
        <div className="look__bars">
          {PREVIEW_BARS.map((v, i) => <span key={i} className="look__bar" style={{ height: `${v}%` }} />)}
        </div>
      </div>
      <div className="look__widget">
        <div className="kpi">
          <span className="kpi__label">{t('settings.previewKpi')}</span>
          <span className="kpi__value">{formatNumber(PREVIEW_TOTAL, 'compact', lang)}</span>
        </div>
      </div>
    </div>
  );
}

/** Every choice applies at once and is saved to the user's account shortly after (store/theme.ts). */
function Look() {
  const t = useT();
  const appearance = useTheme((s) => s.appearance);
  const update = useTheme((s) => s.update);
  const reset = useTheme((s) => s.reset);
  const lang = useI18nStore((s) => s.lang);
  return (
    <Panel title={t('settings.appearance')}
      actions={<Button size="sm" icon={<RotateCcw size={14} />} disabled={isDefaultAppearance(appearance)} onClick={reset}>{t('settings.lookReset')}</Button>}>
      <div className="look">
        <div className="stack">
          <Labelled label={t('common.theme')}>
            <Segmented<ThemePref> ariaLabel={t('common.theme')} value={appearance.theme} onChange={(theme) => update({ theme })} options={[
              { value: 'light', label: t('common.themeLight') }, { value: 'dark', label: t('common.themeDark') }, { value: 'system', label: t('common.themeSystem') },
            ]} />
          </Labelled>
          <Labelled label={t('settings.accent')}>
            <Swatches<Accent> kind="accent" ariaLabel={t('settings.accent')} value={appearance.accent} onChange={(accent) => update({ accent })}
              options={ACCENTS.map((a) => ({ value: a, label: t(`accent.${a}`) }))} />
          </Labelled>
          <Labelled label={t('settings.palette')}>
            <Swatches<Palette> kind="palette" ariaLabel={t('settings.palette')} value={appearance.palette} onChange={(palette) => update({ palette })}
              options={PALETTES.map((p) => ({ value: p, label: t(`palette.${p}`) }))} />
          </Labelled>
          <Labelled label={t('settings.textSize')}>
            <Segmented<TextScale> ariaLabel={t('settings.textSize')} value={appearance.text} onChange={(text) => update({ text })}
              options={TEXT_SCALES.map((v) => ({ value: v, label: t(`textSize.${v}`) }))} />
          </Labelled>
          <Labelled label={t('settings.corners')}>
            <Segmented<Radius> ariaLabel={t('settings.corners')} value={appearance.radius} onChange={(radius) => update({ radius })}
              options={RADII.map((v) => ({ value: v, label: t(`corners.${v}`) }))} />
          </Labelled>
          <Labelled label={t('common.language')}>
            <Segmented<Lang> ariaLabel={t('common.language')} value={lang} onChange={(l) => update({ lang: l })} options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} />
          </Labelled>
          <p className="text-sm text-muted">{t('settings.lookHint')}</p>
        </div>
        <LookPreview />
      </div>
    </Panel>
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
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.auth.deleteUser(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setToDelete(null); toast.success(t('common.deleted')); },
    onError: (e) => toast.error(e),
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
            <thead><tr><th>{t('login.username')}</th><th>{t('settings.displayName')}</th><th>{t('settings.loginMethod')}</th><th>{t('settings.role')}</th><th></th></tr></thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id}>
                  <td className="mono">{u.username}</td>
                  <td>{u.displayName}</td>
                  <td><span className="badge">{u.provider === 'entra' ? t('settings.providerEntra') : t('settings.providerLocal')}</span></td>
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
  return (
    <>
      <Toolbar title={t('settings.title')} />
      <div className="settings-grid">
        <div className="settings-grid__full"><Look /></div>
        <Panel title={`${t('settings.account')} · ${me?.username}`}>
          {me?.hasPassword === false ? <p className="text-sm text-muted">{t('settings.managedByEntra')}</p> : <ChangePassword />}
        </Panel>
        {me?.role === 'admin' && <div className="settings-grid__full"><Users /></div>}
        {me?.role === 'admin' && <div className="settings-grid__full"><AiProvidersPanel /></div>}
      </div>
    </>
  );
}
