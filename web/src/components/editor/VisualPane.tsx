import { useRef, useState, type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  BarChart3, BarChartHorizontal, ChartArea, ChartCandlestick, ChartLine, ChartNoAxesCombined, ChartPie, ChartScatter, CircleDot, Filter, Gauge, Grid3x3,
  Hash, LayoutDashboard, Plus, Radar, Rows3, Settings2, Sigma, Table2, TableProperties, TrendingUp, X,
} from 'lucide-react';
import type { Dimension, Filter as FilterRule, FilterOp, LegendPosition, Measure, NumberFormat, ShowAs, Stacking, Widget, WidgetType } from '@/api/types';
import { AGGREGATIONS, DATE_BUCKETS, FILTER_OPS, LEGEND_POSITIONS, SHOW_AS, STACKINGS, WIDGET_TYPES, isFormula } from '@/api/types';
import { useT, type TFn, type TKey } from '@/i18n';
import { FORMULA_MAX_LENGTH, checkFormula, type FormulaError } from '@shared/formula';
import { useEditor, useSelectedWidget } from '@/store/editor';
import { CHART_SPECS, comboRole, dimensionName, hasFeature, matrixColumnCount, matrixSplit, maxDimensions, maxMeasures, measureAlias, measureName, measureRefs, newFormulaMeasure, stackingOf } from '@/lib/widget';
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

const NUMBER_FORMATS: NumberFormat[] = ['auto', 'compact', 'integer', 'currency', 'percent'];
/** what the server accepts for a display name (routes: `label` max 200) */
const LABEL_MAX = 200;
const formatKey = (f: NumberFormat): TKey => `editor.format${(f[0]!.toUpperCase() + f.slice(1)) as 'Auto' | 'Compact' | 'Integer' | 'Currency' | 'Percent'}`;

function Well({ id, label, children, empty, disabled, action }: { id: string; label: string; children: ReactNode; empty: boolean; disabled?: boolean; /** a control shown under the chips, empty or not */ action?: ReactNode }) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  if (disabled) return null;
  return (
    <div ref={setNodeRef} className={['well', isOver && 'well--over'].filter(Boolean).join(' ')}>
      <div className="well__label">{label}</div>
      {empty ? <div className="well__empty">{t('editor.wellDrop')}</div> : children}
      {action}
    </div>
  );
}

/** "X", "Rows", "Target": what this slot of the well means for the current chart type, when slots differ. */
function Slot({ keyName }: { keyName: TKey | undefined }) {
  const t = useT();
  if (!keyName) return null;
  return <span className="well-chip__slot">{t(keyName)}</span>;
}

/** The toggle at the end of a chip that opens its settings (display name, show as, format). */
function DetailsToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const t = useT();
  // open / closed is one state: `aria-expanded` says it, the pressed look follows it (not `active`, which would add aria-pressed)
  return <Button variant="ghost" size="sm" iconOnly icon={<Settings2 size={12} />} className={open ? 'btn--active' : undefined} aria-expanded={open} title={t('editor.fieldSettings')} onClick={onToggle}>{t('editor.fieldSettings')}</Button>;
}

function DimensionChip({ d, slot, onChange, onRemove }: { d: Dimension; slot?: TKey; onChange: (d: Dimension) => void; onRemove: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="well-item">
      <div className="well-chip">
        <Slot keyName={slot} />
        <KindIcon kind={d.kind ?? 'string'} size={12} />
        <span className="well-chip__name" title={d.field}>{dimensionName(d)}</span>
        {d.kind === 'date' && (
          <Select size="sm" aria-label={t('editor.bucketLabel')} value={d.bucket ?? 'none'} onChange={(e) => onChange({ ...d, bucket: e.target.value as Dimension['bucket'] })}>
            {DATE_BUCKETS.map((b) => <option key={b} value={b}>{t(`bucket.${b}`)}</option>)}
          </Select>
        )}
        <DetailsToggle open={open} onToggle={() => setOpen((o) => !o)} />
        <Button variant="ghost" size="sm" iconOnly icon={<X size={12} />} onClick={onRemove}>{t('common.delete')}</Button>
      </div>
      {open && (
        <div className="well-details">
          <Input size="sm" label={t('editor.displayName')} value={d.label ?? ''} placeholder={d.field} maxLength={LABEL_MAX} onChange={(e) => onChange({ ...d, label: e.target.value || undefined })} />
        </div>
      )}
    </div>
  );
}

/** The settings every measure has: its display name, what it is shown as, and its own number format. */
function MeasureDetails({ m, auto, onChange, children }: { m: Measure; auto: string; onChange: (m: Measure) => void; children?: ReactNode }) {
  const t = useT();
  return (
    <div className="well-details">
      {children}
      <Input size="sm" label={t('editor.displayName')} value={m.label ?? ''} placeholder={auto} maxLength={LABEL_MAX} onChange={(e) => onChange({ ...m, label: e.target.value || undefined })} />
      <div className="option-grid">
        <Select size="sm" label={t('editor.showAs')} value={m.showAs ?? 'value'} onChange={(e) => onChange({ ...m, showAs: e.target.value === 'value' ? undefined : (e.target.value as ShowAs) })}>
          {SHOW_AS.map((s) => <option key={s} value={s}>{t(`editor.showAsOptions.${s}`)}</option>)}
        </Select>
        <Select size="sm" label={t('editor.measureFormat')} value={m.format ?? ''} disabled={!!m.showAs && m.showAs !== 'value'} onChange={(e) => onChange({ ...m, format: (e.target.value || undefined) as NumberFormat | undefined })}>
          <option value="">{t('editor.formatDefault')}</option>
          {NUMBER_FORMATS.map((f) => <option key={f} value={f}>{t(formatKey(f))}</option>)}
        </Select>
      </div>
    </div>
  );
}

function MeasureChip({ m, slot, combo, onChange, onRemove }: { m: Measure; slot?: TKey; combo?: 'column' | 'line'; onChange: (m: Measure) => void; onRemove: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const auto = measureName({ ...m, label: undefined }, t);
  return (
    <div className="well-item">
      <div className="well-chip">
        <Slot keyName={slot} />
        <KindIcon kind={m.kind ?? 'number'} size={12} />
        <span className="well-chip__name" title={m.field}>{m.label?.trim() || m.field}</span>
        <Select size="sm" aria-label={t('editor.aggLabel')} value={m.agg} onChange={(e) => onChange({ ...m, agg: e.target.value as Measure['agg'] })}>
          {AGGREGATIONS.filter((a) => !m.kind || m.kind === 'number' || !['sum', 'avg'].includes(a)).map((a) => <option key={a} value={a}>{t(`agg.${a}`)}</option>)}
        </Select>
        {combo && (
          // combo chart: "draw as a line" is pressed while this measure is the line; columns are the rest
          <Button variant="ghost" size="sm" iconOnly icon={<ChartLine size={12} />} active={combo === 'line'} title={t('editor.comboAsLine')}
            onClick={() => onChange({ ...m, series: combo === 'line' ? 'column' : 'line' })}>
            {t('editor.comboAsLine')}
          </Button>
        )}
        <DetailsToggle open={open} onToggle={() => setOpen((o) => !o)} />
        <Button variant="ghost" size="sm" iconOnly icon={<X size={12} />} onClick={onRemove}>{t('common.delete')}</Button>
      </div>
      {open && <MeasureDetails m={m} auto={auto} onChange={onChange} />}
    </div>
  );
}

/** "Position 7: no measure named …": where a formula goes wrong, in the reader's words. */
function describeFormulaError(err: FormulaError, t: TFn): string {
  const message = t(`formula.${err.code}`, { token: err.token ?? '' });
  return err.code === 'empty' ? message : t('formula.at', { position: err.position + 1, message });
}

/** A calculated measure: its expression, the measures it may name, and the settings every measure has. */
function FormulaChip({ m, slot, others, error, combo, onChange, onRemove }: {
  m: Measure; slot?: TKey; /** the widget's other measures, offered for insertion */ others: Measure[]; error: FormulaError | null;
  combo?: 'column' | 'line'; onChange: (m: Measure) => void; onRemove: () => void;
}) {
  const t = useT();
  // a fresh calculation opens on its expression; afterwards the chip folds like the others
  const [open, setOpen] = useState(!m.formula);
  const input = useRef<HTMLInputElement>(null);
  const insert = (text: string) => {
    const el = input.current;
    const current = m.formula ?? '';
    const at = el?.selectionStart ?? current.length;
    const before = current.slice(0, at); const after = current.slice(el?.selectionEnd ?? at);
    const pad = before && !before.endsWith(' ') ? ' ' : '';
    onChange({ ...m, formula: `${before}${pad}${text}${after.startsWith(' ') || !after ? '' : ' '}${after}` });
    requestAnimationFrame(() => { el?.focus(); const pos = before.length + pad.length + text.length; el?.setSelectionRange(pos, pos); });
  };
  return (
    <div className="well-item">
      <div className="well-chip">
        <Slot keyName={slot} />
        <Sigma size={12} aria-hidden className="kind-icon kind-icon--number" />
        <span className="well-chip__name" title={m.formula}>{measureName(m, t)}</span>
        {combo && (
          <Button variant="ghost" size="sm" iconOnly icon={<ChartLine size={12} />} active={combo === 'line'} title={t('editor.comboAsLine')}
            onClick={() => onChange({ ...m, series: combo === 'line' ? 'column' : 'line' })}>
            {t('editor.comboAsLine')}
          </Button>
        )}
        <DetailsToggle open={open} onToggle={() => setOpen((o) => !o)} />
        <Button variant="ghost" size="sm" iconOnly icon={<X size={12} />} onClick={onRemove}>{t('common.delete')}</Button>
      </div>
      {open && (
        <MeasureDetails m={m} auto={t('editor.calculation')} onChange={onChange}>
          <Input ref={input} size="sm" className="well-details__formula" label={t('editor.formula')} value={m.formula ?? ''} placeholder={t('editor.formulaPlaceholder')}
            spellCheck={false} autoComplete="off" maxLength={FORMULA_MAX_LENGTH} error={error ? describeFormulaError(error, t) : undefined} help={error ? undefined : t('editor.formulaHelp')}
            onChange={(e) => onChange({ ...m, formula: e.target.value })} />
          {others.length > 0 && (
            <div className="row row--wrap well-details__refs" role="group" aria-label={t('editor.formulaInsert')}>
              {others.map((o) => <Button key={measureAlias(o)} variant="ghost" size="sm" onClick={() => insert(`[${measureAlias(o)}]`)}>{measureName(o, t)}</Button>)}
            </div>
          )}
        </MeasureDetails>
      )}
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
  const stacking = stackingOf(widget);
  const has = (f: Parameters<typeof hasFeature>[1]) => hasFeature(widget.type, f);
  // every formula is checked against the widget's measures as they stand, so a mistake shows where it is typed
  const refs = measureRefs(q.measures);
  const formulaError = (i: number): FormulaError | null => { const r = checkFormula(refs[i]!, refs); return r.ok ? null : r.error; };
  const canAddMeasure = q.measures.length < maxMeasures(widget.type);
  // a matrix keeps its row levels and its column dimensions in two wells over one dimension list
  const split = matrixSplit(widget);
  const rowDims = spec.columnsWell ? split.rows : q.dimensions;
  const colDims = spec.columnsWell ? split.columns : [];
  const removeDimension = (index: number, fromColumns: boolean) => updateWidget(widget.id, (w) => ({
    ...w,
    query: { ...w.query, dimensions: w.query.dimensions.filter((_, j) => j !== index) },
    options: fromColumns ? { ...w.options, matrixColumns: Math.max(0, matrixColumnCount(w) - 1) } : w.options,
  }));

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

        <Well id={`${WELL_DROP_PREFIX}dimensions`} label={t(spec.wells.dimensions)} empty={rowDims.length === 0} disabled={maxDimensions(widget.type) === 0}>
          {rowDims.map((d, i) => (
            <DimensionChip key={`${d.field}-${i}`} d={d} slot={spec.dimensionSlots?.[i]}
              onChange={(nd) => setQuery({ dimensions: q.dimensions.map((x, j) => (j === i ? nd : x)) })}
              onRemove={() => removeDimension(i, false)} />
          ))}
        </Well>
        {spec.columnsWell && (
          <Well id={`${WELL_DROP_PREFIX}columns`} label={t(spec.columnsWell)} empty={colDims.length === 0}>
            {colDims.map((d, i) => {
              const index = rowDims.length + i;
              return (
                <DimensionChip key={`${d.field}-${index}`} d={d}
                  onChange={(nd) => setQuery({ dimensions: q.dimensions.map((x, j) => (j === index ? nd : x)) })}
                  onRemove={() => removeDimension(index, true)} />
              );
            })}
          </Well>
        )}
        <Well id={`${WELL_DROP_PREFIX}measures`} label={t(spec.wells.measures)} empty={q.measures.length === 0} disabled={maxMeasures(widget.type) === 0}
          action={canAddMeasure && <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => setQuery({ measures: [...q.measures, newFormulaMeasure()] })}>{t('editor.addCalculation')}</Button>}>
          {q.measures.map((m, i) => {
            const onChange = (nm: Measure) => setQuery({ measures: q.measures.map((x, j) => (j === i ? nm : x)) });
            const onRemove = () => setQuery({ measures: q.measures.filter((_, j) => j !== i) });
            const combo = has('series') ? comboRole(q.measures, i) : undefined;
            return isFormula(m)
              ? <FormulaChip key={measureAlias(m)} m={m} slot={spec.measureSlots?.[i]} others={q.measures.filter((_, j) => j !== i)} error={formulaError(i)} combo={combo} onChange={onChange} onRemove={onRemove} />
              : <MeasureChip key={`${m.field}-${i}`} m={m} slot={spec.measureSlots?.[i]} combo={combo} onChange={onChange} onRemove={onRemove} />;
          })}
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
          {NUMBER_FORMATS.map((f) => <option key={f} value={f}>{t(formatKey(f))}</option>)}
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
          <Checkbox label={t('editor.showValues')} checked={!!o.showValues} onChange={(e) => setOptions({ showValues: e.target.checked })} />
        )}
        {has('series') && (
          <Checkbox label={t('editor.sharedAxis')} checked={!!o.sharedAxis} onChange={(e) => setOptions({ sharedAxis: e.target.checked })} />
        )}
        {has('totals') && (
          <Checkbox label={t('editor.showTotals')} checked={!!o.showTotals} onChange={(e) => setOptions({ showTotals: e.target.checked })} />
        )}
        {has('hierarchy') && rowDims.length > 1 && (
          // how many row levels a reader sees at first; every deeper level opens with its parent's toggle
          <Select size="sm" label={t('editor.matrixExpand')} value={Math.min(o.matrixExpand ?? 1, rowDims.length)} onChange={(e) => setOptions({ matrixExpand: Number(e.target.value) })}>
            {rowDims.map((_, i) => <option key={i} value={i + 1}>{i + 1 === rowDims.length ? t('editor.expandAllLevels') : t('editor.expandToLevel', { count: i + 1 })}</option>)}
          </Select>
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
            <Checkbox label={t('editor.showTarget')} checked={o.showTarget !== false} onChange={(e) => setOptions({ showTarget: e.target.checked })} />
          </>
        )}
        {has('target') && q.measures.length < 2 && (
          // the second measure is the target when there is one; otherwise a number typed here
          <NumberOption label={t('editor.target')} value={o.target} onChange={(v) => setOptions({ target: v })} />
        )}

        {has('analytics') && (
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
