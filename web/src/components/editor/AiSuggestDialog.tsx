import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Plus, Sparkles } from 'lucide-react';
import { api } from '@/api/client';
import type { AiSuggestResponse, AiSuggestion } from '@/api/types';
import { useI18nStore, useT } from '@/i18n';
import { useAuth } from '@/store/auth';
import { useEditor } from '@/store/editor';
import { toast } from '@/store/toast';
import { newId } from '@/lib/id';
import { Button } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/Field';
import { EmptyState, ErrorBox, Spinner } from '@/components/ui/Feedback';
import { KindBadge } from '@/components/ui/KindBadge';
import { Modal } from '@/components/ui/Modal';
import { typeIcons } from './VisualPane';

const SUGGESTION_COUNT = 4;

/**
 * "Suggest with AI": describes the dataset shown in the fields pane to the configured provider
 * and turns each answer into a widget on the canvas. The AI only fills the semantic query
 * (fields, aggregations, chart type); the server already dropped anything not in the field list.
 */
export function AiSuggestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const user = useAuth((s) => s.user);
  const activeDataset = useEditor((s) => s.activeDataset);
  const activeFields = useEditor((s) => s.activeFields);
  const addWidget = useEditor((s) => s.addWidget);
  const updateWidget = useEditor((s) => s.updateWidget);

  const [providerId, setProviderId] = useState<number | ''>('');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<AiSuggestResponse | null>(null);
  const [added, setAdded] = useState<number[]>([]);

  const providers = useQuery({ queryKey: ['ai-providers'], queryFn: () => api.ai.providers().then((r) => r.providers), enabled: open });
  const provider = providers.data?.find((p) => p.id === providerId) ?? providers.data?.find((p) => p.isDefault) ?? providers.data?.[0];
  const hasFields = !!activeDataset && activeFields.length > 0;
  const ready = hasFields && !!provider;

  const suggest = useMutation({
    mutationFn: () => api.ai.suggest({
      providerId: provider?.id,
      sourceLabel: activeDataset!.label,
      fields: activeFields.map((f) => ({ name: f.name, kind: f.kind, dataType: f.dataType })),
      prompt: prompt.trim() || undefined,
      lang,
      count: SUGGESTION_COUNT,
    }),
    onSuccess: (r) => { setResult(r); setAdded([]); },
  });

  const place = (s: AiSuggestion) => {
    const id = addWidget(s.type);
    updateWidget(id, (w) => ({
      ...w,
      title: s.title,
      query: {
        ...w.query,
        dimensions: s.dimensions.map((d) => ({ field: d.field, kind: d.kind, bucket: d.bucket })),
        measures: s.measures.map((m) => ({ field: m.field, kind: m.kind, agg: m.agg })),
        filters: s.filters.map((f) => ({ ...f, id: newId('f') })),
      },
      options: { ...w.options, sortBy: s.sortBy },
    }));
  };
  const addOne = (i: number) => { place(result!.suggestions[i]!); setAdded((prev) => [...prev, i]); };
  const addAll = () => {
    const rest = result!.suggestions.map((_, i) => i).filter((i) => !added.includes(i));
    rest.forEach((i) => place(result!.suggestions[i]!));
    toast.success(t('ai.added', { count: rest.length }));
    onClose();
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); if (ready) suggest.mutate(); };
  const allAdded = !!result && added.length === result.suggestions.length;

  return (
    <Modal
      open={open}
      wide
      title={t('ai.suggestTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
          <Button variant="primary" disabled={!result || allAdded || result.suggestions.length === 0} onClick={addAll}>{t('ai.addAll')}</Button>
        </>
      }
    >
      {providers.isLoading && <Spinner block />}
      {providers.error && <ErrorBox error={providers.error} />}
      {providers.data && providers.data.length === 0 && (
        <EmptyState compact title={t('ai.noProvider')} hint={t('ai.noProviderHint')}
          action={user?.role === 'admin' && <Link className="btn btn--secondary btn--sm" to="/settings">{t('common.openSettings')}</Link>} />
      )}
      {providers.data && providers.data.length > 0 && !hasFields && <EmptyState compact title={t('ai.needDataset')} />}
      {providers.data && providers.data.length > 0 && hasFields && activeDataset && (
        <form className="stack" onSubmit={onSubmit}>
          <p className="text-sm text-muted">{t('ai.dataset', { label: activeDataset.label })} · {t('ai.fieldsCount', { count: activeFields.length })}</p>
          {providers.data.length > 1 && (
            <Select size="sm" label={t('ai.provider')} value={provider?.id ?? ''} onChange={(e) => setProviderId(e.target.value ? Number(e.target.value) : '')}>
              {providers.data.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}
            </Select>
          )}
          <Textarea label={t('ai.prompt')} rows={3} placeholder={t('ai.promptPlaceholder')} help={t('ai.promptHelp')} value={prompt} onChange={(e) => setPrompt(e.target.value)} autoFocus />
          <div className="row row--wrap">
            <Button type="submit" variant="primary" icon={<Sparkles size={16} />} loading={suggest.isPending} disabled={!ready}>{suggest.isPending ? t('ai.running') : t('ai.run')}</Button>
            {result && <span className="text-sm text-muted">{t('ai.resultMeta', { provider: result.provider.name, model: result.provider.model, ms: result.durationMs })}</span>}
          </div>
          {suggest.error && <ErrorBox error={suggest.error} />}
          {result && result.suggestions.length === 0 && <EmptyState compact title={t('editor.noData')} />}
          {result && result.suggestions.length > 0 && (
            <div className="stack">
              {result.suggestions.map((s, i) => {
                const Icon = typeIcons[s.type];
                const done = added.includes(i);
                return (
                  <article key={i} className="card">
                    <div className="row">
                      <Icon size={16} aria-hidden />
                      <h3 className="card__title grow truncate">{s.title}</h3>
                      <span className="badge">{t(`chart.${s.type}`)}</span>
                    </div>
                    {s.explanation && <p className="text-sm text-muted">{s.explanation}</p>}
                    <div className="row row--wrap">
                      {s.dimensions.map((d, j) => <KindBadge key={`d-${j}-${d.field}`} kind={d.kind} label={d.bucket && d.bucket !== 'none' ? `${d.field} (${t(`bucket.${d.bucket}`)})` : d.field} />)}
                      {s.measures.map((m, j) => <KindBadge key={`m-${j}-${m.field}`} kind="number" label={`${t(`agg.${m.agg}`)} ${m.field === '*' ? '' : m.field}`.trim()} />)}
                    </div>
                    <div className="card__actions">
                      <Button variant={done ? 'secondary' : 'primary'} size="sm" icon={done ? <Check size={14} /> : <Plus size={14} />} disabled={done} onClick={() => addOne(i)}>
                        {done ? t('ai.addedOne') : t('ai.addOne')}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
