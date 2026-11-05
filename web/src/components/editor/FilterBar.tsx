import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, RotateCcw, Settings2, X } from 'lucide-react';
import { api } from '@/api/client';
import type { DashboardFilter, DateBucket, DatePreset, FilterValue } from '@/api/types';
import { DATE_PRESETS } from '@/api/types';
import { useT } from '@/i18n';
import { useEditor, usePageFilters } from '@/store/editor';
import { GRAIN_BUCKETS, defaultFilterValue, filtersForChoices, isFilterActive, isFilterComplete } from '@/lib/filters';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { FilterDialog } from './FilterDialog';
import { sourceKeyOf, useSourceFields } from './useSourceFields';

/** How long typing may pause before the choices are searched on the server. */
const SEARCH_DEBOUNCE_MS = 300;
/** The server's page size, until GET /config answers. */
const FALLBACK_VALUE_LIMIT = 200;

function useDebounced<T>(value: T, ms: number): T {
  const [out, setOut] = useState(value);
  useEffect(() => { const h = setTimeout(() => setOut(value), ms); return () => clearTimeout(h); }, [value, ms]);
  return out;
}

/**
 * The distinct values of a list filter's column, read through the ordinary query route: narrowed
 * by the report's other filters (so "Nhóm" only lists the groups of the chosen "Kênh"), searched
 * on the server with `contains`, and read a page at a time.
 */
function useFilterValues(filter: DashboardFilter, search: string, pages: number) {
  const filters = useEditor((s) => s.definition.filters);
  const values = useEditor((s) => s.filterValues);
  const fields = useSourceFields(filter.datasourceId ?? null, filter.source);
  const limit = useQuery({ queryKey: ['client-config'], queryFn: () => api.config.get(), staleTime: Infinity }).data?.filterValueLimit ?? FALLBACK_VALUE_LIMIT;
  const narrowing = useMemo(() => filtersForChoices(filter, filters, values, fields.data), [filter, filters, values, fields.data]);
  const term = search.trim();
  return useQuery({
    queryKey: ['filter-values', filter.datasourceId, sourceKeyOf(filter.source), filter.field, narrowing, term, pages, limit],
    queryFn: async () => {
      const r = await api.query.run({
        datasourceId: filter.datasourceId!, source: filter.source!, dimensions: [{ field: filter.field!, bucket: 'none' }], measures: [],
        filters: [...narrowing.map(({ field, op, value, values: vs }) => ({ field, op, value, values: vs })), ...(term ? [{ field: filter.field!, op: 'contains' as const, value: term }] : [])],
        orderBy: [], limit: limit * pages,
      });
      const alias = r.columns[0]?.alias;
      const list = alias ? r.rows.map((row) => row[alias]).filter((v): v is string | number => typeof v === 'string' || typeof v === 'number') : [];
      return { values: list, more: r.truncated };
    },
    enabled: filter.kind === 'list' && isFilterComplete(filter),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

function DateRangeControl({ filter, value, onChange }: { filter: DashboardFilter; value: FilterValue; onChange: (v: FilterValue) => void }) {
  const t = useT();
  const preset = value.preset ?? 'all';
  return (
    <>
      <Select size="sm" label={filter.label} value={preset} onChange={(e) => onChange({ ...value, preset: e.target.value as DatePreset })}>
        {DATE_PRESETS.map((p) => <option key={p} value={p}>{t(`filters.presets.${p}`)}</option>)}
      </Select>
      {preset === 'custom' && (
        <div className="filter-bar__range">
          <Input size="sm" type="date" aria-label={t('filters.from')} value={value.from ?? ''} onChange={(e) => onChange({ ...value, from: e.target.value || undefined })} />
          <Input size="sm" type="date" aria-label={t('filters.to')} value={value.to ?? ''} onChange={(e) => onChange({ ...value, to: e.target.value || undefined })} />
        </div>
      )}
    </>
  );
}

function GrainControl({ filter, value, onChange }: { filter: DashboardFilter; value: FilterValue; onChange: (v: FilterValue) => void }) {
  const t = useT();
  return (
    <Select size="sm" label={filter.label} value={value.bucket ?? 'month'} onChange={(e) => onChange({ bucket: e.target.value as DateBucket })}>
      {GRAIN_BUCKETS.map((b) => <option key={b} value={b}>{t(`bucket.${b}`)}</option>)}
    </Select>
  );
}

function ListControl({ filter, value, onChange }: { filter: DashboardFilter; value: FilterValue; onChange: (v: FilterValue) => void }) {
  const t = useT();
  const [search, setSearch] = useState('');
  const [pages, setPages] = useState(1);
  const term = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const choices = useFilterValues(filter, term, pages);
  const options = choices.data?.values ?? [];
  const selected = value.values ?? [];
  // a saved choice that the data no longer returns stays selectable, so the filter keeps acting; the reader is told
  const all = Array.from(new Set<string | number>([...options, ...selected]));
  const missing = term ? 0 : selected.filter((v) => !options.includes(v)).length;
  const more = choices.data?.more === true;
  return (
    <MultiSelect size="sm" label={filter.label} value={selected} single={!filter.multi} onChange={(values) => onChange({ values })}
      options={all.map((v) => ({ value: v, label: String(v) }))}
      allLabel={choices.isLoading ? t('filters.loadingValues') : t('filters.all')} summary={t('common.selected', { count: selected.length })}
      search={{ value: search, onChange: (v) => { setSearch(v); setPages(1); }, placeholder: t('filters.search') }}
      footer={more && (
        <div className="multiselect__more">
          <span className="text-sm text-muted">{t('filters.more')}</span>
          <Button variant="ghost" size="sm" onClick={() => setPages((p) => p + 1)} loading={choices.isFetching}>{t('filters.loadMore')}</Button>
        </div>
      )}
      help={missing > 0 && !choices.isLoading ? t('filters.missingSelected', { count: missing }) : undefined} />
  );
}

/**
 * The dashboard's own filters above the canvas: every viewer can change them for the session,
 * an editor also adds, configures and removes them and saves the current choice as the default.
 */
export function FilterBar({ editable, manage }: { /** edit mode: a change of value becomes the saved default */ editable: boolean; /** may add, configure and remove filters (dashboards.filters) */ manage: boolean }) {
  const t = useT();
  // the report's filters and this page's own; a filter scoped to another page is neither shown nor applied here
  const filters = usePageFilters();
  const values = useEditor((s) => s.filterValues);
  const setFilterValue = useEditor((s) => s.setFilterValue);
  const resetFilterValues = useEditor((s) => s.resetFilterValues);
  const removeFilter = useEditor((s) => s.removeFilter);
  const crossFilters = useEditor((s) => s.crossFilters);
  const removeCrossFilter = useEditor((s) => s.removeCrossFilter);
  const [editing, setEditing] = useState<DashboardFilter | 'new' | null>(null);

  const manageHere = editable && manage;
  if (!manageHere && filters.length === 0 && crossFilters.length === 0) return null;
  const active = filters.filter((f) => isFilterActive(f, values[f.id])).length;
  const saved = filters.some((f) => isFilterActive(f, f.value));
  // "reset" is useful only when the session's choices differ from the saved ones
  const changed = filters.some((f) => JSON.stringify(values[f.id] ?? f.value) !== JSON.stringify(f.value));

  return (
    <div className="filter-bar" role="region" aria-label={t('filters.title')}>
      {filters.map((f) => {
        const value = values[f.id] ?? f.value ?? defaultFilterValue(f.kind);
        const onChange = (v: FilterValue) => setFilterValue(f.id, v);
        const complete = isFilterComplete(f);
        return (
          <div key={f.id} className={['filter-bar__item', isFilterActive(f, value) && 'filter-bar__item--active'].filter(Boolean).join(' ')}>
            {manageHere && (
              <div className="filter-bar__tools">
                <Button variant="ghost" size="sm" iconOnly icon={<Settings2 size={14} />} onClick={() => setEditing(f)}>{t('filters.edit')}</Button>
                <Button variant="ghost" size="sm" iconOnly icon={<X size={14} />} onClick={() => removeFilter(f.id)}>{t('filters.remove')}</Button>
              </div>
            )}
            {!complete
              ? <Select size="sm" label={f.label || t(`filters.kinds.${f.kind}`)} value="" disabled><option value="">{t('filters.incomplete')}</option></Select>
              : f.kind === 'date_range' ? <DateRangeControl filter={f} value={value} onChange={onChange} />
                : f.kind === 'grain' ? <GrainControl filter={f} value={value} onChange={onChange} />
                  : <ListControl filter={f} value={value} onChange={onChange} />}
          </div>
        );
      })}
      {crossFilters.length > 0 && (
        <div className="filter-bar__cross" role="group" aria-label={t('editor.crossFiltering')}>
          {crossFilters.map((cf) => (
            <span key={cf.widgetId} className="badge">
              {t('editor.crossFiltering')}: {cf.label}
              <Button variant="ghost" size="sm" iconOnly icon={<X size={12} />} onClick={() => removeCrossFilter(cf.widgetId)}>{t('editor.clearCrossFilter')}</Button>
            </span>
          ))}
        </div>
      )}
      <div className="filter-bar__actions">
        {active > 0 && <span className="text-sm text-muted">{t('filters.active', { count: active })}</span>}
        {(changed || (!editable && saved)) && (
          <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={resetFilterValues}>{t('filters.reset')}</Button>
        )}
        {manageHere && <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing('new')}>{t('filters.add')}</Button>}
      </div>
      {manageHere && <FilterDialog key={editing === 'new' ? 'new' : editing?.id ?? 'closed'} open={editing !== null} initial={editing === 'new' || editing === null ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
