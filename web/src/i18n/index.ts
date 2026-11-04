import { create } from 'zustand';
import { vi } from './vi';
import { en } from './en';

export type Lang = 'vi' | 'en';
const dictionaries = { vi, en } as const;

function readStored(): Lang {
  try {
    const v = localStorage.getItem('rs.lang');
    if (v === 'vi' || v === 'en') return v;
  } catch { /* storage unavailable */ }
  return 'vi';
}

interface I18nState { lang: Lang; setLang: (l: Lang) => void }

export const useI18nStore = create<I18nState>((set) => ({
  lang: readStored(),
  setLang: (lang) => {
    try { localStorage.setItem('rs.lang', lang); } catch { /* ignore */ }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));

type Dict = typeof vi;
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type TKey = Leaves<Dict>;

function lookup(dict: Record<string, unknown>, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function translate(lang: Lang, key: TKey, params?: Record<string, string | number>): string {
  const raw = lookup(dictionaries[lang], key) ?? lookup(dictionaries.vi, key) ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

/** Hook: `const t = useT(); t('login.title')` */
export function useT() {
  const lang = useI18nStore((s) => s.lang);
  return (key: TKey, params?: Record<string, string | number>) => translate(lang, key, params);
}

export type TFn = ReturnType<typeof useT>;
