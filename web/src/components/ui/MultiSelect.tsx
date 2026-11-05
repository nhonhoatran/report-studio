import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Checkbox } from './Field';

export interface MultiSelectOption<T extends string | number> { value: T; label: ReactNode }

/**
 * Several values from a list, behind one control the size of a Select: a native <details>
 * (keyboard, Escape and focus come from the platform) whose menu is a column of the project's
 * Checkboxes. An empty selection means "all", which is the first row.
 */
export function MultiSelect<T extends string | number>({ label, value, options, onChange, allLabel, summary, size, id: givenId }: {
  label: ReactNode; value: T[]; options: MultiSelectOption<T>[]; onChange: (v: T[]) => void;
  allLabel: ReactNode; /** the text shown while something is selected, e.g. "3 selected" */ summary: ReactNode; size?: 'sm' | 'md'; id?: string;
}) {
  const auto = useId(); const id = givenId ?? auto;
  const ref = useRef<HTMLDetailsElement>(null);

  // a click outside closes the menu, as a native select would
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onDoc = (e: MouseEvent) => { if (el.open && !el.contains(e.target as Node)) el.open = false; };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && el.open) { el.open = false; el.querySelector('summary')?.focus(); } };
    document.addEventListener('mousedown', onDoc);
    el.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); el.removeEventListener('keydown', onKey); };
  }, []);

  const toggle = (v: T, on: boolean) => onChange(on ? [...value, v] : value.filter((x) => x !== v));
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <details ref={ref} className="multiselect">
        <summary id={id} className={['field__control', size === 'sm' && 'field__control--sm', 'multiselect__summary'].filter(Boolean).join(' ')} aria-haspopup="listbox">
          <span className="truncate">{value.length === 0 ? allLabel : summary}</span>
          <ChevronDown size={14} aria-hidden />
        </summary>
        <div className="multiselect__menu" role="group" aria-label={typeof label === 'string' ? label : undefined}>
          <Checkbox label={allLabel} checked={value.length === 0} onChange={() => onChange([])} />
          {options.map((o) => (
            <Checkbox key={String(o.value)} label={o.label} checked={value.includes(o.value)} onChange={(e) => toggle(o.value, e.target.checked)} />
          ))}
        </div>
      </details>
    </div>
  );
}
