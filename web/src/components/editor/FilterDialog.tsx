import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { DashboardFilter, DashboardFilterKind, QuerySource } from '@/api/types';
import { DASHBOARD_FILTER_KINDS } from '@/api/types';
import { useT } from '@/i18n';
import { useEditor } from '@/store/editor';
import { defaultFilterValue, newDashboardFilter } from '@/lib/filters';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { sourceKeyOf, useSourceFields } from './useSourceFields';

const FORM_ID = 'dashboard-filter-form';

/** Add / edit one dashboard filter: its label, kind, and for a field filter the data source, table and column it reads. */
export function FilterDialog({ open, initial, onClose }: { open: boolean; initial: DashboardFilter | null; onClose: () => void }) {
  const t = useT();
  const activeDataset = useEditor((s) => s.activeDataset);
  const pages = useEditor((s) => s.definition.pages);
  const addFilter = useEditor((s) => s.addFilter);
  const updateFilter = useEditor((s) => s.updateFilter);
  // a new filter applies to the whole report, as every filter did before pages existed; the scope field narrows it to one page
  const [form, setForm] = useState<DashboardFilter>(initial ?? newDashboardFilter('list', activeDataset?.datasourceId ?? null, activeDataset?.source ?? null));
  const set = (patch: Partial<DashboardFilter>) => setForm((f) => ({ ...f, ...patch }));
  const needsField = form.kind !== 'grain';

  const datasources = useQuery({ queryKey: ['datasources'], queryFn: () => api.datasources.list().then((r) => r.datasources), enabled: open && needsField });
  const tables = useQuery({ queryKey: ['tables', form.datasourceId], queryFn: () => api.datasources.tables(form.datasourceId!).then((r) => r.tables), enabled: open && needsField && !!form.datasourceId });
  const datasets = useQuery({ queryKey: ['datasets', form.datasourceId], queryFn: () => api.datasets.list(form.datasourceId!).then((r) => r.datasets), enabled: open && needsField && !!form.datasourceId });
  const fields = useSourceFields(needsField ? form.datasourceId ?? null : null, needsField ? form.source : null);
  // a date range reads a date column; a list reads any column
  const choosable = (fields.data ?? []).filter((f) => (form.kind === 'date_range' ? f.kind === 'date' : true));

  const setSource = (key: string) => {
    if (!key) { set({ source: null, field: undefined }); return; }
    const [type, rest] = key.split(/:(.*)/s);
    const source: QuerySource = type === 'table' ? { type: 'table', table: rest! } : { type: 'dataset', datasetId: Number(rest) };
    set({ source, field: undefined });
  };
  const setKind = (kind: DashboardFilterKind) => {
    // a date range reads a date column: a field chosen for a list is dropped unless it is one
    const keepField = kind === 'list' || (kind === 'date_range' && fields.data?.find((f) => f.name === form.field)?.kind === 'date');
    set({ kind, value: defaultFilterValue(kind), multi: kind === 'list' ? form.multi ?? true : undefined, field: keepField ? form.field : undefined });
  };

  const valid = !needsField || !!(form.datasourceId && form.source && form.field);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const label = form.label.trim() || (form.kind === 'grain' ? t('filters.kinds.grain') : form.field!);
    const next = { ...form, label };
    if (initial) updateFilter(initial.id, next); else addFilter(next);
    onClose();
  };

  return (
    <Modal
      open={open}
      title={initial ? t('filters.editTitle') : t('filters.addTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={!valid}>{t('common.save')}</Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="stack">
        <p className="text-sm text-muted">{form.kind === 'grain' ? t('filters.grainHint') : t('filters.scopeHint')}</p>
        <div className="form-grid">
          <Select label={t('filters.kind')} value={form.kind} onChange={(e) => setKind(e.target.value as DashboardFilterKind)}>
            {DASHBOARD_FILTER_KINDS.map((k) => <option key={k} value={k}>{t(`filters.kinds.${k}`)}</option>)}
          </Select>
          <Input label={t('filters.label')} value={form.label} placeholder={form.kind === 'grain' ? t('filters.kinds.grain') : form.field ?? t(`filters.kinds.${form.kind}`)} onChange={(e) => set({ label: e.target.value })} autoFocus />
          {pages.length > 1 && (
            <Select className="span-2" label={t('filters.scope')} value={form.pageId ?? ''} onChange={(e) => set({ pageId: e.target.value || undefined })} help={t('filters.scopePageHint')}>
              <option value="">{t('filters.scopeAll')}</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{t('filters.scopePage', { name: p.name })}</option>)}
            </Select>
          )}
          {needsField && (
            <>
              <Select label={t('editor.chooseDatasource')} value={form.datasourceId ?? ''} onChange={(e) => set({ datasourceId: e.target.value ? Number(e.target.value) : null, source: null, field: undefined })}>
                <option value="">—</option>
                {datasources.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
              <Select label={t('editor.chooseTable')} value={sourceKeyOf(form.source)} onChange={(e) => setSource(e.target.value)} disabled={!form.datasourceId}>
                <option value="">—</option>
                {!!tables.data?.length && <optgroup label={t('editor.tables')}>{tables.data.map((tb) => <option key={tb.name} value={`table:${tb.name}`}>{tb.name}</option>)}</optgroup>}
                {!!datasets.data?.length && <optgroup label={t('editor.datasets')}>{datasets.data.map((ds) => <option key={ds.id} value={`dataset:${ds.id}`}>{ds.name}</option>)}</optgroup>}
              </Select>
              <Select className="span-2" label={t('filters.field')} value={form.field ?? ''} onChange={(e) => set({ field: e.target.value || undefined })} disabled={!form.source || fields.isLoading}
                help={form.kind === 'date_range' && form.source && fields.data && choosable.length === 0 ? t('filters.noDateFields') : undefined}>
                <option value="">—</option>
                {choosable.map((f) => <option key={f.name} value={f.name}>{f.name} · {t(`kinds.${f.kind}`)}</option>)}
              </Select>
            </>
          )}
          {form.kind === 'list' && (
            <Checkbox className="span-2" label={t('filters.multi')} checked={form.multi !== false} onChange={(e) => set({ multi: e.target.checked })} />
          )}
          {form.kind === 'list' && (
            <Checkbox className="span-2" label={t('filters.independent')} checked={form.independent === true} onChange={(e) => set({ independent: e.target.checked || undefined })} />
          )}
        </div>
      </form>
    </Modal>
  );
}
