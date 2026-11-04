# Roadmap

Ordered by what a team moving off Looker Studio tends to hit first.

Shipped since 0.1: AI chart suggestions with pluggable providers (Anthropic / OpenAI / Gemini / OpenAI-compatible), translated server errors, browser-language detection and a language registry.

## 0.2 — share & consume
- Dashboard-level filters (date range, dropdown) applied to every visual.
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
- Row-level security: per-user filter templates on a data source.

## Later
- PostgreSQL / MySQL / ClickHouse / SQLite engines.
- SSO (OIDC / LDAP).
- Alerts on thresholds.
- Theme editor (brand palette) persisted per workspace.
