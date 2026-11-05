import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { ArrowLeft, Eye, Pencil, Plus, RefreshCw, Save, Sparkles } from 'lucide-react';
import { api } from '@/api/client';
import type { FieldInfo } from '@/api/types';
import { useAuth, can, canEdit } from '@/store/auth';
import { useEditor } from '@/store/editor';
import { toast } from '@/store/toast';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { ErrorBox, Spinner } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { KindIcon } from '@/components/ui/KindBadge';
import { FieldsPane, FIELD_DRAG_PREFIX } from '@/components/editor/FieldsPane';
import { Canvas, WIDGET_DROP_PREFIX } from '@/components/editor/Canvas';
import { FilterBar } from '@/components/editor/FilterBar';
import { PageTabs } from '@/components/editor/PageTabs';
import { VisualPane, WELL_DROP_PREFIX } from '@/components/editor/VisualPane';
import { AiSuggestDialog } from '@/components/editor/AiSuggestDialog';
import '@/components/editor/editor.css';

/** Shared by the edit and view routes: `mode` decides which panes render. */
export function DashboardEditorPage({ mode }: { mode: 'edit' | 'view' }) {
  const t = useT();
  const params = useParams();
  const id = Number(params.id);
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const urlPage = search.get('page');
  const user = useAuth((s) => s.user);
  const ed = useEditor();
  const qc = useQueryClient();
  const [dragging, setDragging] = useState<FieldInfo | null>(null);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  // the AI dialog is re-keyed on every open so an old answer never shows up again
  const [ai, setAi] = useState<{ open: boolean; key: number }>({ open: false, key: 0 });

  const dashboard = useQuery({ queryKey: ['dashboard', id], queryFn: () => api.dashboards.get(id).then((r) => r.dashboard), enabled: Number.isInteger(id) });
  // the permission, and the server's own answer for this dashboard (a policy may close it to this user)
  const mayEdit = canEdit(user) && dashboard.data?.canEdit !== false;
  const editable = mode === 'edit' && mayEdit;
  const manageFilters = can(user, 'dashboards.filters');

  useEffect(() => { if (dashboard.data) ed.load(dashboard.data, urlPage); }, [dashboard.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { ed.setMode(editable ? 'edit' : 'view'); }, [editable]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => ed.reset(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // The URL names the page (`?page=`; the first page is the bare URL), so a link opens on the right one.
  // A URL change (a tab, the back button) moves the canvas; a canvas change (add, remove a page) rewrites the URL.
  const loaded = ed.dashboardId === id;
  const pageIds = ed.definition.pages.map((p) => p.id);
  const firstPage = pageIds[0];
  useEffect(() => {
    if (!loaded) return;
    const target = urlPage && pageIds.includes(urlPage) ? urlPage : firstPage;
    if (target && target !== ed.activePageId) ed.setActivePage(target);
  }, [urlPage, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const urlPageRef = useRef(urlPage);
  urlPageRef.current = urlPage;
  useEffect(() => {
    if (!loaded || !ed.activePageId) return;
    const want = ed.activePageId === firstPage ? null : ed.activePageId;
    if ((urlPageRef.current ?? null) === want) return;
    setSearch((prev) => { const next = new URLSearchParams(prev); if (want) next.set('page', want); else next.delete('page'); return next; }, { replace: true });
  }, [ed.activePageId, loaded, firstPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!ed.dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [ed.dirty]);

  const save = useMutation({
    mutationFn: () => api.dashboards.update(id, { name: ed.name || t('dashboards.untitled'), description: ed.description, definition: ed.definition }),
    onSuccess: () => { ed.markSaved(); toast.success(t('editor.saved')); },
    onError: (e) => toast.error(e),
  });

  // Ctrl/Cmd+S
  useEffect(() => {
    if (!editable) return;
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save.mutate(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [editable, save]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragStart = (e: DragStartEvent) => setDragging((e.active.data.current as { field?: FieldInfo } | undefined)?.field ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const field = (e.active.data.current as { field?: FieldInfo } | undefined)?.field;
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!field || !overId || !String(e.active.id).startsWith(FIELD_DRAG_PREFIX)) return;
    if (overId.startsWith(WIDGET_DROP_PREFIX)) {
      const widgetId = overId.slice(WIDGET_DROP_PREFIX.length);
      ed.select(widgetId);
      ed.dropField(widgetId, field);
    } else if (overId.startsWith(WELL_DROP_PREFIX) && ed.selectedId) {
      ed.dropField(ed.selectedId, field, overId.slice(WELL_DROP_PREFIX.length) as 'dimensions' | 'measures');
    }
  };

  const leave = (to: string) => {
    if (ed.dirty) setLeaveTo(to);
    else navigate(to);
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ['widget-query'] });

  if (dashboard.isLoading || dashboard.error) {
    return (
      <div className="editor">
        <div className="editor__bar">
          <div className="row grow">
            <Button variant="ghost" iconOnly icon={<ArrowLeft size={18} />} onClick={() => navigate('/dashboards')}>{t('common.back')}</Button>
            <h1 className="editor__name truncate">{t('nav.dashboards')}</h1>
          </div>
        </div>
        <div className="editor__loading">{dashboard.error ? <ErrorBox error={dashboard.error} /> : <Spinner block />}</div>
      </div>
    );
  }

  return (
    <div className="editor">
      <div className="editor__bar">
        <div className="row grow">
          <Button variant="ghost" iconOnly icon={<ArrowLeft size={18} />} onClick={() => leave('/dashboards')}>{t('common.back')}</Button>
          {editable ? (
            <>
              <h1 className="sr-only">{ed.name || t('dashboards.untitled')}</h1>
              <input className="editor__name grow" aria-label={t('editor.nameLabel')} value={ed.name} onChange={(e) => ed.setName(e.target.value)} placeholder={t('dashboards.untitled')} />
            </>
          ) : (
            <h1 className="editor__name truncate">{ed.name}</h1>
          )}
          {editable && <span className={['editor__status', ed.dirty && 'editor__status--dirty'].filter(Boolean).join(' ')}>{ed.dirty ? t('editor.unsaved') : t('editor.saved')}</span>}
        </div>
        <div className="row">
          {editable ? (
            <>
              <Button icon={<Plus size={16} />} onClick={() => ed.addWidget()}>{t('editor.addVisual')}</Button>
              {can(user, 'ai.suggest') && <Button icon={<Sparkles size={16} />} onClick={() => setAi((a) => ({ open: true, key: a.key + 1 }))}>{t('ai.suggest')}</Button>}
              <Button icon={<Eye size={16} />} onClick={() => leave(`/dashboards/${id}`)}>{t('editor.view')}</Button>
              <Button variant="primary" icon={<Save size={16} />} onClick={() => save.mutate()} loading={save.isPending} disabled={!ed.dirty && !save.isError}>{t('common.save')}</Button>
            </>
          ) : (
            <>
              <Button icon={<RefreshCw size={16} />} onClick={refresh}>{t('common.refresh')}</Button>
              {mayEdit && <Button variant="primary" icon={<Pencil size={16} />} onClick={() => navigate(`/dashboards/${id}/edit`)}>{t('editor.edit')}</Button>}
            </>
          )}
        </div>
      </div>
      {editable ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="editor__body">
            <FieldsPane />
            <div className="editor__main">
              <PageTabs editable />
              <FilterBar editable manage={manageFilters} />
              <Canvas editable />
            </div>
            <VisualPane />
          </div>
          <DragOverlay dropAnimation={null}>
            {dragging && <div className="drag-chip"><KindIcon kind={dragging.kind} />{dragging.name}</div>}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="editor__body editor__body--view">
          <div className="editor__main">
            <PageTabs editable={false} />
            <FilterBar editable={false} manage={false} />
            <Canvas editable={false} />
          </div>
        </div>
      )}
      {editable && <AiSuggestDialog key={ai.key} open={ai.open} onClose={() => setAi((a) => ({ ...a, open: false }))} />}
      <ConfirmDialog open={!!leaveTo} title={t('editor.unsaved')} message={t('editor.unsavedLeave')} confirmLabel={t('editor.leave')}
        onConfirm={() => { const to = leaveTo!; setLeaveTo(null); ed.markSaved(); navigate(to); }} onClose={() => setLeaveTo(null)} />
    </div>
  );
}
