import { Plus, X } from 'lucide-react';
import type { UserAttributes } from '@/api/types';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

/** Attribute rows as the form holds them: a key and its values as one comma-separated text, so typing a comma does not reorder anything. */
export interface AttributeRow { key: string; values: string }

export const toRows = (a: UserAttributes | Record<string, string[]> | undefined): AttributeRow[] =>
  Object.entries(a ?? {}).map(([key, values]) => ({ key, values: values.join(', ') }));

export const fromRows = (rows: AttributeRow[]): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const r of rows) {
    const key = r.key.trim();
    const values = r.values.split(',').map((v) => v.trim()).filter(Boolean);
    if (key && values.length) out[key] = Array.from(new Set(values));
  }
  return out;
};

/** Key = values rows (ABAC attributes on a user, or the attribute conditions of a policy). */
export function AttributesEditor({ rows, onChange, hint }: { rows: AttributeRow[]; onChange: (rows: AttributeRow[]) => void; hint?: string }) {
  const t = useT();
  const set = (i: number, patch: Partial<AttributeRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="stack">
      {hint && <p className="text-sm text-muted">{hint}</p>}
      {rows.map((r, i) => (
        <div key={i} className="attr-row">
          <Input size="sm" aria-label={t('settings.attributeKey')} placeholder={t('settings.attributeKey')} value={r.key} onChange={(e) => set(i, { key: e.target.value })} />
          <Input size="sm" aria-label={t('settings.attributeValues')} placeholder={t('settings.attributeValues')} value={r.values} onChange={(e) => set(i, { values: e.target.value })} />
          <Button variant="ghost" size="sm" iconOnly icon={<X size={14} />} onClick={() => onChange(rows.filter((_, j) => j !== i))}>{t('common.delete')}</Button>
        </div>
      ))}
      <div><Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => onChange([...rows, { key: '', values: '' }])}>{t('settings.addAttribute')}</Button></div>
    </div>
  );
}
