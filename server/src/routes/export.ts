import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { requireAuth, requirePermission } from '../auth/middleware.js';
import { config } from '../config.js';
import { parse } from '../lib/validate.js';
import { queryRequestSchema } from '../query/types.js';
import { executeQuery } from './query.js';

/*
 * Exports one visual's rows as the reader sees them: the same request as the query route (the
 * dashboard's filters, the user's row filters, Top N, comparisons), with the row limit raised to
 * EXPORT_MAX_ROWS and no paging. Numbers stay numbers in Excel; the CSV carries a BOM so Excel
 * reads its UTF-8. Column headers are the display names the client sends.
 */
export const exportRouter = Router();
exportRouter.use(requireAuth);

const exportSchema = queryRequestSchema.extend({
  format: z.enum(['csv', 'xlsx']),
  headers: z.record(z.string().max(200)).optional(),
  filename: z.string().max(120).optional(),
});

const asCell = (v: unknown): string | number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v);
  // a numeric text (DECIMAL columns arrive as text) is a number for the sheet
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s;
};
const csvEscape = (v: string | number | null): string => {
  if (v === null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const safeName = (name: string | undefined, ext: string) => `${(name ?? 'export').replace(/[^\p{L}\p{N} _.-]/gu, '').trim() || 'export'}.${ext}`;

exportRouter.post('/', requirePermission('dashboards.view', 'dashboards.edit', 'datasets.manage'), async (req, res) => {
  const { format, headers, filename, ...query } = parse(exportSchema, req.body);
  const result = await executeQuery({ ...query, limit: config.query.exportMaxRows, offset: undefined, totals: undefined, subtotals: undefined, fresh: true }, req.user!);
  const columns = result.columns.length ? result.columns : Object.keys(result.rows[0] ?? {}).map((k) => ({ alias: k, role: 'column' as const }));
  const title = (alias: string) => headers?.[alias] ?? alias;
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName(filename, 'csv'))}"`);
    const lines = [columns.map((c) => csvEscape(title(c.alias))).join(',')];
    for (const r of result.rows) lines.push(columns.map((c) => csvEscape(asCell(r[c.alias]))).join(','));
    res.send(`﻿${lines.join('\r\n')}\r\n`);
    return;
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet((filename ?? 'Data').slice(0, 31) || 'Data');
  sheet.columns = columns.map((c) => ({ header: title(c.alias), key: c.alias, width: Math.min(40, Math.max(12, title(c.alias).length + 2)) }));
  sheet.getRow(1).font = { bold: true };
  for (const r of result.rows) sheet.addRow(Object.fromEntries(columns.map((c) => [c.alias, asCell(r[c.alias])])));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName(filename, 'xlsx'))}"`);
  await workbook.xlsx.write(res);
  res.end();
});
