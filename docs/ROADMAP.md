# Roadmap

Ordered by what a team moving off Looker Studio tends to hit first.

Shipped since 0.1: AI chart suggestions with pluggable providers (Anthropic / OpenAI / Gemini / OpenAI-compatible), translated server errors, browser-language detection and a language registry, 19 Power BI-style visual types, dashboard-level filters (date range, time grain, value lists), RBAC roles with editable permissions and ABAC access policies with row-level security, multi-page reports (page tabs, `?page=` links, filters scoped to a page or the whole report), display names for fields and measures, calculated measures (formulas evaluated after GROUP BY, with totals computed by the source), "show as % of total / parent / column", the hierarchical matrix (row levels that open and close, column dimensions, subtotals from the source in one statement).

What a Power BI report still needs, in priority order, is in `docs/POWER-BI-GAPS.md` (F6–F15: conditional formatting, cascading and searchable filters, query cache, time comparisons, cross-filtering and drill, exports, shared-axis combo, top N, maps).

## 0.2 — share & consume
- Public / token share links and embed mode (`?embed=1`, no chrome).
- Auto-refresh interval per dashboard; "last refreshed" stamp.
- Drill-through: click a bar → table of underlying rows.

## 0.3 — scale
- Server-side query cache (keyed by SQL + params, TTL per data source).
- Pagination + column sorting for table visuals; CSV export of a visual.
- Query log page: slowest queries, errors, per-source volume.
- Folders / tags for dashboards; search.

## 0.4 — deliver
- Scheduled e-mail / Slack / Telegram delivery (PNG + PDF via headless Chromium).
- PDF / Excel export of a whole dashboard.
- Dashboard versions (history + restore).

## 0.5 — model
- Saved calculated fields (SQL expressions) on a dataset.
- Joins across datasets in the UI (visual query builder).

## Later
- PostgreSQL / MySQL / ClickHouse / SQLite engines.
- SSO for other identity providers (generic OIDC, LDAP); Microsoft Entra ID is in 0.1.
- Alerts on thresholds.
- Theme editor (brand palette) persisted per workspace.
