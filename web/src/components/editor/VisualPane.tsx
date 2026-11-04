import { useDroppable } from '@dnd-kit/core';
import { BarChart3, BarChartHorizontal, ChartArea, ChartLine, ChartPie, CircleDot, Hash, Table2, Plus, X } from 'lucide-react';
import type { Dimension, Filter, FilterOp, Measure, Widget, WidgetType } from '@/api/types';
import { AGGREGATIONS, DATE_BUCKETS, FILTER_OPS, WIDGET_TYPES } from '@/api/types';
import { useT, type TFn } from '@/i18n';
import { useEditor, useSelectedWidget } from '@/store/editor';
import { CARTESIAN, RADIAL, maxDimensions, maxMeasures } from '@/lib/widget';
import { newId } from '@/lib/id';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Feedback';
import { KindIcon } from '@/components/ui/KindBadge';

export const WELL_DROP_PREFIX = 'well:';

const typeIcons: Record<WidgetType, typeof BarChart3> = {
  column: BarChart3, bar: BarChartHorizontal, line: ChartLine, area: ChartArea, pie: ChartPie, donut: CircleDot, kpi: Hash, table: Table2,
};

function wellLabels(type: WidgetType, t: TFn): { dimensions: string; measures: string } {
  if (type === 'table') return { dimensions: t('editor.wellColumns'), measures: t('editor.wellValues') };
  if (RADIAL.includes(type)) return { dimensions: t('editor.wellCategory'), measures: t('editor.wellValues') };
  return { dimensions: `${t('editor.wellAxis')} / ${t('editor.wellLegend')}`, measures: t('editor.wellValues') };
}

function Well({ id, label, children, empty, disabled }: { id: string; label: string; children: React.ReactNode; empty: boolean; disabled?: boolean }) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  if (disabled) return null;
  return (
    <div ref={setNodeRef} className={['well', isOver && 'well--over'].filter(Boolean).join(' ')}>
      <div className="well__label">{label}</div>
      {empty ? <div className="well__empty">{t('editor.wellDrop')}</div> : children}
    </div>
  );
}

function DimensionChip({ d, onChange, onRemove }: { d: Dimension; onChange: (d: Dimension) => void; onRemove: () => void }) {
  const t = useT();
  return (
    <div className="well-chip">
      <KindIcon kind={d.kind ?? 'string'} size={12} />
      <span className="well-chip__name" title={d.field}>{d.field}</span>
      {d.kind === 'date' && (
        <select className="field__control" aria-label={t('bucket.none')} value={d.bucket ?? 'none'} onChange={(e) => onChange({ ...d, bucket: e.target.value as Dimension['bucket'] })}>
          {DATE_BUCKETS.map((b) => <option key={b} value={b}>{t(`bucket.${b}`)}</option>)}
        </select>
      )}
      <Button variant="ghost" size="sm" iconOnly icon={<X size={12} />} onClick={onRemove}>{t('common.delete')}</Button>
    </div>
  );
}

function MeasureChip({ m, onChange, onRemove }: { m: Measure; onChange: (m: Measure) => void; onRemove: () => void }) {
  const t = useT();
  return (
    <div className="well-chip">
      <KindIcon kind={m.kind ?? 'number'} size={12} />
      <span className="well-chip__name" title={m.field}>{m.field}</span>
      <select className="field__control" aria-label={t('agg.sum')} value={m.agg} onChange={(e) => onChange({ ...m, agg: e.target.value as Measure['agg'] })}>
        {AGGREGATIONS.filter((a) => m.kind === 'number' || !['sum', 'avg'].includes(a)).map((a) => <option key={a} value={a}>{t(`agg.${a}`)}</option>)}
      </select>
      <Button variant="ghost" size="sm" iconOnly icon={<X size={12} />} onClick={onRemove}>{t('common.delete')}</Button>
    </div>
  );
}

const needsValue = (op: FilterOp) => !['is_null', 'not_null'].includes(op);
const needsList = (op: FilterOp) => ['in', 'not_in', 'between'].includes(op);

function FilterRow({ f, fields, onChange, onRemove }: { f: Filter; fields: string[]; onChange: (f: Filter) => void; onRemove: () => void }) {
  const t = useT();
  return (
    <div className="filter-row">
      <div className="filter-row__grid">
        <Select size="sm" aria-label={t('editor.filterField')} value={f.field} onChange={(e) => onChange({ ...f, field: e.target.value })}>
          <option value="">—</option>
          {fields.map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
        <Select size="sm" aria-label={t('editor.filterOp')} value={f.op} onChange={(e) => onChange({ ...f, op: e.target.value as FilterOp, value: undefined, values: undefined })}>
          {FILTER_OPS.map((op) => <option key={op} value={op}>{t(`filterOp.${op}`)}</option>)}
        </Select>
        {needsValue(f.op) && (
          <Input
            size="sm" className="span-2" aria-label={needsList(f.op) ? t('editor.filterValues') : t('editor.filterValue')}
            placeholder={needsList(f.op) ? t('editor.filterValues') : t('editor.filterValue')}
            value={needsList(f.op) ? (f.values ?? []).join(', ') : String(f.value ?? '')}
            onChange={(e) => needsList(f.op)
              ? onChange({ ...f, values: e.target.value.split(',').map((s) => s.trim()).filter(Boolean).map((s) => (s !== '' && !Number.isNaN(Number(s)) ? Number(s) : s)) })
              : onChange({ ...f, value: e.target.value !== '' && !Number.isNaN(Number(e.target.value)) ? Number(e.target.value) : e.target.value })}
          />
        )}
      </div>
      <Button variant="ghost" size="sm" iconOnly icon={<X size={14} />} onClick={onRemove}>{t('common.delete')}</Button>
    </div>
  );
}

/** Right pane: chart type, wells, filters and options for the selected widget. */
export function VisualPane() {
  const t = useT();
  const widget = useSelectedWidget();
  const updateWidget = useEditor((s) => s.updateWidget);
  const setWidgetType = useEditor((s) => s.setWidgetType);
  const activeFields = useEditor((s) => s.activeFields);

  if (!widget) {
    return (
      <aside className="pane pane--right" aria-label={t('editor.visual')}>
        <div className="pane__header"><span className="pane__title">{t('editor.visual')}</span></div>
        <div className="pane__body"><EmptyState compact title={t('editor.selectWidget')} /></div>
      </aside>
    );
  }

  const labels = wellLabels(widget.type, t);
  const q = widget.query;
  const setQuery = (patch: Partial<Widget['query']>) => updateWidget(widget.id, (w) => ({ ...w, query: { ...w.query, ...patch } }));
  const setOptions = (patch: Partial<Widget['options']>) => updateWidget(widget.id, (w) => ({ ...w, options: { ...w.options, ...patch } }));
  const fieldNames = activeFields.length ? activeFields.map((f) => f.name) : Array.from(new Set([...q.dimensions.map((d) => d.field), ...q.measures.map((m) => m.field), ...q.filters.map((f) => f.field)].filter(Boolean)));

  return (
    <aside className="pane pane--right" aria-label={t('editor.visual')}>
      <div className="pane__header"><span className="pane__title">{t('editor.visual')}</span></div>
      <div className="pane__body">
        <Input size="sm" label={t('editor.widgetTitle')} value={widget.title} placeholder={t('editor.widgetDefaultTitle')} onChange={(e) => updateWidget(widget.id, { title: e.target.value })} />

        <div className="pane__section-title">{t('editor.chartType')}</div>
        <div className="chart-type-grid" role="group" aria-label={t('editor.chartType')}>
          {WIDGET_TYPES.map((type) => {
            const Icon = typeIcons[type];
            return (
              <button key={type} type="button" className="chart-type" aria-pressed={widget.type === type} onClick={() => setWidgetType(widget.id, type)} title={t(`chart.${type}`)}>
                <Icon size={18} /><span>{t(`chart.${type}`)}</span>
              </button>
            );
          })}
        </div>

        <Well id={`${WELL_DROP_PREFIX}dimensions`} label={labels.dimensions} empty={q.dimensions.length === 0} disabled={maxDimensions(widget.type) === 0}>
          {q.dimensions.map((d, i) => (
            <DimensionChip key={`${d.field}-${i}`} d={d}
              onChange={(nd) => setQuery({ dimensions: q.dimensions.map((x, j) => (j === i ? nd : x)) })}
              onRemove={() => setQuery({ dimensions: q.dimensions.filter((_, j) => j !== i) })} />
          ))}
        </Well>
        <Well id={`${WELL_DROP_PREFIX}measures`} label={labels.measures} empty={q.measures.length === 0} disabled={maxMeasures(widget.type) === 0}>
          {q.measures.map((m, i) => (
            <MeasureChip key={`${m.field}-${i}`} m={m}
              onChange={(nm) => setQuery({ measures: q.measures.map((x, j) => (j === i ? nm : x)) })}
              onRemove={() => setQuery({ measures: q.measures.filter((_, j) => j !== i) })} />
          ))}
        </Well>

        <div className="row-between">
          <span className="pane__section-title">{t('editor.filters')}</span>
          <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => setQuery({ filters: [...q.filters, { id: newId('f'), field: fieldNames[0] ?? '', op: 'eq' }] })}>{t('editor.addFilter')}</Button>
        </div>
        {q.filters.map((f) => (
          <FilterRow key={f.id} f={f} fields={fieldNames}
            onChange={(nf) => setQuery({ filters: q.filters.map((x) => (x.id === f.id ? nf : x)) })}
            onRemove={() => setQuery({ filters: q.filters.filter((x) => x.id !== f.id) })} />
        ))}

        <div className="pane__section-title">{t('editor.options')}</div>
        {q.measures.length > 0 && widget.type !== 'kpi' && (
          <Select size="sm" label={t('editor.sort')} value={widget.options.sortBy ?? 'none'} onChange={(e) => setOptions({ sortBy: e.target.value as Widget['options']['sortBy'] })}>
            <option value="none">{t('bucket.none')}</option>
            <option value="measure_desc">{t('agg.max')} → {t('agg.min')}</option>
            <option value="measure_asc">{t('agg.min')} → {t('agg.max')}</option>
          </Select>
        )}
        <Select size="sm" label={t('editor.numberFormat')} value={widget.options.numberFormat ?? 'auto'} onChange={(e) => setOptions({ numberFormat: e.target.value as Widget['options']['numberFormat'] })}>
          <option value="auto">{t('editor.formatAuto')}</option>
          <option value="compact">{t('editor.formatCompact')}</option>
          <option value="integer">{t('editor.formatInteger')}</option>
          <option value="currency">{t('editor.formatCurrency')}</option>
          <option value="percent">{t('editor.formatPercent')}</option>
        </Select>
        <Input size="sm" type="number" min={1} max={100000} label={t('editor.limit')} value={q.limit ?? ''} placeholder={widget.type === 'table' ? '500' : '1000'} onChange={(e) => setQuery({ limit: e.target.value ? Number(e.target.value) : undefined })} />
        {(CARTESIAN.includes(widget.type) || RADIAL.includes(widget.type)) && (
          <Checkbox label={t('editor.showLegend')} checked={widget.options.legend !== false} onChange={(e) => setOptions({ legend: e.target.checked })} />
        )}
        {CARTESIAN.includes(widget.type) && (
          <Checkbox label={t('editor.stacked')} checked={!!widget.options.stacked} onChange={(e) => setOptions({ stacked: e.target.checked })} />
        )}
        {widget.type !== 'table' && widget.type !== 'kpi' && (
          <Checkbox label={t('editor.showValues')} checked={!!widget.options.showValues} onChange={(e) => setOptions({ showValues: e.target.checked })} />
        )}
      </div>
    </aside>
  );
}
