import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Database, LayoutDashboard, LogOut, Menu, Settings } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/toast';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/Button';
import './layout.css';

export function AppShell() {
  const t = useT();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const flush = /^\/dashboards\/\d+/.test(location.pathname);

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

  const onLogout = async () => {
    try {
      await logout();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.errorGeneric'));
    }
    navigate('/login');
  };

  return (
    <div className="app">
      {open && <div className="app__scrim" role="presentation" onClick={() => setOpen(false)} />}
      <aside className={['app__sidebar', open && 'app__sidebar--open'].filter(Boolean).join(' ')}>
        <div className="app__brand"><span className="app__brand-mark"><BarChart3 size={16} /></span>{t('app.name')}</div>
        <nav className="app__nav" aria-label={t('nav.menu')}>
          <ul>
            {nav.map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} className="app__navlink" onClick={() => setOpen(false)}>{n.icon}{n.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <header className="app__header">
        <div className="row">
          <Button className="app__menu-btn" variant="ghost" iconOnly icon={<Menu size={18} />} onClick={() => setOpen((o) => !o)} aria-expanded={open}>{t('nav.menu')}</Button>
        </div>
        <div className="row">
          <span className="app__user text-sm text-muted truncate">{user?.displayName}</span>
          <Button variant="ghost" size="sm" icon={<LogOut size={16} />} onClick={onLogout}>{t('nav.logout')}</Button>
        </div>
      </header>
      <main className={['app__main', flush && 'app__main--flush'].filter(Boolean).join(' ')}>
        <Outlet />
      </main>
    </div>
  );
}
