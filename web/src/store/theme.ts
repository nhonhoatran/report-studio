import { create } from 'zustand';
import { api } from '@/api/client';
import { translate, useI18nStore, type Lang } from '@/i18n';
import { toast } from '@/store/toast';

/*
 * The look of the app for the signed-in user. Every choice is a preset named in tokens.css;
 * this store writes the matching attributes on <html>, mirrors the choice in localStorage so
 * the first paint already has it, and saves it to the user's row on the server so it follows
 * them to every device.
 */
export type ThemePref = 'light' | 'dark' | 'system';
export const THEME_PREFS = ['light', 'dark', 'system'] as const;
export const ACCENTS = ['brass', 'sea', 'jade', 'violet', 'rose', 'moss'] as const;
export type Accent = (typeof ACCENTS)[number];
export const PALETTES = ['ledger', 'vivid', 'soft', 'ocean', 'sunset'] as const;
export type Palette = (typeof PALETTES)[number];
export const TEXT_SCALES = ['sm', 'md', 'lg'] as const;
export type TextScale = (typeof TEXT_SCALES)[number];
export const RADII = ['sharp', 'soft', 'round'] as const;
export type Radius = (typeof RADII)[number];

export interface Appearance { theme: ThemePref; accent: Accent; palette: Palette; text: TextScale; radius: Radius }
export const DEFAULT_APPEARANCE: Appearance = { theme: 'dark', accent: 'brass', palette: 'ledger', text: 'md', radius: 'soft' };

const STORAGE_KEY = 'rs.appearance';
const LEGACY_THEME_KEY = 'rs.theme'; // before 0.2 only the mode was stored, per browser
const SAVE_DELAY_MS = 400;

function pick<T extends string>(allowed: readonly T[], v: unknown, fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

/** Unknown or missing values fall back to `base`, so an old or foreign preference bag never breaks the page. */
export function normalizeAppearance(raw: unknown, base: Appearance = DEFAULT_APPEARANCE): Appearance {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    theme: pick(THEME_PREFS, o.theme, base.theme),
    accent: pick(ACCENTS, o.accent, base.accent),
    palette: pick(PALETTES, o.palette, base.palette),
    text: pick(TEXT_SCALES, o.text, base.text),
    radius: pick(RADII, o.radius, base.radius),
  };
}

export function isDefaultAppearance(a: Appearance): boolean {
  return (Object.keys(DEFAULT_APPEARANCE) as (keyof Appearance)[]).every((k) => a[k] === DEFAULT_APPEARANCE[k]);
}

function readStored(): Appearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeAppearance(JSON.parse(raw));
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (legacy) return normalizeAppearance({ theme: legacy });
  } catch { /* storage unavailable */ }
  return DEFAULT_APPEARANCE;
}

function writeStored(a: Appearance) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(a)); } catch { /* ignore */ }
}

function resolve(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The resolved mode is always written, so tokens.css needs one light block and no media query. */
function apply(a: Appearance) {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolve(a.theme));
  root.setAttribute('data-accent', a.accent);
  root.setAttribute('data-palette', a.palette);
  root.setAttribute('data-text', a.text);
  root.setAttribute('data-radius', a.radius);
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave(a: Appearance) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const lang = useI18nStore.getState().lang;
    api.auth.updatePreferences({ ...a, lang }).catch(() => {
      toast.error(translate(useI18nStore.getState().lang, 'settings.lookSaveFailed'));
    });
  }, SAVE_DELAY_MS);
}

interface ThemeState {
  appearance: Appearance;
  /** the mode as chosen; `resolved` is what is on screen right now */
  pref: ThemePref;
  resolved: 'light' | 'dark';
  /** bumps whenever the look is applied; charts re-read the tokens on it */
  stamp: number;
  setPref: (p: ThemePref) => void;
  /** change one or more choices (and optionally the language); applies at once, saves shortly after */
  update: (patch: Partial<Appearance> & { lang?: Lang }) => void;
  /** back to the project's default look; the language is left alone */
  reset: () => void;
  /** take the preferences the server returned at login / boot; an empty bag adopts this browser's look */
  hydrate: (prefs: Record<string, unknown> | undefined) => void;
}

export const useTheme = create<ThemeState>((set, get) => {
  const initial = readStored();
  apply(initial);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    const a = get().appearance;
    if (a.theme !== 'system') return;
    apply(a);
    set((s) => ({ resolved: resolve(a.theme), stamp: s.stamp + 1 }));
  });

  const commit = (a: Appearance, save: boolean) => {
    apply(a);
    writeStored(a);
    set((s) => ({ appearance: a, pref: a.theme, resolved: resolve(a.theme), stamp: s.stamp + 1 }));
    if (save) scheduleSave(a);
  };

  return {
    appearance: initial,
    pref: initial.theme,
    resolved: resolve(initial.theme),
    stamp: 0,
    setPref: (p) => get().update({ theme: p }),
    update: ({ lang, ...patch }) => {
      if (lang) useI18nStore.getState().setLang(lang);
      commit({ ...get().appearance, ...patch }, true);
    },
    reset: () => commit(DEFAULT_APPEARANCE, true),
    hydrate: (prefs) => {
      if (!prefs) return;
      if (Object.keys(prefs).length === 0) {
        // first sign-in since the look became per-user: keep what this browser shows and make it theirs
        scheduleSave(get().appearance);
        return;
      }
      if (prefs.lang === 'vi' || prefs.lang === 'en') useI18nStore.getState().setLang(prefs.lang);
      commit(normalizeAppearance(prefs), false);
    },
  };
});

/** Read a CSS custom property from :root at call time (follows the active look). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A px token as a number, for libraries that take numbers (grid, charts). */
export function cssPx(name: string, fallback: number): number {
  const n = Number.parseFloat(cssVar(name));
  return Number.isFinite(n) ? n : fallback;
}
