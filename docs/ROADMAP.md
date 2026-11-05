# Roadmap

Ordered by what a team moving off Looker Studio tends to hit first.

Shipped since 0.1: AI chart suggestions with pluggable providers (Anthropic / OpenAI / Gemini / OpenAI-compatible), translated server errors, browser-language detection and a language registry, 19 Power BI-style visual types, dashboard-level filters (date range, time grain, value lists), RBAC roles with editable permissions and ABAC access policies with row-level security, multi-page reports (page tabs, `?page=` links, filters scoped to a page or the whole report), display names for fields and measures, calculated measures (formulas evaluated after GROUP BY, with totals computed by the source), "show as % of total / parent / column", the hierarchical matrix (row levels that open and close, column dimensions, subtotals from the source in one statement).

Also shipped from `docs/POWER-BI-GAPS.md` (F6–F15): conditional formatting, cascading and searchable list filters, a server result cache with per-source TTL, comparisons with the previous period / the same period last year and running totals, cross-filtering by click and drill-through to the rows, CSV / Excel export and print to PDF, paged tables, a shared-axis combo, Top N with "others", and a filled map of Vietnam's 34 provinces on self-hosted boundaries. What remains from the gap list: loading a matrix's child levels on demand, year-to-date beyond the filtered range, and a server-rendered PDF.

## 0.2 — share & consume
- Public / token share links and embed mode (`?embed=1`, no chrome).
- Auto-refresh interval per dashboard; "last refreshed" stamp.
- (shipped) Drill-through: click a bar → table of underlying rows.

## 0.3 — scale
- (shipped) Server-side query cache, pagination + sorting, CSV export.
- Query log page: slowest queries, errors, per-source volume.
- Folders / tags for dashboards; search.

## 0.4 — deliver
- Scheduled e-mail / Slack / Telegram delivery (PNG + PDF via headless Chromium).
- Server-rendered PDF of a whole dashboard (today: the browser's print dialog; Excel of a visual is shipped).
- Dashboard versions (history + restore).

## 0.5 — model
- Saved calculated fields (SQL expressions) on a dataset.
- Joins across datasets in the UI (visual query builder).

## Later
- PostgreSQL / MySQL / ClickHouse / SQLite engines.
- SSO for other identity providers (generic OIDC, LDAP); Microsoft Entra ID is in 0.1.
- Alerts on thresholds.
- Theme editor (brand palette) persisted per workspace.
