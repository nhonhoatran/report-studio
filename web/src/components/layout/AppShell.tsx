import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Database, LayoutDashboard, LogOut, Menu, Settings } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/store/theme';
import { toast } from '@/store/toast';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/Button';
import './layout.css';

/** Up to two letters for the avatar disc: the first letters of the first and last words of the name. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]![0] ?? '';
  const last = words.length > 1 ? words[words.length - 1]![0] ?? '' : '';
  return (first + last).toUpperCase();
}

export function AppShell() {
  const t = useT();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const flush = /^\/dashboards\/\d+/.test(location.pathname);

  // the signed-in user's look follows them: fetched once per user, applied over the browser's copy
  const userId = user?.id;
  useEffect(() => { if (userId) void useTheme.getState().load(); }, [userId]);

  // the drawer closes on Escape like a dialog would
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);

  const nav = [
    { to: '/dashboards', icon: <LayoutDashboard size={18} />, label: t('nav.dashboards') },
    { to: '/datasources', icon: <Database size={18} />, label: t('nav.datasources') },
    { to: '/settings', icon: <Settings size={18} />, label: t('nav.settings') },
  ];
  const roleLabel = user ? t(user.role === 'admin' ? 'settings.roleAdmin' : user.role === 'editor' ? 'settings.roleEditor' : 'settings.roleViewer') : '';

  const onLogout = async () => {
    try {
      await logout();
    } catch (err) {
      toast.error(err);
    }
    navigate('/login');
  };

  return (
    <div className="app">
      {open && <div className="app__scrim" role="presentation" onClick={() => setOpen(false)} />}
      <aside className={['app__sidebar', open && 'app__sidebar--open'].filter(Boolean).join(' ')}>
        <div className="app__brand"><span className="app__brand-mark"><BarChart3 size={18} /></span>{t('app.name')}</div>
        <nav className="app__nav" aria-label={t('nav.menu')}>
          <ul>
            {nav.map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} className="app__navlink" onClick={() => setOpen(false)}>{n.icon}{n.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
        {user && (
          <div className="app__account">
            <span className="app__avatar" aria-hidden>{initials(user.displayName)}</span>
            <div className="app__account-text">
              <span className="app__account-name truncate">{user.displayName}</span>
              <span className="app__account-role truncate">{roleLabel}</span>
            </div>
            <Button variant="ghost" size="sm" iconOnly icon={<LogOut size={16} />} onClick={onLogout}>{t('nav.logout')}</Button>
          </div>
        )}
      </aside>
      {/* narrow screens only: the menu button that opens the drawer */}
      <header className="app__header">
        <Button className="app__menu-btn" variant="ghost" iconOnly icon={<Menu size={18} />} onClick={() => setOpen((o) => !o)} aria-expanded={open}>{t('nav.menu')}</Button>
        <div className="app__brand"><span className="app__brand-mark"><BarChart3 size={18} /></span>{t('app.name')}</div>
      </header>
      <main className={['app__main', flush && 'app__main--flush'].filter(Boolean).join(' ')}>
        <Outlet />
      </main>
    </div>
  );
}
