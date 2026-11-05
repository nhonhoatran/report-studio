import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import type { DashboardPage } from '@/api/types';
import { useT } from '@/i18n';
import { useEditor } from '@/store/editor';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const FORM_ID = 'page-name-form';
/** what the server accepts for a page name (routes/dashboards.ts) */
const PAGE_NAME_MAX = 120;

/** Rename one page: the only thing a page carries besides its widgets. */
function PageNameDialog({ page, onClose }: { page: DashboardPage | null; onClose: () => void }) {
  const t = useT();
  const renamePage = useEditor((s) => s.renamePage);
  const [name, setName] = useState(page?.name ?? '');
  const valid = name.trim().length > 0;
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!page || !valid) return;
    renamePage(page.id, name.trim());
    onClose();
  };
  return (
    <Modal open={!!page} title={t('pages.renameTitle')} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form={FORM_ID} variant="primary" disabled={!valid}>{t('common.save')}</Button></>}>
      <form id={FORM_ID} className="stack" onSubmit={onSubmit}>
        <Input label={t('pages.name')} value={name} maxLength={PAGE_NAME_MAX} onChange={(e) => setName(e.target.value)} required autoFocus />
      </form>
    </Modal>
  );
}

/**
 * The report's pages as a row of links above the filters; the URL names the page, so a link to
 * a page opens on it. In edit mode the active page carries its tools (rename, duplicate, move,
 * remove) and the row ends with "add page". A single-page report shows no row to a viewer.
 */
export function PageTabs({ editable }: { editable: boolean }) {
  const t = useT();
  const pages = useEditor((s) => s.definition.pages);
  const activePageId = useEditor((s) => s.activePageId);
  const addPage = useEditor((s) => s.addPage);
  const duplicatePage = useEditor((s) => s.duplicatePage);
  const removePage = useEditor((s) => s.removePage);
  const movePage = useEditor((s) => s.movePage);
  const [params] = useSearchParams();
  const [renaming, setRenaming] = useState<DashboardPage | null>(null);
  const [removing, setRemoving] = useState<DashboardPage | null>(null);

  if (!editable && pages.length <= 1) return null;
  const index = Math.max(0, pages.findIndex((p) => p.id === activePageId));
  const active = pages[index]!;
  // the first page is the plain URL, every other one is named in it
  const searchFor = (i: number, page: DashboardPage): string => {
    const next = new URLSearchParams(params);
    if (i === 0) next.delete('page'); else next.set('page', page.id);
    const q = next.toString();
    return q ? `?${q}` : '';
  };

  return (
    <div className="page-tabs">
      <nav className="page-tabs__nav" aria-label={t('pages.title')}>
        <ul className="page-tabs__list">
          {pages.map((p, i) => (
            <li key={p.id}>
              <Link className="page-tabs__link" to={{ search: searchFor(i, p) }} aria-current={p.id === active.id ? 'page' : undefined}>{p.name}</Link>
            </li>
          ))}
        </ul>
      </nav>
      {editable && (
        <div className="page-tabs__tools">
          <Button variant="ghost" size="sm" iconOnly icon={<Pencil size={14} />} onClick={() => setRenaming(active)}>{t('pages.rename')}</Button>
          <Button variant="ghost" size="sm" iconOnly icon={<Copy size={14} />} onClick={() => duplicatePage(active.id)}>{t('pages.duplicate')}</Button>
          <Button variant="ghost" size="sm" iconOnly icon={<ChevronLeft size={14} />} disabled={index === 0} onClick={() => movePage(active.id, -1)}>{t('pages.moveLeft')}</Button>
          <Button variant="ghost" size="sm" iconOnly icon={<ChevronRight size={14} />} disabled={index >= pages.length - 1} onClick={() => movePage(active.id, 1)}>{t('pages.moveRight')}</Button>
          <Button variant="ghost" size="sm" iconOnly icon={<Trash2 size={14} />} disabled={pages.length <= 1} onClick={() => setRemoving(active)}>{t('pages.remove')}</Button>
          <Button size="sm" icon={<Plus size={14} />} onClick={() => addPage()}>{t('pages.add')}</Button>
        </div>
      )}
      {editable && <PageNameDialog key={renaming?.id ?? 'closed'} page={renaming} onClose={() => setRenaming(null)} />}
      {editable && (
        <ConfirmDialog open={!!removing} title={t('common.delete')} message={t('pages.confirmRemove', { name: removing?.name ?? '', count: removing?.widgets.length ?? 0 })}
          confirmLabel={t('common.delete')} onConfirm={() => { if (removing) removePage(removing.id); setRemoving(null); }} onClose={() => setRemoving(null)} />
      )}
    </div>
  );
}
