import { create } from 'zustand';
import { vi } from './vi';
import { en } from './en';

/**
 * Language registry. Adding a language = one dictionary file + one entry here; the Settings
 * and Login switchers, number/date formatting and <html lang> all read from this list.
 */
export const LANGUAGES = [
  { code: 'vi', label: 'Tiếng Việt', locale: 'vi-VN' },
  { code: 'en', label: 'English', locale: 'en-US' },
] as const;
export type Lang = (typeof LANGUAGES)[number]['code'];
export const DEFAULT_LANG: Lang = 'vi';

/** Same keys as `vi`; any string may become plural forms where a language needs them. */
export type DeepStringify<T> = { [K in keyof T]: T[K] extends string ? string | PluralForms : DeepStringify<T[K]> };
export type Dictionary = DeepStringify<typeof vi>;

const dictionaries: Record<Lang, Dictionary> = { vi, en };
const STORAGE_KEY = 'rs.lang';

export const isLang = (v: unknown): v is Lang => LANGUAGES.some((l) => l.code === v);
export const localeOf = (lang: Lang): string => LANGUAGES.find((l) => l.code === lang)?.locale ?? lang;

/** Stored choice first, then the browser's preferred languages, then the default. */
export function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch { /* storage unavailable */ }
  const preferred = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  for (const tag of preferred) {
    const base = String(tag ?? '').toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return DEFAULT_LANG;
}

interface I18nState { lang: Lang; setLang: (l: Lang) => void }

export const useI18nStore = create<I18nState>((set) => ({
  lang: detectLang(),
  setLang: (lang) => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));

/** A string with plural forms, chosen by `Intl.PluralRules` from the `count` parameter. */
export interface PluralForms { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string }

/** Only an object whose keys are all plural categories is a plural leaf (so `kinds.other` stays a nested key). */
type IsPluralForms<T> = T extends PluralForms ? (Exclude<keyof T, keyof PluralForms> extends never ? true : false) : false;
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : IsPluralForms<T[K]> extends true ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type TKey = Leaves<typeof vi>;
export type TParams = Record<string, string | number>;

function lookup(dict: Record<string, unknown>, key: string): string | PluralForms | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  if (typeof cur === 'string') return cur;
  if (isPluralForms(cur)) return cur;
  return undefined;
}

const PLURAL_CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
function isPluralForms(v: unknown): v is PluralForms {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.other === 'string' && Object.keys(o).every((k) => PLURAL_CATEGORIES.has(k) && typeof o[k] === 'string');
}

const pluralRules = new Map<Lang, Intl.PluralRules>();
function pickForm(lang: Lang, forms: PluralForms, count: number): string {
  let rules = pluralRules.get(lang);
  if (!rules) { rules = new Intl.PluralRules(localeOf(lang)); pluralRules.set(lang, rules); }
  const category = rules.select(count) as keyof PluralForms;
  return forms[category] ?? forms.other;
}

/** Does any dictionary know this key? Used for keys built at runtime (server error codes). */
export function hasTranslation(key: string): key is TKey {
  return lookup(dictionaries[DEFAULT_LANG], key) !== undefined;
}

export function translate(lang: Lang, key: TKey, params?: TParams): string {
  const entry = lookup(dictionaries[lang], key) ?? lookup(dictionaries[DEFAULT_LANG], key) ?? key;
  const raw = typeof entry === 'string' ? entry : pickForm(lang, entry, Number(params?.count ?? 0));
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

/** Hook: `const t = useT(); t('login.title')` */
export function useT() {
  const lang = useI18nStore((s) => s.lang);
  return (key: TKey, params?: TParams) => translate(lang, key, params);
}

export type TFn = ReturnType<typeof useT>;
