import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import { can, useAuth } from '@/store/auth';
import { toast } from '@/store/toast';
import { useT } from '@/i18n';
import { Toolbar } from '@/components/ui/Toolbar';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { ErrorBox } from '@/components/ui/Feedback';
import { AiProvidersPanel } from '@/components/settings/AiProvidersPanel';
import { AppearancePanel } from '@/components/settings/AppearancePanel';
import { UsersPanel } from '@/components/settings/UsersPanel';
import { RolesPanel } from '@/components/settings/RolesPanel';
import { PoliciesPanel } from '@/components/settings/PoliciesPanel';
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

export function SettingsPage() {
  const t = useT();
  const me = useAuth((s) => s.user);
  return (
    <>
      <Toolbar title={t('settings.title')} />
      <div className="panel-grid">
        <div className="panel-grid__full"><AppearancePanel /></div>
        <Panel title={t('settings.account')} actions={<span className="text-sm text-muted mono">{me?.username}</span>}>
          {me?.hasPassword === false ? <p className="text-sm text-muted">{t('settings.managedByEntra')}</p> : <ChangePassword />}
        </Panel>
        {can(me, 'users.manage') && <div className="panel-grid__full"><UsersPanel /></div>}
        {can(me, 'roles.manage') && <div className="panel-grid__full"><RolesPanel /></div>}
        {can(me, 'policies.manage') && <div className="panel-grid__full"><PoliciesPanel /></div>}
        {can(me, 'ai.manage') && <div className="panel-grid__full"><AiProvidersPanel /></div>}
      </div>
    </>
  );
}
