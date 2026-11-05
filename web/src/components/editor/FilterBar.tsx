import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, RotateCcw, Settings2, X } from 'lucide-react';
import { api } from '@/api/client';
import type { DashboardFilter, DateBucket, DatePreset, FilterValue } from '@/api/types';
import { DATE_PRESETS } from '@/api/types';
import { useT } from '@/i18n';
import { useEditor } from '@/store/editor';
import { GRAIN_BUCKETS, defaultFilterValue, isFilterActive, isFilterComplete } from '@/lib/filters';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { FilterDialog } from './FilterDialog';
import { sourceKeyOf } from './useSourceFields';

const VALUE_LIMIT = 500;

/** The distinct values of a list filter's column, read through the ordinary query route. */
function useFilterValues(filter: DashboardFilter) {
  return useQuery({
    queryKey: ['filter-values', filter.datasourceId, sourceKeyOf(filter.source), filter.field],
    queryFn: async () => {
      const r = await api.query.run({ datasourceId: filter.datasourceId!, source: filter.source!, dimensions: [{ field: filter.field!, bucket: 'none' }], measures: [], filters: [], orderBy: [], limit: VALUE_LIMIT });
      const alias = r.columns[0]?.alias;
      return alias ? r.rows.map((row) => row[alias]).filter((v): v is string | number => typeof v === 'string' || typeof v === 'number') : [];
    },
    enabled: filter.kind === 'list' && isFilterComplete(filter),
    staleTime: 60_000,
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
  const choices = useFilterValues(filter);
  const options = choices.data ?? [];
  const selected = value.values ?? [];
  // a saved choice that the data no longer returns stays selectable, so the filter keeps acting
  const all = Array.from(new Set<string | number>([...options, ...selected]));
  if (filter.multi) {
    return (
      <MultiSelect size="sm" label={filter.label} value={selected} onChange={(values) => onChange({ values })}
        options={all.map((v) => ({ value: v, label: String(v) }))} allLabel={choices.isLoading ? t('filters.loadingValues') : t('filters.all')} summary={t('filters.selected', { count: selected.length })} />
    );
  }
  return (
    <Select size="sm" label={filter.label} value={selected.length ? String(selected[0]) : ''} onChange={(e) => {
      const raw = e.target.value;
      const match = all.find((v) => String(v) === raw);
      onChange({ values: raw === '' || match === undefined ? [] : [match] });
    }}>
      <option value="">{choices.isLoading ? t('filters.loadingValues') : t('filters.all')}</option>
      {all.map((v) => <option key={String(v)} value={String(v)}>{String(v)}</option>)}
    </Select>
  );
}

/**
 * The dashboard's own filters above the canvas: every viewer can change them for the session,
 * an editor also adds, configures and removes them and saves the current choice as the default.
 */
export function FilterBar({ editable, manage }: { /** edit mode: a change of value becomes the saved default */ editable: boolean; /** may add, configure and remove filters (dashboards.filters) */ manage: boolean }) {
  const t = useT();
  const filters = useEditor((s) => s.definition.filters);
  const values = useEditor((s) => s.filterValues);
  const setFilterValue = useEditor((s) => s.setFilterValue);
  const resetFilterValues = useEditor((s) => s.resetFilterValues);
  const removeFilter = useEditor((s) => s.removeFilter);
  const [editing, setEditing] = useState<DashboardFilter | 'new' | null>(null);

  const manageHere = editable && manage;
  if (!manageHere && filters.length === 0) return null;
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
                <Button variant="ghost" size="sm" iconOnly icon={<Settings2 size={13} />} onClick={() => setEditing(f)}>{t('filters.edit')}</Button>
                <Button variant="ghost" size="sm" iconOnly icon={<X size={13} />} onClick={() => removeFilter(f.id)}>{t('filters.remove')}</Button>
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
