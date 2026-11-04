import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Database, LayoutDashboard, LogOut, Menu, Moon, Settings, Sun } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/store/theme';
import { useI18nStore, useT } from '@/i18n';
import { Button } from '@/components/ui/Button';
import './layout.css';

export function AppShell() {
  const t = useT();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const { resolved, setPref } = useTheme();
  const { lang, setLang } = useI18nStore();
  const [open, setOpen] = useState(false);
  const flush = /^\/dashboards\/\d+/.test(location.pathname);

  const nav = [
    { to: '/dashboards', icon: <LayoutDashboard size={18} />, label: t('nav.dashboards') },
    { to: '/datasources', icon: <Database size={18} />, label: t('nav.datasources') },
    { to: '/settings', icon: <Settings size={18} />, label: t('nav.settings') },
  ];

  return (
    <div className="app">
      {open && <div className="app__scrim" onClick={() => setOpen(false)} />}
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
        <div className="app__sidebar-footer">
          <div className="row-between">
            <span>{t('common.language')}</span>
            <select className="field__control field__control--sm" style={{ width: 'auto' }} value={lang} onChange={(e) => setLang(e.target.value as 'vi' | 'en')} aria-label={t('common.language')}>
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </aside>
      <header className="app__header">
        <div className="row">
          <Button className="app__menu-btn" variant="ghost" iconOnly icon={<Menu size={18} />} onClick={() => setOpen((o) => !o)}>{t('nav.menu')}</Button>
        </div>
        <div className="row">
          <Button variant="ghost" iconOnly icon={resolved === 'dark' ? <Sun size={18} /> : <Moon size={18} />} onClick={() => setPref(resolved === 'dark' ? 'light' : 'dark')}>
            {t('common.theme')}
          </Button>
          <span className="text-sm text-muted truncate" style={{ maxWidth: 160 }}>{user?.displayName}</span>
          <Button variant="ghost" size="sm" icon={<LogOut size={16} />} onClick={async () => { await logout(); navigate('/login'); }}>{t('nav.logout')}</Button>
        </div>
      </header>
      <main className={['app__main', flush && 'app__main--flush'].filter(Boolean).join(' ')}>
        <Outlet />
      </main>
    </div>
  );
}
