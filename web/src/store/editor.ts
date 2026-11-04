import { create } from 'zustand';
import type { Dashboard, DashboardDefinition, FieldInfo, QuerySource, Widget, WidgetType } from '@/api/types';
import { autoPlace, coerceForType, newWidget } from '@/lib/widget';
import { newId } from '@/lib/id';

export interface DatasetChoice { datasourceId: number; source: QuerySource; label: string }

interface EditorState {
  dashboardId: number | null;
  name: string;
  description: string;
  definition: DashboardDefinition;
  selectedId: string | null;
  dirty: boolean;
  mode: 'edit' | 'view';
  /** dataset currently shown in the fields pane */
  activeDataset: DatasetChoice | null;
  activeFields: FieldInfo[];

  load: (d: Dashboard & { definition: DashboardDefinition }) => void;
  reset: () => void;
  setName: (name: string) => void;
  setMode: (mode: 'edit' | 'view') => void;
  select: (id: string | null) => void;
  addWidget: (type?: WidgetType) => string;
  removeWidget: (id: string) => void;
  duplicateWidget: (id: string) => void;
  updateWidget: (id: string, patch: Partial<Widget> | ((w: Widget) => Widget)) => void;
  setWidgetType: (id: string, type: WidgetType) => void;
  applyLayout: (layout: { i: string; x: number; y: number; w: number; h: number }[]) => void;
  dropField: (widgetId: string, field: FieldInfo, well?: 'dimensions' | 'measures') => void;
  setActiveDataset: (choice: DatasetChoice | null, fields: FieldInfo[]) => void;
  markSaved: () => void;
}

const empty = (): DashboardDefinition => ({ version: 1, widgets: [], filters: [], settings: {} });

/** Definitions may come from API clients that omit optional arrays; fill every field the editor relies on. */
function normalize(def: Partial<DashboardDefinition> | null | undefined): DashboardDefinition {
  const widgets = (def?.widgets ?? []).map((w): Widget => ({
    ...newWidget(),
    ...w,
    layout: w.layout ?? { x: 0, y: 0, w: 6, h: 7 },
    query: {
      dimensions: w.query?.dimensions ?? [],
      measures: w.query?.measures ?? [],
      filters: (w.query?.filters ?? []).map((f, i) => ({ ...f, id: f.id ?? `f_${i}` })),
      orderBy: w.query?.orderBy ?? [],
      limit: w.query?.limit,
    },
    options: { legend: true, numberFormat: 'auto', ...(w.options ?? {}) },
  }));
  return { version: 1, widgets, filters: def?.filters ?? [], settings: def?.settings ?? {} };
}
/** First free row below every widget (never Infinity: the document must stay JSON-safe). */
const bottomOf = (widgets: Widget[]) => widgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);

export const useEditor = create<EditorState>((set, get) => ({
  dashboardId: null,
  name: '',
  description: '',
  definition: empty(),
  selectedId: null,
  dirty: false,
  mode: 'edit',
  activeDataset: null,
  activeFields: [],

  load: (d) => set({
    dashboardId: d.id, name: d.name, description: d.description, definition: normalize(d.definition),
    selectedId: null, dirty: false, activeDataset: null, activeFields: [],
  }),
  reset: () => set({ dashboardId: null, name: '', description: '', definition: empty(), selectedId: null, dirty: false, activeDataset: null, activeFields: [] }),
  setName: (name) => set({ name, dirty: true }),
  setMode: (mode) => set({ mode, selectedId: mode === 'view' ? null : get().selectedId }),
  select: (id) => set({ selectedId: id }),

  addWidget: (type = 'column') => {
    const { definition, activeDataset } = get();
    const w = newWidget({
      type,
      datasourceId: activeDataset?.datasourceId ?? null,
      source: activeDataset?.source ?? null,
      layout: { x: (definition.widgets.length * 6) % 12, y: bottomOf(definition.widgets), w: 6, h: 7 },
    });
    set({ definition: { ...definition, widgets: [...definition.widgets, w] }, selectedId: w.id, dirty: true });
    return w.id;
  },
  removeWidget: (id) => set((s) => ({
    definition: { ...s.definition, widgets: s.definition.widgets.filter((w) => w.id !== id) },
    selectedId: s.selectedId === id ? null : s.selectedId, dirty: true,
  })),
  duplicateWidget: (id) => set((s) => {
    const src = s.definition.widgets.find((w) => w.id === id);
    if (!src) return s;
    const copy: Widget = { ...structuredClone(src), id: newId('w'), layout: { ...src.layout, y: bottomOf(s.definition.widgets) } };
    return { definition: { ...s.definition, widgets: [...s.definition.widgets, copy] }, selectedId: copy.id, dirty: true };
  }),
  updateWidget: (id, patch) => set((s) => ({
    definition: {
      ...s.definition,
      widgets: s.definition.widgets.map((w) => (w.id !== id ? w : typeof patch === 'function' ? patch(w) : { ...w, ...patch })),
    },
    dirty: true,
  })),
  setWidgetType: (id, type) => get().updateWidget(id, (w) => coerceForType(w, type)),
  applyLayout: (layout) => set((s) => {
    let changed = false;
    const widgets = s.definition.widgets.map((w) => {
      const l = layout.find((x) => x.i === w.id);
      if (!l) return w;
      if (l.x !== w.layout.x || l.y !== w.layout.y || l.w !== w.layout.w || l.h !== w.layout.h) {
        changed = true;
        return { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } };
      }
      return w;
    });
    return changed ? { definition: { ...s.definition, widgets }, dirty: true } : s;
  }),
  dropField: (widgetId, field, well) => {
    const { activeDataset } = get();
    get().updateWidget(widgetId, (w) => {
      // A widget without a source adopts the dataset the field came from.
      let next = w;
      if (!w.source && activeDataset) next = { ...w, datasourceId: activeDataset.datasourceId, source: activeDataset.source };
      if (!well) return autoPlace(next, field);
      const q = next.query;
      if (well === 'dimensions') {
        if (q.dimensions.some((d) => d.field === field.name)) return next;
        return { ...next, query: { ...q, dimensions: [...q.dimensions, { field: field.name, kind: field.kind, bucket: field.kind === 'date' ? 'month' : undefined }] } };
      }
      if (q.measures.some((m) => m.field === field.name)) return next;
      return { ...next, query: { ...q, measures: [...q.measures, { field: field.name, kind: field.kind, agg: field.kind === 'number' ? 'sum' : 'count' }] } };
    });
  },
  setActiveDataset: (choice, fields) => set({ activeDataset: choice, activeFields: fields }),
  markSaved: () => set({ dirty: false }),
}));

export const useSelectedWidget = () => useEditor((s) => s.definition.widgets.find((w) => w.id === s.selectedId) ?? null);
