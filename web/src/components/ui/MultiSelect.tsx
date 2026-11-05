import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Checkbox, Input } from './Field';

export interface MultiSelectOption<T extends string | number> { value: T; label: ReactNode }

/**
 * Several values from a list (or one, with `single`), behind one control the size of a Select: a
 * native <details> (keyboard, Escape and focus come from the platform) whose menu is a column of
 * the project's Checkboxes, optionally under a search box and over a footer (more results, a
 * note). An empty selection means "all", which is the first row.
 */
export function MultiSelect<T extends string | number>({ label, value, options, onChange, allLabel, summary, size, id: givenId, single, search, footer, help }: {
  label: ReactNode; value: T[]; options: MultiSelectOption<T>[]; onChange: (v: T[]) => void;
  allLabel: ReactNode; /** the text shown while something is selected, e.g. "3 selected" */ summary: ReactNode; size?: 'sm' | 'md'; id?: string;
  /** one value at a time: a choice replaces the selection */ single?: boolean;
  /** a search box above the choices, filled by the caller (the choices come filtered) */ search?: { value: string; onChange: (v: string) => void; placeholder: string };
  footer?: ReactNode; help?: ReactNode;
}) {
  const auto = useId(); const id = givenId ?? auto;
  const labelId = `${id}-label`;
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

  const toggle = (v: T, on: boolean) => onChange(single ? (on ? [v] : []) : on ? [...value, v] : value.filter((x) => x !== v));
  const selectedLabel = single && value.length === 1 ? options.find((o) => o.value === value[0])?.label ?? String(value[0]) : summary;
  return (
    <div className="field">
      {/* a <summary> cannot be the target of a <label>, so the label names it through aria-labelledby */}
      <span className="field__label" id={labelId}>{label}</span>
      <details ref={ref} className="multiselect">
        <summary id={id} className={['field__control', size === 'sm' && 'field__control--sm', 'multiselect__summary'].filter(Boolean).join(' ')} aria-labelledby={labelId}>
          <span className="truncate">{value.length === 0 ? allLabel : selectedLabel}</span>
          <ChevronDown size={14} aria-hidden />
        </summary>
        <div className="multiselect__menu" role="group" aria-labelledby={labelId}>
          {search && <Input size="sm" type="search" aria-label={search.placeholder} placeholder={search.placeholder} value={search.value} onChange={(e) => search.onChange(e.target.value)} />}
          <Checkbox type={single ? 'radio' : 'checkbox'} name={single ? id : undefined} label={allLabel} checked={value.length === 0} onChange={() => onChange([])} />
          {options.map((o) => (
            <Checkbox key={String(o.value)} type={single ? 'radio' : 'checkbox'} name={single ? id : undefined} label={o.label} checked={value.includes(o.value)} onChange={(e) => toggle(o.value, e.target.checked)} />
          ))}
          {footer}
        </div>
      </details>
      {help && <div className="field__help">{help}</div>}
    </div>
  );
}
