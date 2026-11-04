import type { NumberFormat } from '@/api/types';
import type { Lang } from '@/i18n';

const locales: Record<Lang, string> = { vi: 'vi-VN', en: 'en-US' };

export function formatNumber(value: unknown, format: NumberFormat = 'auto', lang: Lang = 'vi'): string {
  if (value === null || value === undefined || value === '') return '–';
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  const locale = locales[lang];
  switch (format) {
    case 'integer': return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
    case 'percent': return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(n);
    case 'currency': return new Intl.NumberFormat(locale, { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
    case 'compact': return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
    case 'auto':
    default:
      if (Math.abs(n) >= 1_000_000) return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
      return new Intl.NumberFormat(locale, { maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
  }
}

/** Axis labels: always compact so they fit. */
export function formatAxis(value: unknown, lang: Lang = 'vi'): string {
  const n = Number(value);
  if (Number.isNaN(n)) return String(value ?? '');
  return new Intl.NumberFormat(locales[lang], { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function formatCell(value: unknown, lang: Lang = 'vi'): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return formatNumber(value, 'auto', lang);
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  return String(value);
}

export function formatDateTime(iso: string, lang: Lang = 'vi'): string {
  const d = new Date(iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locales[lang], { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}
