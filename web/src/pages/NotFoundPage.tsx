import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/Feedback';

export function NotFoundPage() {
  return <EmptyState title="404" hint={<Link to="/dashboards">← Report Studio</Link>} />;
}
