import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plug, Plus, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import { AI_PROVIDER_KINDS, type AiProvider, type AiProviderInput, type AiProviderKind, type Role } from '@/api/types';
import { useAuth } from '@/store/auth';
import { useTheme, type ThemePref } from '@/store/theme';
import { toast } from '@/store/toast';
import { LANGUAGES, useI18nStore, useT, type TKey } from '@/i18n';
import { describeError, describeServerError } from '@/lib/errors';
import { Toolbar } from '@/components/ui/Toolbar';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Labelled, Select } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState, ErrorBox, Notice, Spinner } from '@/components/ui/Feedback';
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

// --- AI providers: one row per API key the editor may use --------------------------------------

const AI_FORM_ID = 'ai-provider-form';
/** Placeholder only; the admin types the model id the provider documents. */
const MODEL_PLACEHOLDER: Record<AiProviderKind, string> = { anthropic: 'claude-opus-5-5', openai: 'gpt-4o-mini', gemini: 'gemini-2.5-flash', openai_compatible: 'llama3.1' };
const kindKey = (k: AiProviderKind): TKey => (k === 'anthropic' ? 'ai.kindAnthropic' : k === 'openai' ? 'ai.kindOpenai' : k === 'gemini' ? 'ai.kindGemini' : 'ai.kindCompatible');
const blankProvider: AiProviderInput = { name: '', kind: 'anthropic', model: '', baseUrl: '', apiKey: '', isDefault: false };

/** Add / edit dialog; the key is write-only (blank on edit keeps the saved one) and can be tested before saving. */
function AiProviderModal({ open, initial, onClose }: { open: boolean; initial: AiProvider | null; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState<AiProviderInput>(initial ? { name: initial.name, kind: initial.kind, model: initial.model, baseUrl: initial.baseUrl, apiKey: '', isDefault: initial.isDefault } : blankProvider);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const set = <K extends keyof AiProviderInput>(k: K, v: AiProviderInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const needsUrl = form.kind === 'openai_compatible';

  const test = useMutation({
    mutationFn: () => api.ai.testProvider({ kind: form.kind, model: form.model, baseUrl: form.baseUrl || undefined, apiKey: form.apiKey || undefined, id: initial?.id }),
    onSuccess: (r) => {
      setTestOk(r.ok);
      setTestResult(r.ok
        ? t('ai.testOk', { model: r.model ?? form.model, ms: r.latencyMs ?? 0 })
        : t('ai.testFail', { error: describeServerError({ code: r.code, message: r.error, details: r.details }, t) }));
    },
    onError: (e) => { setTestOk(false); setTestResult(describeError(e, t)); },
  });
  const save = useMutation({
    mutationFn: () => initial
      ? api.ai.updateProvider(initial.id, { ...form, apiKey: form.apiKey || undefined })
      : api.ai.createProvider(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai-providers'] }); onClose(); },
  });

  const testable = !!(form.model && (initial || form.apiKey) && (!needsUrl || form.baseUrl));
  const valid = !!(form.name && testable);
  const onSubmit = (e: FormEvent) => { e.preventDefault(); if (valid) save.mutate(); };

  return (
    <Modal
      open={open}
      title={initial ? t('ai.editProviderTitle') : t('ai.addProviderTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form={AI_FORM_ID} variant="primary" disabled={!valid} loading={save.isPending}>{t('common.save')}</Button>
        </>
      }
    >
      <form id={AI_FORM_ID} onSubmit={onSubmit} className="stack">
        <p className="text-sm text-muted">{t('ai.keyHint')}</p>
        <div className="form-grid">
          <Input className="span-2" label={t('common.name')} required value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
          <Select label={t('ai.kind')} value={form.kind} onChange={(e) => set('kind', e.target.value as AiProviderKind)}>
            {AI_PROVIDER_KINDS.map((k) => <option key={k} value={k}>{t(kindKey(k))}</option>)}
          </Select>
          <Input label={t('ai.model')} required placeholder={MODEL_PLACEHOLDER[form.kind]} help={t('ai.modelHint')} value={form.model} onChange={(e) => set('model', e.target.value)} />
          <Input className="span-2" label={t('ai.baseUrl')} type="url" required={needsUrl} hint={needsUrl ? undefined : t('common.optional')}
            placeholder={needsUrl ? t('ai.baseUrlPlaceholder') : undefined} help={needsUrl ? undefined : t('ai.baseUrlKeep')}
            value={form.baseUrl ?? ''} onChange={(e) => set('baseUrl', e.target.value)} />
          <Input className="span-2" label={t('ai.apiKey')} type="password" autoComplete="new-password" required={!initial} hint={initial ? t('common.optional') : undefined}
            help={initial ? t('ai.apiKeyKeep') : undefined} value={form.apiKey ?? ''} onChange={(e) => set('apiKey', e.target.value)} />
          <Checkbox className="span-2" label={t('ai.isDefault')} checked={!!form.isDefault} disabled={initial?.isDefault} onChange={(e) => set('isDefault', e.target.checked)} />
        </div>
        <div className="row row--wrap">
          <Button icon={<Plug size={16} />} onClick={() => test.mutate()} loading={test.isPending} disabled={!testable}>{test.isPending ? t('datasources.testing') : t('common.test')}</Button>
        </div>
        {testResult && <Notice kind={testOk ? 'success' : 'error'}>{testResult}</Notice>}
        {save.error && <ErrorBox error={save.error} />}
      </form>
    </Modal>
  );
}

function AiProviders() {
  const t = useT();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AiProvider | null | 'new'>(null);
  const [toDelete, setToDelete] = useState<AiProvider | null>(null);
  const providers = useQuery({ queryKey: ['ai-providers'], queryFn: () => api.ai.providers().then((r) => r.providers) });
  const remove = useMutation({
    mutationFn: (id: number) => api.ai.removeProvider(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai-providers'] }); setToDelete(null); toast.success(t('common.deleted')); },
    onError: (e) => toast.error(e),
  });

  return (
    <Panel title={t('ai.providers')} actions={<Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>{t('ai.addProvider')}</Button>} flush>
      {providers.isLoading && <Spinner block />}
      {providers.error && <div className="panel__body"><ErrorBox error={providers.error} /></div>}
      {providers.data && providers.data.length === 0 && <EmptyState compact title={t('ai.empty')} hint={t('ai.emptyHint')} />}
      {providers.data && providers.data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('common.name')}</th><th>{t('ai.kind')}</th><th>{t('ai.model')}</th><th className="num">{t('common.actions')}</th></tr></thead>
            <tbody>
              {providers.data.map((p) => (
                <tr key={p.id}>
                  <td>{p.name} {p.isDefault && <span className="badge">{t('common.default')}</span>}</td>
                  <td>{t(kindKey(p.kind))}</td>
                  <td className="mono">{p.model}</td>
                  <td className="num">
                    <div className="row row--end">
                      <Button variant="ghost" size="sm" iconOnly icon={<Pencil size={15} />} onClick={() => setEditing(p)}>{t('common.edit')}</Button>
                      <Button variant="ghost" size="sm" iconOnly icon={<Trash2 size={15} />} onClick={() => setToDelete(p)}>{t('common.delete')}</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AiProviderModal key={editing === 'new' ? 'new' : editing?.id ?? 'closed'} open={editing !== null} initial={editing === 'new' || editing === null ? null : editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!toDelete} title={t('common.delete')} message={t('common.confirmDelete', { name: toDelete?.name ?? '' })} confirmLabel={t('common.delete')}
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
              <Segmented ariaLabel={t('common.language')} value={lang} onChange={setLang} options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} />
            </Labelled>
          </div>
        </Panel>
        <Panel title={`${t('settings.account')} · ${me?.username}`}>
          <ChangePassword />
        </Panel>
        {me?.role === 'admin' && <div className="settings-grid__full"><Users /></div>}
        {me?.role === 'admin' && <div className="settings-grid__full"><AiProviders /></div>}
      </div>
    </>
  );
}
