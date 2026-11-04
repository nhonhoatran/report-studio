import { Link } from 'react-router-dom';
import { useT } from '@/i18n';
import { Toolbar } from '@/components/ui/Toolbar';
import { EmptyState } from '@/components/ui/Feedback';
import '@/components/layout/layout.css';

export function NotFoundPage() {
  const t = useT();
  return (
    <>
      <Toolbar title={t('notFound.title')} />
      <EmptyState title="404" hint={<Link to="/dashboards">{t('notFound.back')}</Link>} />
    </>
  );
}
