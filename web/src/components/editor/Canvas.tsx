import { useEffect, useMemo, useRef, useState } from 'react';
import GridLayout, { type Layout } from 'react-grid-layout';
import { useDroppable } from '@dnd-kit/core';
import { Copy, Trash2 } from 'lucide-react';
import type { Widget } from '@/api/types';
import { useT } from '@/i18n';
import { useEditor, usePageWidgets } from '@/store/editor';
import { autoTitle } from '@/lib/widget';
import { cssPx } from '@/store/theme';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { WidgetChart } from './WidgetChart';

/** Below this canvas width every widget takes the full width (a breakpoint, not a theme value). */
const NARROW = 480;
export const WIDGET_DROP_PREFIX = 'widget:';

function WidgetFrame({ widget, editable }: { widget: Widget; editable: boolean }) {
  const t = useT();
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const removeWidget = useEditor((s) => s.removeWidget);
  const duplicateWidget = useEditor((s) => s.duplicateWidget);
  const { setNodeRef, isOver } = useDroppable({ id: `${WIDGET_DROP_PREFIX}${widget.id}`, disabled: !editable });
  const selected = editable && selectedId === widget.id;
  return (
    <article
      ref={setNodeRef}
      className={['widget', selected && 'widget--selected', isOver && 'widget--over'].filter(Boolean).join(' ')}
      onMouseDown={() => editable && select(widget.id)}
      onFocus={() => editable && select(widget.id)}
      tabIndex={editable ? 0 : undefined}
      aria-label={autoTitle(widget, t)}
    >
      <header className={['widget__header', editable && 'widget__header--draggable'].filter(Boolean).join(' ')}>
        <h3 className={['widget__title', !widget.title && 'widget__title--empty'].filter(Boolean).join(' ')}>{autoTitle(widget, t)}</h3>
        {editable && (
          <div className="widget__actions" onMouseDown={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" iconOnly icon={<Copy size={14} />} onClick={() => duplicateWidget(widget.id)}>{t('editor.duplicateWidget')}</Button>
            <Button variant="ghost" size="sm" iconOnly icon={<Trash2 size={14} />} onClick={() => removeWidget(widget.id)}>{t('editor.removeWidget')}</Button>
          </div>
        )}
      </header>
      <WidgetChart widget={widget} showMeta={editable} />
    </article>
  );
}

export function Canvas({ editable }: { editable: boolean }) {
  const t = useT();
  const widgets = usePageWidgets();
  const applyLayout = useEditor((s) => s.applyLayout);
  const addWidget = useEditor((s) => s.addWidget);
  const select = useEditor((s) => s.select);

  // Measure the canvas ourselves: below NARROW px every widget takes the full width, in reading order.
  const ref = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  const narrow = width > 0 && width < NARROW;
  const interactive = editable && !narrow;
  const gap = cssPx('--space-3', 12);
  const rowHeight = cssPx('--space-8', 40);

  const layout = useMemo<Layout[]>(() => {
    if (!narrow) return widgets.map((w) => ({ i: w.id, ...w.layout, minW: 2, minH: 3 }));
    const ordered = [...widgets].sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);
    let y = 0;
    return ordered.map((w) => { const item = { i: w.id, x: 0, y, w: 1, h: w.layout.h, static: true }; y += w.layout.h; return item; });
  }, [widgets, narrow]);

  return (
    <section ref={ref} className="canvas" aria-label={t('editor.canvas')} onMouseDown={(e) => { if (e.target === e.currentTarget) select(null); }}>
      {widgets.length === 0 ? (
        <EmptyState
          title={t('editor.emptyCanvas')}
          hint={t('editor.emptyCanvasHint')}
          action={editable ? <Button variant="primary" onClick={() => addWidget()}>{t('editor.addVisual')}</Button> : undefined}
        />
      ) : (
        <div className="canvas__inner">
          {width > 0 && (
          <GridLayout
            className="layout"
            width={width - gap * 2}
            layout={layout}
            cols={narrow ? 1 : 12}
            rowHeight={rowHeight}
            margin={[gap, gap]}
            containerPadding={[0, 0]}
            isDraggable={interactive}
            isResizable={interactive}
            draggableHandle=".widget__header"
            onLayoutChange={(l) => interactive && applyLayout(l.map((x) => ({ i: x.i, x: x.x, y: x.y, w: x.w, h: x.h })))}
            useCSSTransforms
          >
            {widgets.map((w) => (
              <div key={w.id}>
                <WidgetFrame widget={w} editable={editable} />
              </div>
            ))}
          </GridLayout>
          )}
        </div>
      )}
    </section>
  );
}
