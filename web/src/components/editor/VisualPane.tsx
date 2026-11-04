import { useDroppable } from '@dnd-kit/core';
import {
  BarChart3, BarChartHorizontal, ChartArea, ChartCandlestick, ChartLine, ChartNoAxesCombined, ChartPie, ChartScatter, CircleDot, Filter, Gauge, Grid3x3,
  Hash, LayoutDashboard, Plus, Radar, Rows3, Table2, TableProperties, TrendingUp, X,
} from 'lucide-react';
import type { Dimension, Filter as FilterRule, FilterOp, LegendPosition, Measure, Stacking, Widget, WidgetType } from '@/api/types';
import { AGGREGATIONS, DATE_BUCKETS, FILTER_OPS, LEGEND_POSITIONS, STACKINGS, WIDGET_TYPES } from '@/api/types';
import { useT, type TKey } from '@/i18n';
import { useEditor, useSelectedWidget } from '@/store/editor';
import { CHART_SPECS, comboRole, hasFeature, maxDimensions, maxMeasures } from '@/lib/widget';
import { newId } from '@/lib/id';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Feedback';
import { KindIcon } from '@/components/ui/KindBadge';

export const WELL_DROP_PREFIX = 'well:';

/** One icon per chart type; the AI dialog reuses them so a type looks the same everywhere. */
export const typeIcons: Record<WidgetType, typeof BarChart3> = {
  column: BarChart3, bar: BarChartHorizontal, line: ChartLine, area: ChartArea, combo: ChartNoAxesCombined, scatter: ChartScatter, waterfall: ChartCandlestick, funnel: Filter,
  pie: ChartPie, donut: CircleDot, treemap: LayoutDashboard, heatmap: Grid3x3, radar: Radar,
  gauge: Gauge, kpi: Hash, trend: TrendingUp, multirow: Rows3,
  table: Table2, matrix: TableProperties,
};

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

/** "X", "Rows", "Target": what this slot of the well means for the current chart type, when slots differ. */
function Slot({ keyName }: { keyName: TKey | undefined }) {
  const t = useT();
  if (!keyName) return null;
  return <span className="well-chip__slot">{t(keyName)}</span>;
}

function DimensionChip({ d, slot, onChange, onRemove }: { d: Dimension; slot?: TKey; onChange: (d: Dimension) => void; onRemove: () => void }) {
  const t = useT();
  return (
    <div className="well-chip">
      <Slot keyName={slot} />
      <KindIcon kind={d.kind ?? 'string'} size={12} />
      <span className="well-chip__name" title={d.field}>{d.field}</span>
      {d.kind === 'date' && (
        <Select size="sm" aria-label={t('editor.bucketLabel')} value={d.bucket ?? 'none'} onChange={(e) => onChange({ ...d, bucket: e.target.value as Dimension['bucket'] })}>
          {DATE_BUCKETS.map((b) => <option key={b} value={b}>{t(`bucket.${b}`)}</option>)}
        </Select>
      )}
      <Button variant="ghost" size="sm" iconOnly icon={<X size={12} />} onClick={onRemove}>{t('common.delete')}</Button>
    </div>
  );
}

function MeasureChip({ m, slot, combo, onChange, onRemove }: { m: Measure; slot?: TKey; combo?: 'column' | 'line'; onChange: (m: Measure) => void; onRemove: () => void }) {
  const t = useT();
  const ComboIcon = combo === 'line' ? ChartLine : BarChart3;
  return (
    <div className="well-chip">
      <Slot keyName={slot} />
      <KindIcon kind={m.kind ?? 'number'} size={12} />
      <span className="well-chip__name" title={m.field}>{m.field}</span>
      <Select size="sm" aria-label={t('editor.aggLabel')} value={m.agg} onChange={(e) => onChange({ ...m, agg: e.target.value as Measure['agg'] })}>
        {AGGREGATIONS.filter((a) => !m.kind || m.kind === 'number' || !['sum', 'avg'].includes(a)).map((a) => <option key={a} value={a}>{t(`agg.${a}`)}</option>)}
      </Select>
      {combo && (
        // combo chart: this measure is a column or the line; the button shows what it is now and flips it
        <Button variant="ghost" size="sm" iconOnly icon={<ComboIcon size={12} />} aria-pressed={combo === 'line'} title={combo === 'line' ? t('editor.comboAsColumn') : t('editor.comboAsLine')}
          onClick={() => onChange({ ...m, series: combo === 'line' ? 'column' : 'line' })}>
          {combo === 'line' ? t('editor.comboAsColumn') : t('editor.comboAsLine')}
        </Button>
      )}
      <Button variant="ghost" size="sm" iconOnly icon={<X size={12} />} onClick={onRemove}>{t('common.delete')}</Button>
    </div>
  );
}

const needsValue = (op: FilterOp) => !['is_null', 'not_null'].includes(op);
const needsList = (op: FilterOp) => ['in', 'not_in', 'between'].includes(op);

function FilterRow({ f, fields, onChange, onRemove }: { f: FilterRule; fields: string[]; onChange: (f: FilterRule) => void; onRemove: () => void }) {
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

/** An optional number option: empty clears it. */
function NumberOption({ label, value, placeholder, onChange }: { label: string; value: number | undefined; placeholder?: string; onChange: (v: number | undefined) => void }) {
  return (
    <Input size="sm" type="number" label={label} value={value ?? ''} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' || Number.isNaN(Number(e.target.value)) ? undefined : Number(e.target.value))} />
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
        <div className="pane__header"><h2 className="pane__title">{t('editor.visual')}</h2></div>
        <div className="pane__body"><EmptyState compact title={t('editor.selectWidget')} /></div>
      </aside>
    );
  }

  const spec = CHART_SPECS[widget.type];
  const q = widget.query;
  const o = widget.options;
  const setQuery = (patch: Partial<Widget['query']>) => updateWidget(widget.id, (w) => ({ ...w, query: { ...w.query, ...patch } }));
  const setOptions = (patch: Partial<Widget['options']>) => updateWidget(widget.id, (w) => ({ ...w, options: { ...w.options, ...patch } }));
  const fieldNames = activeFields.length ? activeFields.map((f) => f.name) : Array.from(new Set([...q.dimensions.map((d) => d.field), ...q.measures.map((m) => m.field), ...q.filters.map((f) => f.field)].filter(Boolean)));
  const stacking: Stacking = o.stacking ?? (o.stacked ? 'stacked' : 'none');
  const isTable = widget.type === 'table' || widget.type === 'matrix';
  const has = (f: Parameters<typeof hasFeature>[1]) => hasFeature(widget.type, f);

  return (
    <aside className="pane pane--right" aria-label={t('editor.visual')}>
      <div className="pane__header"><h2 className="pane__title">{t('editor.visual')}</h2></div>
      <div className="pane__body">
        <Input size="sm" label={t('editor.widgetTitle')} value={widget.title} placeholder={t('editor.widgetDefaultTitle')} onChange={(e) => updateWidget(widget.id, { title: e.target.value })} />

        {/* the gallery is icon-only, like Power BI's; the chosen type is named beside the section title */}
        <div className="row-between">
          <div className="pane__section-title">{t('editor.chartType')}</div>
          <span className="text-sm text-muted truncate">{t(`chart.${widget.type}`)}</span>
        </div>
        <div className="chart-type-grid" role="group" aria-label={t('editor.chartType')}>
          {WIDGET_TYPES.map((type) => {
            const Icon = typeIcons[type];
            return (
              <button key={type} type="button" className="chart-type" aria-pressed={widget.type === type} onClick={() => setWidgetType(widget.id, type)} title={t(`chart.${type}`)}>
                <Icon size={18} aria-hidden /><span className="sr-only">{t(`chart.${type}`)}</span>
              </button>
            );
          })}
        </div>

        <Well id={`${WELL_DROP_PREFIX}dimensions`} label={t(spec.wells.dimensions)} empty={q.dimensions.length === 0} disabled={maxDimensions(widget.type) === 0}>
          {q.dimensions.map((d, i) => (
            <DimensionChip key={`${d.field}-${i}`} d={d} slot={spec.dimensionSlots?.[i]}
              onChange={(nd) => setQuery({ dimensions: q.dimensions.map((x, j) => (j === i ? nd : x)) })}
              onRemove={() => setQuery({ dimensions: q.dimensions.filter((_, j) => j !== i) })} />
          ))}
        </Well>
        <Well id={`${WELL_DROP_PREFIX}measures`} label={t(spec.wells.measures)} empty={q.measures.length === 0} disabled={maxMeasures(widget.type) === 0}>
          {q.measures.map((m, i) => (
            <MeasureChip key={`${m.field}-${i}`} m={m} slot={spec.measureSlots?.[i]} combo={widget.type === 'combo' ? comboRole(q.measures, i) : undefined}
              onChange={(nm) => setQuery({ measures: q.measures.map((x, j) => (j === i ? nm : x)) })}
              onRemove={() => setQuery({ measures: q.measures.filter((_, j) => j !== i) })} />
          ))}
        </Well>

        <div className="row-between">
          <div className="pane__section-title">{t('editor.filters')}</div>
          <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => setQuery({ filters: [...q.filters, { id: newId('f'), field: fieldNames[0] ?? '', op: 'eq' }] })}>{t('editor.addFilter')}</Button>
        </div>
        {q.filters.map((f) => (
          <FilterRow key={f.id} f={f} fields={fieldNames}
            onChange={(nf) => setQuery({ filters: q.filters.map((x) => (x.id === f.id ? nf : x)) })}
            onRemove={() => setQuery({ filters: q.filters.filter((x) => x.id !== f.id) })} />
        ))}

        <div className="pane__section-title">{t('editor.options')}</div>
        {has('sort') && q.measures.length > 0 && (
          <Select size="sm" label={t('editor.sort')} value={o.sortBy ?? 'none'} onChange={(e) => setOptions({ sortBy: e.target.value as Widget['options']['sortBy'] })}>
            <option value="none">{t('common.none')}</option>
            <option value="measure_desc">{t('editor.sortDesc')}</option>
            <option value="measure_asc">{t('editor.sortAsc')}</option>
          </Select>
        )}
        <Select size="sm" label={t('editor.numberFormat')} value={o.numberFormat ?? 'auto'} onChange={(e) => setOptions({ numberFormat: e.target.value as Widget['options']['numberFormat'] })}>
          <option value="auto">{t('editor.formatAuto')}</option>
          <option value="compact">{t('editor.formatCompact')}</option>
          <option value="integer">{t('editor.formatInteger')}</option>
          <option value="currency">{t('editor.formatCurrency')}</option>
          <option value="percent">{t('editor.formatPercent')}</option>
        </Select>
        {spec.maxDimensions > 0 && (
          <Input size="sm" type="number" min={1} max={100000} label={t('editor.limit')} value={q.limit ?? ''} placeholder={String(spec.limit)} onChange={(e) => setQuery({ limit: e.target.value ? Number(e.target.value) : undefined })} />
        )}
        {has('stacking') && (
          <Select size="sm" label={t('editor.stacking')} value={stacking} onChange={(e) => setOptions({ stacking: e.target.value as Stacking, stacked: undefined })}>
            {STACKINGS.map((s) => <option key={s} value={s}>{s === 'none' ? t('common.none') : s === 'stacked' ? t('editor.stackingStacked') : t('editor.stackingPercent')}</option>)}
          </Select>
        )}
        {has('legend') && (
          <Checkbox label={t('editor.showLegend')} checked={o.legend !== false} onChange={(e) => setOptions({ legend: e.target.checked })} />
        )}
        {has('legend') && o.legend !== false && (
          <Select size="sm" label={t('editor.legendPosition')} value={o.legendPosition ?? 'bottom'} onChange={(e) => setOptions({ legendPosition: e.target.value as LegendPosition })}>
            {LEGEND_POSITIONS.map((p) => <option key={p} value={p}>{p === 'bottom' ? t('editor.legendBottom') : p === 'top' ? t('editor.legendTop') : t('editor.legendRight')}</option>)}
          </Select>
        )}
        {has('showValues') && (
          <Checkbox label={widget.type === 'gauge' ? t('editor.showTarget') : t('editor.showValues')} checked={widget.type === 'gauge' ? o.showValues !== false : !!o.showValues} onChange={(e) => setOptions({ showValues: e.target.checked })} />
        )}
        {has('totals') && (
          <Checkbox label={t('editor.showTotals')} checked={!!o.showTotals} onChange={(e) => setOptions({ showTotals: e.target.checked })} />
        )}
        {has('dataBars') && (
          <Checkbox label={t('editor.dataBars')} checked={!!o.dataBars} onChange={(e) => setOptions({ dataBars: e.target.checked })} />
        )}
        {has('gauge') && (
          <>
            <div className="option-grid">
              <NumberOption label={t('editor.gaugeMin')} value={o.gaugeMin} placeholder="0" onChange={(v) => setOptions({ gaugeMin: v })} />
              <NumberOption label={t('editor.gaugeMax')} value={o.gaugeMax} placeholder={t('editor.formatAuto')} onChange={(v) => setOptions({ gaugeMax: v })} />
            </div>
            {q.measures.length < 2 && <NumberOption label={t('editor.target')} value={o.target} onChange={(v) => setOptions({ target: v })} />}
          </>
        )}
        {widget.type === 'trend' && q.measures.length < 2 && (
          <NumberOption label={t('editor.target')} value={o.target} onChange={(v) => setOptions({ target: v })} />
        )}

        {has('analytics') && !isTable && (
          <>
            <div className="pane__section-title">{t('editor.analytics')}</div>
            <NumberOption label={t('editor.referenceLine')} value={o.referenceLine} onChange={(v) => setOptions({ referenceLine: v })} />
            <Checkbox label={t('editor.averageLine')} checked={!!o.averageLine} onChange={(e) => setOptions({ averageLine: e.target.checked })} />
          </>
        )}
      </div>
    </aside>
  );
}
