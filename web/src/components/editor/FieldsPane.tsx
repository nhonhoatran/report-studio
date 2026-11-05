import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDraggable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { api } from '@/api/client';
import type { FieldInfo, QuerySource } from '@/api/types';
import { useT } from '@/i18n';
import { useEditor, usePageWidgets } from '@/store/editor';
import { Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorBox, Spinner } from '@/components/ui/Feedback';
import { KindIcon } from '@/components/ui/KindBadge';
import { useSourceFields } from './useSourceFields';

export const FIELD_DRAG_PREFIX = 'field:';

function FieldItem({ field, onAdd }: { field: FieldInfo; onAdd: () => void }) {
  const t = useT();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${FIELD_DRAG_PREFIX}${field.name}`, data: { field } });
  return (
    <li ref={setNodeRef} className={['field-item', isDragging && 'field-item--dragging'].filter(Boolean).join(' ')} {...listeners} {...attributes} title={`${field.name} · ${field.dataType}`}>
      <KindIcon kind={field.kind} />
      <span className="field-item__name">{field.name}</span>
      <span className="field-item__type">{t(`kinds.${field.kind}`)}</span>
      <Button className="field-item__add" variant="ghost" size="sm" iconOnly icon={<Plus size={14} />} onPointerDown={(e) => e.stopPropagation()} onClick={onAdd}>{t('common.add')}</Button>
    </li>
  );
}

/** Left pane: pick data source + table/dataset, list its fields as draggables. */
export function FieldsPane() {
  const t = useT();
  const selectedId = useEditor((s) => s.selectedId);
  const widgets = usePageWidgets();
  const setActiveDataset = useEditor((s) => s.setActiveDataset);
  const dropField = useEditor((s) => s.dropField);
  const addWidget = useEditor((s) => s.addWidget);

  const [datasourceId, setDatasourceId] = useState<number | ''>('');
  const [sourceKey, setSourceKey] = useState<string>('');

  const datasources = useQuery({ queryKey: ['datasources'], queryFn: () => api.datasources.list().then((r) => r.datasources) });
  const tables = useQuery({ queryKey: ['tables', datasourceId], queryFn: () => api.datasources.tables(Number(datasourceId)).then((r) => r.tables), enabled: datasourceId !== '' });
  const datasets = useQuery({ queryKey: ['datasets', datasourceId], queryFn: () => api.datasets.list(Number(datasourceId)).then((r) => r.datasets), enabled: datasourceId !== '' });

  // default to the first data source
  useEffect(() => {
    if (datasourceId === '' && datasources.data?.length) setDatasourceId(datasources.data[0]!.id);
  }, [datasources.data, datasourceId]);

  // follow the selected widget's dataset; with nothing selected, start from the first configured widget
  useEffect(() => {
    const w = widgets.find((x) => x.id === selectedId) ?? (sourceKey === '' ? widgets.find((x) => x.source) : undefined);
    if (w?.datasourceId && w.source) {
      setDatasourceId(w.datasourceId);
      setSourceKey(w.source.type === 'table' ? `table:${w.source.table}` : `dataset:${w.source.datasetId}`);
    }
  }, [selectedId, widgets]); // eslint-disable-line react-hooks/exhaustive-deps

  const source = useMemo<QuerySource | null>(() => {
    if (!sourceKey) return null;
    const [kind, rest] = sourceKey.split(/:(.*)/s);
    return kind === 'table' ? { type: 'table', table: rest! } : { type: 'dataset', datasetId: Number(rest) };
  }, [sourceKey]);

  const fields = useSourceFields(datasourceId, source);

  useEffect(() => {
    if (datasourceId !== '' && source && fields.data) {
      const label = source.type === 'table' ? source.table : datasets.data?.find((d) => d.id === source.datasetId)?.name ?? `#${source.datasetId}`;
      setActiveDataset({ datasourceId: Number(datasourceId), source, label }, fields.data);
    } else {
      setActiveDataset(null, []);
    }
  }, [datasourceId, source, fields.data, datasets.data, setActiveDataset]);

  const onAdd = (f: FieldInfo) => {
    const id = selectedId ?? addWidget();
    dropField(id, f);
  };

  return (
    <aside className="pane" aria-label={t('editor.fields')}>
      <div className="pane__header"><h2 className="pane__title">{t('editor.fields')}</h2></div>
      <div className="pane__body">
        <Select size="sm" label={t('editor.chooseDatasource')} value={datasourceId} onChange={(e) => { setDatasourceId(e.target.value ? Number(e.target.value) : ''); setSourceKey(''); }}>
          <option value="">—</option>
          {datasources.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Select size="sm" label={t('editor.chooseTable')} value={sourceKey} onChange={(e) => setSourceKey(e.target.value)} disabled={datasourceId === ''}>
          <option value="">—</option>
          {!!tables.data?.length && (
            <optgroup label={t('editor.tables')}>
              {tables.data.map((tb) => <option key={tb.name} value={`table:${tb.name}`}>{tb.name}</option>)}
            </optgroup>
          )}
          {!!datasets.data?.length && (
            <optgroup label={t('editor.datasets')}>
              {datasets.data.map((ds) => <option key={ds.id} value={`dataset:${ds.id}`}>{ds.name}</option>)}
            </optgroup>
          )}
        </Select>
        {datasources.error && <ErrorBox error={datasources.error} />}
        {tables.error && <ErrorBox error={tables.error} />}
        {datasets.error && <ErrorBox error={datasets.error} />}
        {fields.isLoading && <Spinner />}
        {fields.error && <ErrorBox error={fields.error} />}
        {!source && !fields.isLoading && <EmptyState compact title={t('editor.noFields')} />}
        {fields.data && (
          <>
            <p className="text-sm text-muted">{t('editor.dragHint')}</p>
            <ul className="fields">
              {fields.data.map((f) => <FieldItem key={f.name} field={f} onAdd={() => onAdd(f)} />)}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
