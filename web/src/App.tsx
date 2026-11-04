import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { onUnauthorized } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useI18nStore } from '@/i18n';
import { Spinner, Toasts } from '@/components/ui/Feedback';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardsPage } from '@/pages/DashboardsPage';
import { DashboardEditorPage } from '@/pages/DashboardEditorPage';
import { DatasourcesPage } from '@/pages/DatasourcesPage';
import { DatasourceDetailPage } from '@/pages/DatasourceDetailPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 } },
});

function RequireAuth() {
  const { user, status, load } = useAuth();
  const location = useLocation();
  useEffect(() => { if (status === 'idle') void load(); }, [status, load]);
  if (status !== 'ready') return <div style={{ padding: 'var(--space-8)' }}><Spinner block /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function App() {
  const clear = useAuth((s) => s.clear);
  const lang = useI18nStore((s) => s.lang);
  useEffect(() => onUnauthorized(() => { clear(); queryClient.clear(); }), [clear]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route index element={<Navigate to="/dashboards" replace />} />
              <Route path="/dashboards" element={<DashboardsPage />} />
              <Route path="/dashboards/:id" element={<DashboardEditorPage mode="view" />} />
              <Route path="/dashboards/:id/edit" element={<DashboardEditorPage mode="edit" />} />
              <Route path="/datasources" element={<DatasourcesPage />} />
              <Route path="/datasources/:id" element={<DatasourceDetailPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
      <Toasts />
    </QueryClientProvider>
  );
}
