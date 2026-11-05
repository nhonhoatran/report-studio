import { echarts } from './echarts';

/*
 * Self-hosted boundary maps (web/public/maps): a registry listing them, a loader that registers a
 * map with ECharts once, and the matching of a data value ("Tỉnh Hà Nội", "HA NOI", "Hanoi") to a
 * feature's name, with the author's own aliases on top.
 */

export interface MapInfo { id: string; label: string; nameProperty: string; properties: string[] }
interface Feature { properties?: Record<string, unknown> }
interface FeatureCollection { features: Feature[] }

export const DEFAULT_MAP = 'vietnam-provinces';

let registry: Promise<MapInfo[]> | undefined;
/** The maps on offer, read once. */
export function listMaps(): Promise<MapInfo[]> {
  registry ??= fetch('/maps/index.json').then((r) => (r.ok ? (r.json() as Promise<MapInfo[]>) : [])).catch(() => []);
  return registry;
}

const loaded = new Map<string, Promise<FeatureCollection>>();
/** Loads one map and registers it with ECharts under its id; later calls share the same promise. */
export function loadMap(id: string): Promise<FeatureCollection> {
  let p = loaded.get(id);
  if (!p) {
    p = fetch(`/maps/${encodeURIComponent(id)}.json`).then(async (r) => {
      if (!r.ok) throw new Error(`map ${id}: ${r.status}`);
      const geo = (await r.json()) as FeatureCollection;
      echarts.registerMap(id, geo as unknown as Parameters<typeof echarts.registerMap>[1]);
      return geo;
    });
    loaded.set(id, p);
    p.catch(() => loaded.delete(id));
  }
  return p;
}

const PREFIXES = ['thanh pho', 'tinh', 'tp', 'city', 'province', 'thanhpho'];
/** "Tỉnh Hà Nội" → "hanoi": no case, no accents, no administrative prefix, no punctuation. */
export function normalizeRegion(s: string): string {
  let out = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
  out = out.replace(/[.]/g, ' ').replace(/\s+/g, ' ');
  for (const p of PREFIXES) if (out.startsWith(`${p} `)) { out = out.slice(p.length + 1); break; }
  return out.replace(/[^a-z0-9]/g, '');
}

/** The author's "data name = map name" lines. */
export function parseAliases(text: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of (text ?? '').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const from = normalizeRegion(line.slice(0, i)); const to = line.slice(i + 1).trim();
    if (from && to) out.set(from, to);
  }
  return out;
}

export interface Matched { data: { name: string; value: number | null }[]; unmatched: string[] }

/** Each data value's feature name (by any matchable property, then by alias), and the values no feature answers to. */
export function matchRegions(geo: FeatureCollection, nameProperty: string, properties: string[], rows: { name: string; value: number | null }[], aliasText: string | undefined): Matched {
  const byKey = new Map<string, string>();
  for (const f of geo.features) {
    const name = f.properties?.[nameProperty];
    if (typeof name !== 'string') continue;
    for (const p of [nameProperty, ...properties]) {
      const v = f.properties?.[p];
      if (typeof v === 'string' || typeof v === 'number') byKey.set(normalizeRegion(String(v)), name);
    }
  }
  const aliases = parseAliases(aliasText);
  const data: Matched['data'] = []; const unmatched: string[] = [];
  for (const r of rows) {
    const key = normalizeRegion(r.name);
    const alias = aliases.get(key);
    const target = (alias && (byKey.get(normalizeRegion(alias)) ?? alias)) || byKey.get(key);
    if (target) data.push({ name: target, value: r.value }); else unmatched.push(r.name);
  }
  return { data, unmatched };
}
