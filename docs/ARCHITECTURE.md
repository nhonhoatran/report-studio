# Architecture

Report Studio is a two-package npm workspace that ships as one container.

```
┌────────────────────────┐      HTTP /api/*       ┌──────────────────────────┐
│ web (React 18 + Vite)  │ ─────────────────────▶ │ server (Express 4, TS)   │
│  • dashboard editor    │ ◀──────── static ────── │  • auth (JWT cookie)     │
│  • react-grid-layout   │                         │  • datasources/datasets  │
│  • dnd-kit             │                         │  • dashboards (JSON)     │
│  • ECharts             │                         │  • query engine          │
└────────────────────────┘                         └──────────┬───────────────┘
                                                              │ mysql2 pools
                                     ┌────────────────────────┼────────────────────────┐
                                     ▼                        ▼                        ▼
                             MariaDB (metadata)      MariaDB (source A)        MariaDB (source B) …
                             report_studio           read-only account         read-only account
```

## Server (`server/`)

| Module | Responsibility |
|---|---|
| `config.ts` | env parsing with safe defaults; refuses to boot in production without `APP_SECRET` / `ADMIN_PASSWORD`, with a half-configured `ENTRA_*` block, or with password login off and no Entra |
| `db/metadata.ts`, `db/migrations.ts` | pool to the metadata DB, ordered migrations recorded in `schema_migrations`, first-admin seed |
| `auth/` | bcrypt passwords, HS256 JWT in an `httpOnly` cookie (`rs_session`), `requireAuth` / `requireRole`; `users.ts` is the account row → API shape |
| `auth/entra.ts`, `auth/entraMapping.ts`, `auth/entraUsers.ts`, `routes/entra.ts` | Microsoft Entra ID sign-in: OIDC discovery (cached 24 h), authorization-code flow with PKCE, ID-token verification through the tenant's JWKS (`jose`), claim → account mapping (domain allow-list, app roles / groups → role), find-link-or-provision against `users` (`auth_provider`, `external_id`). The pending attempt (state, nonce, verifier, destination) lives in an AES-GCM encrypted `rs_entra` cookie, so there is no server-side session store |
| `routes/datasources.ts` | CRUD, connection test, table & column introspection (`information_schema`) |
| `routes/datasets.ts` | saved SQL datasets; SQL validated by `sqlGuard` and described with `SELECT … LIMIT 0` |
| `routes/dashboards.ts` | dashboard documents (name + JSON `definition`), duplicate |
| `routes/query.ts` | runs one visual's semantic query; `/explain` shows the generated SQL |
| `query/builder.ts` | semantic query → SQL: quoted identifiers, `?` params, GROUP BY positions, date buckets, LIMIT cap |
| `query/sqlGuard.ts` | strips comments/literals, allows a single `SELECT`/`WITH`, rejects write/lock/`INTO` keywords |
| `query/executor.ts` | per-datasource pool cache (invalidated on edit), `READ ONLY` + `max_statement_time` on each connection, error translation |
| `query/introspect.ts` | table list, column kinds (number/date/string/boolean), field types from result packets |

Async route handlers are wrapped so a thrown `HttpError` becomes a JSON error (`{ error, details }`).

### Semantic query model

```jsonc
{
  "datasourceId": 1,
  "source": { "type": "table", "table": "v_sales" },      // or { "type": "dataset", "datasetId": 3 }
  "dimensions": [{ "field": "order_date", "bucket": "month" }, { "field": "region" }],
  "measures": [{ "field": "revenue", "agg": "sum" }],
  "filters": [{ "field": "status", "op": "in", "values": ["paid", "shipped"] }],
  "orderBy": [{ "alias": "sum_revenue", "direction": "desc" }],
  "limit": 1000
}
```

becomes

```sql
SELECT DATE_FORMAT(`order_date`, '%Y-%m') AS `order_date_month`, `region` AS `region`, SUM(`revenue`) AS `sum_revenue`
FROM `v_sales`
WHERE `status` IN (?, ?)
GROUP BY 1, 2
ORDER BY `sum_revenue` DESC
LIMIT 1001          -- one extra row to detect truncation
```

A dataset source is wrapped as `FROM (<dataset sql>) AS __rs_src`.

### Dashboard document

Stored as JSON in `dashboards.definition` and owned by the web client:

```ts
{ version: 1, widgets: Widget[], filters: [], settings: {} }
Widget = { id, type, title, layout: {x,y,w,h}, datasourceId, source, query: {dimensions, measures, filters, orderBy, limit}, options }
```

The server validates shape and size only, so new widget options never need a migration.

## Web (`web/`)

| Area | Notes |
|---|---|
| `styles/tokens.css` | the only place for colours, spacing (4px base), radii, type sizes, chart palette. Dark is the primary theme ("Sổ cái": blue-black surfaces, ivory text, brass accent); light is derived. Fonts are self-hosted via `@fontsource-variable` (Archivo with its width axis for condensed labels, JetBrains Mono for data) |
| `components/ui/` | Button, Field (Input/Select/Textarea/Checkbox), Panel, Modal (`<dialog>`), Toolbar, Feedback (Spinner/ErrorBox/EmptyState/Toasts), Segmented, KindBadge |
| `components/editor/` | `FieldsPane` (draggable fields), `Canvas` (react-grid-layout, droppable widgets, 1 column under 640px), `VisualPane` (chart type, wells, filters, options), `WidgetChart` (react-query + states) |
| `components/charts/ChartRenderer.tsx` | ECharts option builder for cartesian + pie, plus KPI card and table |
| `store/editor.ts` | zustand store: definition, selection, dirty flag, drop logic (`autoPlace`: numbers → measures) |
| `i18n/` | `vi` (default) and `en` dictionaries; `useT()` is typed over the dictionary keys |
| `api/client.ts` | fetch wrapper; a 401 anywhere clears the session; `auth.providers()` tells the login page which methods to show, `auth.entraLoginUrl()` is the full-page link that starts SSO |

Drag and drop: dnd-kit for *field → widget / well* (`DndContext` in `DashboardEditorPage`); react-grid-layout for *widget move / resize*. They do not conflict because grid dragging only starts on `.widget__header`.

## Security model

1. The data-source account should be `SELECT`-only (enforced by the DBA, not the app).
2. `sqlGuard` only lets a single `SELECT` through for datasets and ad-hoc SQL.
3. Each physical connection runs `SET SESSION TRANSACTION READ ONLY` and `SET SESSION max_statement_time`.
4. Every generated statement carries `LIMIT ≤ QUERY_MAX_ROWS`; the client timeout also kills long queries.
5. Data-source passwords are AES-256-GCM encrypted with a key derived from `APP_SECRET`.
6. Viewers can run saved dashboards but cannot send ad-hoc SQL; editors manage sources, datasets and dashboards; admins manage users.
7. Entra sign-in trusts only an ID token that verifies against the tenant's published keys, carries this app as audience, the expected issuer for its tenant and the nonce of the current attempt; `returnTo` is restricted to same-origin paths. Accounts provisioned from Entra have `password_hash = NULL`, so the password form cannot be used against them.

## Adding a new chart type

1. Add the type to `WidgetType` / `WIDGET_TYPES` in `web/src/api/types.ts` and a label in both dictionaries (`chart.<type>`).
2. Decide its wells in `lib/widget.ts` (`maxDimensions`, `maxMeasures`).
3. Render it in `ChartRenderer.tsx`.
4. Pick an icon in `VisualPane.tsx` (`typeIcons`).

## Adding another database engine

`query/executor.ts` and `query/introspect.ts` are the only MariaDB-specific files (plus `DATE_FORMAT` in `builder.ts`). A new engine means: a driver, an introspection query, a dialect for identifier quoting and date buckets, and `datasources.type`.
