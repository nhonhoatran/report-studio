import type { ReactNode } from 'react';

export interface SegmentedOption<T extends string> { value: T; label: ReactNode; icon?: ReactNode; title?: string }

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: SegmentedOption<T>[]; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" className="segmented__item" aria-pressed={o.value === value} title={o.title} onClick={() => onChange(o.value)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}
