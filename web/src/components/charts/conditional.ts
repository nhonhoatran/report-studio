import type { CSSProperties } from 'react';
import type { ConditionalFormat, ConditionalRule, ConditionalColor } from '@/api/types';

/*
 * Conditional formatting of a numeric cell (tables and matrices): the first rule whose
 * condition the value meets gives its colour and icon; without a matching rule, a scale colours
 * the cell by where the value sits between the column's minimum and maximum. Colours are the
 * theme's own tokens, so they hold in both schemes; the icon reads without colour.
 */

/** The token behind each colour choice. */
export const CONDITIONAL_COLOR_VAR: Record<ConditionalColor, string> = {
  success: '--color-success', danger: '--color-danger', warning: '--color-warning', primary: '--color-primary', muted: '--color-text-muted',
};

export interface ColumnStats { min: number; max: number }

export interface CellFormat { className?: string; style?: CSSProperties; icon?: 'up' | 'down' }

function matches(rule: ConditionalRule, v: number): boolean {
  switch (rule.op) {
    case 'gte': return v >= rule.value;
    case 'gt': return v > rule.value;
    case 'lte': return v <= rule.value;
    case 'lt': return v < rule.value;
    case 'eq': return v === rule.value;
    case 'between': return v >= Math.min(rule.value, rule.value2 ?? rule.value) && v <= Math.max(rule.value, rule.value2 ?? rule.value);
  }
}

/** What a cell gets for its value: nothing, a rule's colour and icon, or a scale position. */
export function cellFormat(cf: ConditionalFormat | undefined, v: number | null, stats: ColumnStats | undefined): CellFormat | undefined {
  if (!cf || v === null) return undefined;
  const target = cf.apply === 'background' ? 'cf-bg' : 'cf-text';
  for (const rule of cf.rules ?? []) {
    if (!Number.isFinite(rule.value) || !matches(rule, v)) continue;
    return { className: target, style: { '--cf': `var(${CONDITIONAL_COLOR_VAR[rule.color]})` } as CSSProperties, icon: rule.icon };
  }
  if (cf.scale && stats && stats.max > stats.min) {
    const p = Math.round(((v - stats.min) / (stats.max - stats.min)) * 100);
    return { className: 'cf-scale', style: { '--cf-from': `var(${CONDITIONAL_COLOR_VAR[cf.scale.from]})`, '--cf-to': `var(${CONDITIONAL_COLOR_VAR[cf.scale.to]})`, '--cf-mix': `${p}%` } as CSSProperties };
  }
  return undefined;
}

/** The minimum and maximum of a column, for scales. */
export function columnStats(values: (number | null)[]): ColumnStats | undefined {
  let min = Infinity; let max = -Infinity;
  for (const v of values) if (v !== null) { if (v < min) min = v; if (v > max) max = v; }
  return min === Infinity ? undefined : { min, max };
}
