import type { QueryResult, Widget } from '@/api/types';
import { matrixSplit, measureAlias } from '@/lib/widget';
import { dimensionAliases, measureAliases, num, str, type Row } from './shape';

/*
 * The hierarchical matrix: the leading dimensions are row levels (a tree), the trailing ones go
 * across the columns. The server grouped by every dimension (the leaves) and, in the same
 * statement, computed each parent level's values per column and the totals (`result.subtotals`),
 * so opening and closing a level never asks the server for anything.
 */

export interface MatrixNode {
  /** the row values from the first level down to this one, as a JSON array: the node's identity */
  key: string;
  path: string[];
  label: string;
  /** 1 for the first level */
  level: number;
  children: MatrixNode[];
  /** the measures at each column, by the column tuple's JSON key */
  cells: Map<string, Row>;
  /** the measures across every column (the totals column), when totals were asked for */
  rowTotal?: Row;
}

export interface MatrixTree {
  rowLevels: number;
  colLevels: number;
  /** the column tuples in display order, grouped level by level in order of first appearance */
  colKeys: string[][];
  roots: MatrixNode[];
  measures: string[];
  colTotals: Map<string, Row>;
  grand?: Row;
}

export const colKeyOf = (tuple: string[]): string => JSON.stringify(tuple);

/** Builds the tree; `sort` orders siblings by the first measure (the widget's sort option), otherwise by first appearance. */
export function buildMatrix(result: QueryResult, widget: Widget): MatrixTree {
  const dims = dimensionAliases(result);
  const measures = measureAliases(result);
  const rowLevels = Math.max(1, Math.min(matrixSplit(widget).rows.length, dims.length));
  const rowDims = dims.slice(0, rowLevels);
  const colDims = dims.slice(rowLevels);
  const colIdx = colDims.map((_, j) => rowLevels + j);
  const sub = result.subtotals ?? {};
  const lookup = (idx: number[], values: string[]): Row | undefined => sub[idx.join(',')]?.[JSON.stringify(values)];

  // columns: each level in order of first appearance, tuples grouped under their parents
  const seen = colDims.map(() => new Map<string, number>());
  const tuples = new Map<string, string[]>();
  for (const r of result.rows) {
    const tuple = colDims.map((d) => str(r[d]));
    tuple.forEach((v, j) => { if (!seen[j]!.has(v)) seen[j]!.set(v, seen[j]!.size); });
    const k = colKeyOf(tuple);
    if (!tuples.has(k)) tuples.set(k, tuple);
  }
  const colKeys = Array.from(tuples.values()).sort((a, b) => {
    for (let j = 0; j < a.length; j++) { const d = seen[j]!.get(a[j]!)! - seen[j]!.get(b[j]!)!; if (d) return d; }
    return 0;
  });
  if (colKeys.length === 0) colKeys.push([]);

  // rows: a tree by first appearance; the leaves carry the rows, the parents their level's subtotals
  const roots: MatrixNode[] = [];
  const byKey = new Map<string, MatrixNode>();
  const levelIdx = (k: number) => Array.from({ length: k }, (_, i) => i);
  for (const r of result.rows) {
    const path = rowDims.map((d) => str(r[d]));
    let siblings = roots;
    for (let k = 1; k <= rowLevels; k++) {
      const key = JSON.stringify(path.slice(0, k));
      let node = byKey.get(key);
      if (!node) {
        node = { key, path: path.slice(0, k), label: path[k - 1]!, level: k, children: [], cells: new Map() };
        byKey.set(key, node);
        siblings.push(node);
        if (k < rowLevels) {
          for (const tuple of colKeys) {
            const cell = lookup([...levelIdx(k), ...colIdx], [...node.path, ...tuple]);
            if (cell) node.cells.set(colKeyOf(tuple), cell);
          }
        }
        node.rowTotal = lookup(levelIdx(k), node.path);
      }
      if (k === rowLevels) node.cells.set(colKeyOf(colDims.map((d) => str(r[d]))), r);
      siblings = node.children;
    }
  }

  const colTotals = new Map<string, Row>();
  for (const tuple of colKeys) { const t = lookup(colIdx, tuple); if (t) colTotals.set(colKeyOf(tuple), t); }
  const tree: MatrixTree = { rowLevels, colLevels: colDims.length, colKeys, roots, measures, colTotals, grand: lookup([], []) };

  const sortBy = widget.options.sortBy;
  const first = widget.query.measures[0];
  if (sortBy && sortBy !== 'none' && first) sortSiblings(tree, measureAlias(first), sortBy === 'measure_desc' ? -1 : 1);
  return tree;
}

/** A node's value for one measure across its columns: the totals column when there is one, else what its columns add up to. */
export function nodeValue(node: MatrixNode, alias: string): number | null {
  if (node.rowTotal) return num(node.rowTotal[alias]);
  let total: number | null = null;
  for (const cell of node.cells.values()) { const v = num(cell[alias]); if (v !== null) total = (total ?? 0) + v; }
  return total;
}

function sortSiblings(tree: MatrixTree, alias: string, sign: 1 | -1): void {
  const sort = (nodes: MatrixNode[]) => {
    nodes.sort((a, b) => ((nodeValue(a, alias) ?? -Infinity) - (nodeValue(b, alias) ?? -Infinity)) * sign);
    for (const n of nodes) sort(n.children);
  };
  sort(tree.roots);
}

/** The nodes open at first: every level above `expandLevel` (1 = the first level alone, closed). */
export function defaultExpanded(tree: MatrixTree, expandLevel: number): Set<string> {
  const out = new Set<string>();
  const walk = (nodes: MatrixNode[]) => { for (const n of nodes) { if (n.children.length && n.level < expandLevel) { out.add(n.key); walk(n.children); } } };
  walk(tree.roots);
  return out;
}

/** Every node that has children, for "expand all". */
export function allParents(tree: MatrixTree): Set<string> {
  const out = new Set<string>();
  const walk = (nodes: MatrixNode[]) => { for (const n of nodes) { if (n.children.length) { out.add(n.key); walk(n.children); } } };
  walk(tree.roots);
  return out;
}

/** The rows on screen, top to bottom: a node, then its children while it is open. */
export function visibleNodes(tree: MatrixTree, expanded: Set<string>): MatrixNode[] {
  const out: MatrixNode[] = [];
  const walk = (nodes: MatrixNode[]) => { for (const n of nodes) { out.push(n); if (n.children.length && expanded.has(n.key)) walk(n.children); } };
  walk(tree.roots);
  return out;
}

/** The header cells of one column level: consecutive tuples that share the levels above are one group. */
export function columnGroups(colKeys: string[][], level: number): { label: string; span: number }[] {
  const out: { label: string; span: number }[] = [];
  let prefix: string | null = null;
  for (const tuple of colKeys) {
    const key = JSON.stringify(tuple.slice(0, level + 1));
    if (key === prefix) out[out.length - 1]!.span++;
    else { out.push({ label: tuple[level] ?? '', span: 1 }); prefix = key; }
  }
  return out;
}
