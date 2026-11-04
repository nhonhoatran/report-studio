import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { LANGUAGES, useI18nStore, useT, type TKey } from '@/i18n';
import { api } from '@/api/client';
import { describeError } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { ErrorBox, Spinner } from '@/components/ui/Feedback';
import { Segmented } from '@/components/ui/Segmented';
import '@/components/layout/layout.css';

/** `?error=` codes the server sends back after a failed Microsoft Entra sign-in. */
const ENTRA_ERRORS: Record<string, TKey> = {
  entra_denied: 'login.entraDenied',
  entra_domain: 'login.entraDomain',
  entra_no_account: 'login.entraNoAccount',
  entra_state: 'login.entraExpired',
  entra_failed: 'login.entraFailed',
};

export function LoginPage() {
  const t = useT();
  const { lang, setLang } = useI18nStore();
  const user = useAuth((s) => s.user);
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [params] = useSearchParams();
  const providers = useQuery({ queryKey: ['auth', 'providers'], queryFn: api.auth.providers, staleTime: Infinity, retry: 0 });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [entraErrorKey, setEntraErrorKey] = useState<TKey | null>(() => ENTRA_ERRORS[params.get('error') ?? ''] ?? null);
  const [pending, setPending] = useState(false);

  const from = location.state?.from ?? '/dashboards';
  if (user) return <Navigate to={from} replace />;

  // When the server cannot be asked, fall back to the password form rather than an empty card.
  const local = providers.data ? providers.data.local : !!providers.error;
  const entra = providers.data?.entra ?? false;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true); setError(null); setEntraErrorKey(null);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(describeError(err, t));
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="login">
      <section className="panel login__card" aria-labelledby="login-title">
        <div className="login__brand">
          <span className="app__brand-mark"><BarChart3 size={18} /></span>
          <span>{t('app.name')}</span>
        </div>
        <div className="login__heading">
          <h1 id="login-title">{t('login.title')}</h1>
          <p className="text-sm text-muted">{t('app.tagline')}</p>
        </div>
        {providers.isPending ? <Spinner block /> : (
          <div className="stack">
            {local && (
              <form className="stack" onSubmit={onSubmit}>
                <Input label={t('login.username')} name="username" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
                <Input label={t('login.password')} name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                {error && <ErrorBox>{error}</ErrorBox>}
                <Button type="submit" variant="primary" loading={pending} disabled={!username || !password}>{pending ? t('login.submitting') : t('login.submit')}</Button>
              </form>
            )}
            {local && entra && <div className="login__or" role="separator">{t('login.or')}</div>}
            {entraErrorKey && <ErrorBox>{t(entraErrorKey)}</ErrorBox>}
            {entra && (
              <a className="btn btn--secondary" href={api.auth.entraLoginUrl(from)}>
                <MicrosoftMark />
                {t('login.withMicrosoft')}
              </a>
            )}
            {!local && !entra && <ErrorBox>{t('login.noProviders')}</ErrorBox>}
          </div>
        )}
        <div className="row row--end">
          <Segmented ariaLabel={t('common.language')} value={lang} onChange={setLang} options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} />
        </div>
      </section>
    </main>
  );
}

/** The four-square Microsoft mark, drawn in the button's own text colour. */
function MicrosoftMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden focusable="false">
      <rect x="1" y="1" width="9" height="9" fill="currentColor" />
      <rect x="11" y="1" width="9" height="9" fill="currentColor" />
      <rect x="1" y="11" width="9" height="9" fill="currentColor" />
      <rect x="11" y="11" width="9" height="9" fill="currentColor" />
    </svg>
  );
}
