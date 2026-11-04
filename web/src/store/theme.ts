import { create } from 'zustand';

export type ThemePref = 'light' | 'dark' | 'system';

function readStored(): ThemePref {
  try {
    const v = localStorage.getItem('rs.theme');
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* ignore */ }
  return 'system';
}

function apply(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

function resolve(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface ThemeState { pref: ThemePref; resolved: 'light' | 'dark'; setPref: (p: ThemePref) => void }

export const useTheme = create<ThemeState>((set) => {
  const pref = readStored();
  apply(pref);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    set((s) => ({ resolved: resolve(s.pref) }));
  });
  return {
    pref,
    resolved: resolve(pref),
    setPref: (p) => {
      try { localStorage.setItem('rs.theme', p); } catch { /* ignore */ }
      apply(p);
      set({ pref: p, resolved: resolve(p) });
    },
  };
});

/** Read a CSS custom property from :root at call time (follows the active theme). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A px token as a number, for libraries that take numbers (grid, charts). */
export function cssPx(name: string, fallback: number): number {
  const n = Number.parseFloat(cssVar(name));
  return Number.isFinite(n) ? n : fallback;
}
