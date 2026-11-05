import { create } from 'zustand';
import type { Dashboard, DashboardDefinition, DashboardFilter, DashboardPage, FieldInfo, FilterValue, LegacyDashboardDefinition, QuerySource, Widget, WidgetType } from '@/api/types';
import { isFormula } from '@/api/types';
import { translate, useI18nStore } from '@/i18n';
import { addDimension, autoPlace, coerceForType, newWidget } from '@/lib/widget';
import { defaultFilterValue } from '@/lib/filters';
import { newId } from '@/lib/id';

export interface DatasetChoice { datasourceId: number; source: QuerySource; label: string }

interface EditorState {
  dashboardId: number | null;
  name: string;
  description: string;
  definition: DashboardDefinition;
  /** the page on the canvas; every widget action acts on it */
  activePageId: string;
  selectedId: string | null;
  dirty: boolean;
  mode: 'edit' | 'view';
  /** dataset currently shown in the fields pane */
  activeDataset: DatasetChoice | null;
  activeFields: FieldInfo[];
  /** what each dashboard filter selects right now; starts from the saved value, a viewer's changes stay here */
  filterValues: Record<string, FilterValue>;
  /** when "refresh" was last pressed: fetches right after it skip the server's result cache */
  refreshedAt: number;

  /** `pageId` (from the URL) picks the page to open when the report has it; otherwise the first */
  load: (d: Dashboard & { definition: NonNullable<Dashboard['definition']> }, pageId?: string | null) => void;
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
  dropField: (widgetId: string, field: FieldInfo, well?: 'dimensions' | 'columns' | 'measures') => void;
  setActiveDataset: (choice: DatasetChoice | null, fields: FieldInfo[]) => void;
  markSaved: () => void;
  addFilter: (filter: DashboardFilter) => void;
  updateFilter: (id: string, patch: Partial<DashboardFilter>) => void;
  removeFilter: (id: string) => void;
  /** in edit mode the choice becomes the saved default; in view mode it lives only in this session */
  setFilterValue: (id: string, value: FilterValue) => void;
  /** back to the saved defaults */
  resetFilterValues: () => void;
  refresh: () => void;
  // pages
  setActivePage: (id: string) => void;
  addPage: () => string;
  renamePage: (id: string, name: string) => void;
  duplicatePage: (id: string) => string;
  /** the last page cannot be removed; its filters go with it */
  removePage: (id: string) => void;
  movePage: (id: string, direction: -1 | 1) => void;
}

/** "Trang 3" / "Page 3": the name a new page gets until the author renames it. */
export const defaultPageName = (n: number): string => translate(useI18nStore.getState().lang, 'pages.defaultName', { n });
export const newPage = (name: string): DashboardPage => ({ id: newId('p'), name, widgets: [] });

const empty = (): DashboardDefinition => ({ version: 2, pages: [newPage(defaultPageName(1))], filters: [], settings: {} });

/**
 * Definitions may come from API clients that omit optional arrays, or from before pages existed
 * (version 1: `widgets` at the top level); fill every field the editor relies on and read an old
 * document as one page.
 */
type AnyDefinition = { version?: number; pages?: Partial<DashboardPage>[]; widgets?: Widget[]; filters?: unknown[]; settings?: Record<string, unknown> };
function normalize(raw: DashboardDefinition | LegacyDashboardDefinition | null | undefined): DashboardDefinition {
  const def = raw as AnyDefinition | null | undefined;
  const widgetsOf = (list: Widget[] | undefined): Widget[] => (list ?? []).map((w, wi): Widget => ({
    ...newWidget(),
    ...w,
    layout: w.layout ?? { x: 0, y: 0, w: 6, h: 7 },
    query: {
      dimensions: w.query?.dimensions ?? [],
      measures: (w.query?.measures ?? []).map((m, i) => (isFormula(m) && !m.alias ? { ...m, alias: `calc_${wi}_${i}` } : m)),
      filters: (w.query?.filters ?? []).map((f, i) => ({ ...f, id: f.id ?? `f_${i}` })),
      orderBy: w.query?.orderBy ?? [],
      limit: w.query?.limit,
    },
    options: normalizeOptions(w.options),
  }));
  const rawPages = Array.isArray(def?.pages) ? def.pages : [];
  let pages: DashboardPage[] = rawPages.filter((p): p is Partial<DashboardPage> => !!p && typeof p === 'object').map((p, i) => ({
    id: typeof p.id === 'string' && p.id ? p.id : newId('p'),
    name: typeof p.name === 'string' && p.name.trim() ? p.name : defaultPageName(i + 1),
    widgets: widgetsOf(p.widgets),
  }));
  // a version 1 document, or a document that lost its pages: one page holding whatever widgets there are
  if (pages.length === 0) pages = [{ ...newPage(defaultPageName(1)), widgets: widgetsOf(def?.widgets) }];
  else if (def?.widgets?.length) pages[0] = { ...pages[0]!, widgets: [...pages[0]!.widgets, ...widgetsOf(def.widgets)] };
  const pageIds = new Set(pages.map((p) => p.id));
  const filters = (def?.filters ?? []).filter(isDashboardFilter).map((f): DashboardFilter => ({
    ...f,
    value: f.value ?? defaultFilterValue(f.kind),
    // a filter scoped to a page that no longer exists applies to the whole report again
    pageId: f.pageId && pageIds.has(f.pageId) ? f.pageId : undefined,
  }));
  return { version: 2, pages, filters, settings: def?.settings ?? {} };
}
/** Only a filter the editor can show survives loading; anything else in the array is dropped. */
function isDashboardFilter(f: unknown): f is DashboardFilter {
  const o = f as Partial<DashboardFilter> | null;
  return !!o && typeof o === 'object' && typeof o.id === 'string' && (o.kind === 'date_range' || o.kind === 'grain' || o.kind === 'list');
}
const valuesOf = (filters: DashboardFilter[]): Record<string, FilterValue> => Object.fromEntries(filters.map((f) => [f.id, f.value ?? defaultFilterValue(f.kind)]));
/** Defaults, plus the pre-0.2 `stacked: true` read as the `stacking` choice it meant. */
function normalizeOptions(o: Partial<Widget['options']> | undefined): Widget['options'] {
  const { stacked, ...rest } = o ?? {};
  return { legend: true, numberFormat: 'auto', ...rest, ...(stacked && !rest.stacking ? { stacking: 'stacked' as const } : {}) };
}
/** First free row below every widget (never Infinity: the document must stay JSON-safe). */
const bottomOf = (widgets: Widget[]) => widgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);

const pageOf = (def: DashboardDefinition, id: string): DashboardPage => def.pages.find((p) => p.id === id) ?? def.pages[0]!;
/** The page holding a widget; the active page when none does (a new widget). */
const pageWith = (def: DashboardDefinition, widgetId: string, fallback: string): DashboardPage =>
  def.pages.find((p) => p.widgets.some((w) => w.id === widgetId)) ?? pageOf(def, fallback);
/** The definition with one page's widgets replaced. */
const withWidgets = (def: DashboardDefinition, pageId: string, widgets: Widget[]): DashboardDefinition =>
  ({ ...def, pages: def.pages.map((p) => (p.id === pageId ? { ...p, widgets } : p)) });
const cloneWidget = (w: Widget): Widget => ({ ...structuredClone(w), id: newId('w') });

export const useEditor = create<EditorState>((set, get) => ({
  dashboardId: null,
  name: '',
  description: '',
  definition: empty(),
  activePageId: '',
  selectedId: null,
  dirty: false,
  mode: 'edit',
  activeDataset: null,
  activeFields: [],
  filterValues: {},
  refreshedAt: 0,

  load: (d, pageId) => {
    const definition = normalize(d.definition);
    const activePageId = pageId && definition.pages.some((p) => p.id === pageId) ? pageId : definition.pages[0]!.id;
    set({
      dashboardId: d.id, name: d.name, description: d.description, definition, activePageId,
      selectedId: null, dirty: false, activeDataset: null, activeFields: [], filterValues: valuesOf(definition.filters),
    });
  },
  reset: () => set({ dashboardId: null, name: '', description: '', definition: empty(), activePageId: '', selectedId: null, dirty: false, activeDataset: null, activeFields: [], filterValues: {} }),
  setName: (name) => set({ name, dirty: true }),
  setMode: (mode) => set({ mode, selectedId: mode === 'view' ? null : get().selectedId }),
  select: (id) => set({ selectedId: id }),

  addWidget: (type = 'column') => {
    const { definition, activeDataset, activePageId } = get();
    const page = pageOf(definition, activePageId);
    const w = newWidget({
      type,
      datasourceId: activeDataset?.datasourceId ?? null,
      source: activeDataset?.source ?? null,
      layout: { x: (page.widgets.length * 6) % 12, y: bottomOf(page.widgets), w: 6, h: 7 },
    });
    set({ definition: withWidgets(definition, page.id, [...page.widgets, w]), selectedId: w.id, dirty: true });
    return w.id;
  },
  removeWidget: (id) => set((s) => {
    const page = pageWith(s.definition, id, s.activePageId);
    return {
      definition: withWidgets(s.definition, page.id, page.widgets.filter((w) => w.id !== id)),
      selectedId: s.selectedId === id ? null : s.selectedId, dirty: true,
    };
  }),
  duplicateWidget: (id) => set((s) => {
    const page = pageWith(s.definition, id, s.activePageId);
    const src = page.widgets.find((w) => w.id === id);
    if (!src) return s;
    const copy: Widget = { ...cloneWidget(src), layout: { ...src.layout, y: bottomOf(page.widgets) } };
    return { definition: withWidgets(s.definition, page.id, [...page.widgets, copy]), selectedId: copy.id, dirty: true };
  }),
  updateWidget: (id, patch) => set((s) => {
    const page = pageWith(s.definition, id, s.activePageId);
    return {
      definition: withWidgets(s.definition, page.id, page.widgets.map((w) => (w.id !== id ? w : typeof patch === 'function' ? patch(w) : { ...w, ...patch }))),
      dirty: true,
    };
  }),
  setWidgetType: (id, type) => get().updateWidget(id, (w) => coerceForType(w, type)),
  applyLayout: (layout) => set((s) => {
    const page = pageOf(s.definition, s.activePageId);
    let changed = false;
    const widgets = page.widgets.map((w) => {
      const l = layout.find((x) => x.i === w.id);
      if (!l) return w;
      if (l.x !== w.layout.x || l.y !== w.layout.y || l.w !== w.layout.w || l.h !== w.layout.h) {
        changed = true;
        return { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } };
      }
      return w;
    });
    return changed ? { definition: withWidgets(s.definition, page.id, widgets), dirty: true } : s;
  }),
  dropField: (widgetId, field, well) => {
    const { activeDataset } = get();
    get().updateWidget(widgetId, (w) => {
      // A widget without a source adopts the dataset the field came from.
      let next = w;
      if (!w.source && activeDataset) next = { ...w, datasourceId: activeDataset.datasourceId, source: activeDataset.source };
      if (!well) return autoPlace(next, field);
      const q = next.query;
      if (well === 'dimensions' || well === 'columns') {
        if (q.dimensions.some((d) => d.field === field.name)) return next;
        return addDimension(next, { field: field.name, kind: field.kind, bucket: field.kind === 'date' ? 'month' : undefined }, well);
      }
      if (q.measures.some((m) => m.field === field.name)) return next;
      return { ...next, query: { ...q, measures: [...q.measures, { field: field.name, kind: field.kind, agg: field.kind === 'number' ? 'sum' : 'count' }] } };
    });
  },
  setActiveDataset: (choice, fields) => set({ activeDataset: choice, activeFields: fields }),
  markSaved: () => set({ dirty: false }),
  addFilter: (filter) => set((s) => ({
    definition: { ...s.definition, filters: [...s.definition.filters, filter] },
    filterValues: { ...s.filterValues, [filter.id]: filter.value ?? defaultFilterValue(filter.kind) }, dirty: true,
  })),
  updateFilter: (id, patch) => set((s) => {
    const filters = s.definition.filters.map((f) => (f.id === id ? { ...f, ...patch } : f));
    const next = filters.find((f) => f.id === id);
    return { definition: { ...s.definition, filters }, filterValues: next ? { ...s.filterValues, [id]: next.value ?? defaultFilterValue(next.kind) } : s.filterValues, dirty: true };
  }),
  removeFilter: (id) => set((s) => {
    const { [id]: _gone, ...rest } = s.filterValues;
    return { definition: { ...s.definition, filters: s.definition.filters.filter((f) => f.id !== id) }, filterValues: rest, dirty: true };
  }),
  setFilterValue: (id, value) => set((s) => (s.mode === 'edit'
    ? { filterValues: { ...s.filterValues, [id]: value }, definition: { ...s.definition, filters: s.definition.filters.map((f) => (f.id === id ? { ...f, value } : f)) }, dirty: true }
    : { filterValues: { ...s.filterValues, [id]: value } })),
  resetFilterValues: () => set((s) => ({ filterValues: valuesOf(s.definition.filters) })),
  refresh: () => set({ refreshedAt: Date.now() }),

  // the selection belongs to a page, so it is dropped on every switch
  setActivePage: (id) => set((s) => (s.definition.pages.some((p) => p.id === id) && id !== s.activePageId ? { activePageId: id, selectedId: null } : s)),
  addPage: () => {
    const { definition } = get();
    const page = newPage(defaultPageName(definition.pages.length + 1));
    set({ definition: { ...definition, pages: [...definition.pages, page] }, activePageId: page.id, selectedId: null, dirty: true });
    return page.id;
  },
  renamePage: (id, name) => set((s) => ({ definition: { ...s.definition, pages: s.definition.pages.map((p) => (p.id === id ? { ...p, name } : p)) }, dirty: true })),
  duplicatePage: (id) => {
    const { definition } = get();
    const index = definition.pages.findIndex((p) => p.id === id);
    const src = definition.pages[index];
    if (!src) return id;
    const copy: DashboardPage = { id: newId('p'), name: translate(useI18nStore.getState().lang, 'pages.copyName', { name: src.name }), widgets: src.widgets.map(cloneWidget) };
    const pages = [...definition.pages.slice(0, index + 1), copy, ...definition.pages.slice(index + 1)];
    set({ definition: { ...definition, pages }, activePageId: copy.id, selectedId: null, dirty: true });
    return copy.id;
  },
  removePage: (id) => set((s) => {
    if (s.definition.pages.length <= 1) return s;
    const index = s.definition.pages.findIndex((p) => p.id === id);
    if (index < 0) return s;
    const pages = s.definition.pages.filter((p) => p.id !== id);
    const filters = s.definition.filters.filter((f) => f.pageId !== id);
    const activePageId = s.activePageId === id ? (pages[Math.min(index, pages.length - 1)] ?? pages[0])!.id : s.activePageId;
    return { definition: { ...s.definition, pages, filters }, filterValues: valuesOf(filters), activePageId, selectedId: s.activePageId === id ? null : s.selectedId, dirty: true };
  }),
  movePage: (id, direction) => set((s) => {
    const pages = [...s.definition.pages];
    const from = pages.findIndex((p) => p.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= pages.length) return s;
    [pages[from], pages[to]] = [pages[to]!, pages[from]!];
    return { definition: { ...s.definition, pages }, dirty: true };
  }),
}));

/** The page on the canvas (the first when the id is stale). */
export const useActivePage = () => useEditor((s) => pageOf(s.definition, s.activePageId));
/** The widgets on the canvas: those of the active page. */
export const usePageWidgets = () => useEditor((s) => pageOf(s.definition, s.activePageId).widgets);
/** The report's filters that act on the active page: those of the whole report and those scoped to it. */
export const usePageFilters = () => {
  const filters = useEditor((s) => s.definition.filters);
  const activePageId = useEditor((s) => s.activePageId);
  return filters.filter((f) => !f.pageId || f.pageId === activePageId);
};
export const useSelectedWidget = () => useEditor((s) => (s.selectedId ? pageOf(s.definition, s.activePageId).widgets.find((w) => w.id === s.selectedId) ?? null : null));
