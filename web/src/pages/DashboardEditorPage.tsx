import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { ArrowLeft, Eye, Pencil, Plus, Save } from 'lucide-react';
import { api } from '@/api/client';
import type { FieldInfo } from '@/api/types';
import { useAuth, canEdit } from '@/store/auth';
import { useEditor } from '@/store/editor';
import { toast } from '@/store/toast';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { ErrorBox, Spinner } from '@/components/ui/Feedback';
import { KindIcon } from '@/components/ui/KindBadge';
import { FieldsPane, FIELD_DRAG_PREFIX } from '@/components/editor/FieldsPane';
import { Canvas, WIDGET_DROP_PREFIX } from '@/components/editor/Canvas';
import { VisualPane, WELL_DROP_PREFIX } from '@/components/editor/VisualPane';
import '@/components/editor/editor.css';

/** Shared by the edit and view routes: `mode` decides which panes render. */
export function DashboardEditorPage({ mode }: { mode: 'edit' | 'view' }) {
  const t = useT();
  const params = useParams();
  const id = Number(params.id);
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const editable = mode === 'edit' && canEdit(user);
  const ed = useEditor();
  const [dragging, setDragging] = useState<FieldInfo | null>(null);

  const dashboard = useQuery({ queryKey: ['dashboard', id], queryFn: () => api.dashboards.get(id).then((r) => r.dashboard), enabled: Number.isInteger(id) });

  useEffect(() => { if (dashboard.data) ed.load(dashboard.data); }, [dashboard.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { ed.setMode(editable ? 'edit' : 'view'); }, [editable]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => ed.reset(), []); // eslint-disable-line react-hooks/exhaustive-deps

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
    onError: (e) => toast.error(e.message),
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
    if (ed.dirty && !window.confirm(t('editor.unsavedLeave'))) return;
    navigate(to);
  };

  if (dashboard.isLoading) return <div style={{ padding: 'var(--space-5)' }}><Spinner block /></div>;
  if (dashboard.error) return <div style={{ padding: 'var(--space-5)' }}><ErrorBox error={dashboard.error} /></div>;

  return (
    <div className="editor">
      <div className="editor__bar">
        <div className="row grow">
          <Button variant="ghost" iconOnly icon={<ArrowLeft size={18} />} onClick={() => leave('/dashboards')}>{t('common.back')}</Button>
          {editable ? (
            <input className="editor__name grow" aria-label={t('editor.nameLabel')} value={ed.name} onChange={(e) => ed.setName(e.target.value)} placeholder={t('dashboards.untitled')} />
          ) : (
            <h1 className="editor__name truncate">{ed.name}</h1>
          )}
          {editable && <span className={['editor__status', ed.dirty && 'editor__status--dirty'].filter(Boolean).join(' ')}>{ed.dirty ? t('editor.unsaved') : t('editor.saved')}</span>}
        </div>
        <div className="row">
          {editable ? (
            <>
              <Button icon={<Plus size={16} />} onClick={() => ed.addWidget()}>{t('editor.addVisual')}</Button>
              <Button icon={<Eye size={16} />} onClick={() => leave(`/dashboards/${id}`)}>{t('editor.view')}</Button>
              <Button variant="primary" icon={<Save size={16} />} onClick={() => save.mutate()} loading={save.isPending} disabled={!ed.dirty && !save.isError}>{t('common.save')}</Button>
            </>
          ) : canEdit(user) ? (
            <Button variant="primary" icon={<Pencil size={16} />} onClick={() => navigate(`/dashboards/${id}/edit`)}>{t('editor.edit')}</Button>
          ) : null}
        </div>
      </div>
      {editable ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="editor__body">
            <FieldsPane />
            <Canvas editable />
            <VisualPane />
          </div>
          <DragOverlay dropAnimation={null}>
            {dragging && <div className="drag-chip"><KindIcon kind={dragging.kind} />{dragging.name}</div>}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="editor__body editor__body--view">
          <Canvas editable={false} />
        </div>
      )}
    </div>
  );
}
