import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useT } from '@/i18n';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { ErrorBox } from '@/components/ui/Feedback';
import '@/components/layout/layout.css';

export function LoginPage() {
  const t = useT();
  const user = useAuth((s) => s.user);
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to={location.state?.from ?? '/dashboards'} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true); setError(null);
    try {
      await login(username, password);
      navigate(location.state?.from ?? '/dashboards', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? t('login.failed') : err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="login">
      <section className="panel login__card" aria-labelledby="login-title">
        <div className="login__brand">
          <span className="app__brand-mark"><BarChart3 size={16} /></span>
          <div>
            <h1 id="login-title">{t('login.title')}</h1>
            <p className="text-sm text-muted">{t('app.name')} · {t('app.tagline')}</p>
          </div>
        </div>
        <form className="stack" onSubmit={onSubmit}>
          <Input label={t('login.username')} name="username" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          <Input label={t('login.password')} name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <ErrorBox>{error}</ErrorBox>}
          <Button type="submit" variant="primary" loading={pending} disabled={!username || !password}>{pending ? t('login.submitting') : t('login.submit')}</Button>
        </form>
      </section>
    </main>
  );
}
