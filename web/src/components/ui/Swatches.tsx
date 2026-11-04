import type { ReactNode } from 'react';

export interface SwatchOption<T extends string> { value: T; label: ReactNode }

const BAR_COUNT = 8; // one bar per --chart-n token

/**
 * A choice among colour presets: the same group shape as Segmented (aria-pressed buttons).
 * Each button carries the preset's own attribute (data-accent / data-palette), so its dot or
 * strip renders through the tokens that preset defines in tokens.css — no colour is named here.
 */
export function Swatches<T extends string>({ kind, value, options, onChange, ariaLabel }: {
  kind: 'accent' | 'palette'; value: T; options: SwatchOption<T>[]; onChange: (v: T) => void; ariaLabel: string;
}) {
  return (
    <div className="swatches" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" className="swatch" aria-pressed={o.value === value} onClick={() => onChange(o.value)} {...{ [`data-${kind}`]: o.value }}>
          {kind === 'accent'
            ? <span className="swatch__dot" aria-hidden />
            : <span className="swatch__bars" aria-hidden>{Array.from({ length: BAR_COUNT }, (_, i) => <span key={i} />)}</span>}
          {o.label}
        </button>
      ))}
    </div>
  );
}
