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
| `auth/` | bcrypt passwords, HS256 JWT in an `httpOnly` cookie (`rs_session`); `middleware.ts` resolves the signed-in user on every request (role, permissions and attributes from the database through a 15 s cache, so an admin's change applies without a new login) and offers `requireAuth`, `requirePermission(...)`, `authorize()` / `allowed()` (ABAC decision) and `rowFilters()`; `users.ts` is the account row → API shape; `preferences.ts` validates the per-user UI bag stored in `user_preferences` (flat scalars, ≤ 4 KB, client-owned like a dashboard definition) |
| `auth/permissions.ts`, `auth/roles.ts`, `routes/roles.ts` | RBAC: the permission catalogue (`dashboards.view/edit/filters`, `datasources.view/manage`, `datasets.manage`, `ai.suggest/manage`, `users/roles/policies.manage`), the `roles` table (three built-in rows seeded; admin always holds everything), admin CRUD of roles |
| `auth/abac.ts`, `auth/policies.ts`, `routes/policies.ts` | ABAC (the admin role is outside it: never denied, never row-filtered): `access_policies` rows (subject = roles and/or attribute values; resource = dashboards or data sources, all or by id; actions; allow/deny; optional row filters). `decide()` = deny overrides → an allow policy that lists a resource by id closes it to everybody else → otherwise RBAC stands. `rowFiltersFor()` turns `{ field, attribute }` into `field IN (user's attribute values)` and `routes/query.ts` appends them to every query on that source |
| `auth/entra.ts`, `auth/entraMapping.ts`, `auth/entraUsers.ts`, `routes/entra.ts` | Microsoft Entra ID sign-in: OIDC discovery (cached 24 h), authorization-code flow with PKCE, ID-token verification through the tenant's JWKS (`jose`), claim → account mapping (domain allow-list, app roles / groups → role), find-link-or-provision against `users` (`auth_provider`, `external_id`). The pending attempt (state, nonce, verifier, destination) lives in an AES-GCM encrypted `rs_entra` cookie, so there is no server-side session store |
| `routes/datasources.ts` | CRUD, connection test, table & column introspection (`information_schema`) |
| `routes/datasets.ts` | saved SQL datasets; SQL validated by `sqlGuard` and described with `SELECT … LIMIT 0` |
| `routes/dashboards.ts` | dashboard documents (name + JSON `definition`), duplicate |
| `routes/preferences.ts` | the signed-in user's own UI bag: `GET`, and `PUT` as an upsert into `user_preferences` |
| `routes/query.ts` | runs one visual's semantic query; `/explain` shows the generated SQL |
| `query/builder.ts` | semantic query → SQL: quoted identifiers, `?` params, GROUP BY positions, date buckets, LIMIT cap |
| `query/sqlGuard.ts` | strips comments/literals, allows a single `SELECT`/`WITH`, rejects write/lock/`INTO` keywords |
| `query/executor.ts` | per-datasource pool cache (invalidated on edit), `READ ONLY` + `max_statement_time` on each connection, error translation |
| `query/introspect.ts` | table list, column kinds (number/date/string/boolean), field types from result packets |
| `routes/ai.ts` | AI providers (admin CRUD + key test) and `POST /ai/suggest`; keys stored AES-256-GCM encrypted, never returned |
| `ai/providers.ts` | one adapter per key kind: Anthropic (official SDK, structured output), OpenAI and OpenAI-compatible servers (chat completions), Google Gemini (`generateContent`) |
| `ai/suggest.ts` | prompt builder, tolerant JSON parser and the validator that keeps only fields, aggregations, buckets and chart shapes the editor can run |
| `lib/errors.ts` | `HttpError` with a stable `code` (`ErrorCode`); the client translates codes, `message` is the English fallback |

Async route handlers are wrapped so a thrown `HttpError` becomes a JSON error (`{ error, code?, details? }`). `code` is one of `ErrorCode` in `lib/errors.ts`; the web client looks up `errors.<code>` in its dictionaries and uses scalar `details` as template parameters (`{keyword}`, `{seconds}`), so server-side failures read in the user's language.

### AI suggestions

`POST /api/ai/suggest` sends the model a description of the selected dataset (field names and kinds), the house rules of the semantic query model and the user's request, and asks for JSON. The answer is parsed leniently (code fences, preambles) and then **validated against the real field list**: unknown fields are dropped, `sum`/`avg` on non-numeric fields become `count`, date dimensions get a bucket, wells are trimmed to what the chart type reads, duplicates and unrunnable visuals are removed. The client turns each surviving suggestion into an ordinary widget, so the AI never has more power than a user dragging fields. The model never sees data rows and never produces SQL.

Providers are rows in `ai_providers` (`kind`, `model`, `base_url`, encrypted key, `is_default`). Several can coexist (one Anthropic key, one local Ollama…); the editor picks one per request, otherwise the default is used. Keys are decrypted only inside the server process for the duration of a call.

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

### Dashboard filters (slicers)

`definition.filters` holds the dashboard's own filters: `{ id, kind: 'date_range' | 'grain' | 'list', label, field?, datasourceId?, source?, multi?, value? }`. `web/src/lib/filters.ts` turns them into what a widget's query needs (`applyDashboardFilters`): a date range becomes `field >= from AND field < to + 1 day` (so DATE and DATETIME columns both get the whole last day), a list becomes `field IN (...)`, a grain re-buckets every bucketed date dimension. A field filter applies to a widget on the same data source whose source has the column: the widget's own source, or any source whose column list (`useSourceFields`, the same cache the fields pane fills) names it. The saved `value` is the default every viewer starts from; a viewer's choices live in the editor store's `filterValues` for the session. The server lets only a user with `dashboards.filters` add, change or remove a filter (it compares the filters without their values on save).

### Dashboard document

Stored as JSON in `dashboards.definition` and owned by the web client:

```ts
{ version: 1, widgets: Widget[], filters: [], settings: {} }
Widget = { id, type, title, layout: {x,y,w,h}, datasourceId, source, query: {dimensions, measures, filters, orderBy, limit}, options }
// options: legend, legendPosition, stacking (none|stacked|percent; the old `stacked: true` is read as `stacked`), showValues,
//          numberFormat, sortBy, showTotals, dataBars, gaugeMin, gaugeMax, target, referenceLine, averageLine
// a measure may carry `series: 'column' | 'line'` for the combo chart; the server never sees it
```

The server validates shape and size only, so new widget options never need a migration.

## Web (`web/`)

| Area | Notes |
|---|---|
| `styles/tokens.css` | the only place for colours, spacing (4px base), radii, control heights (`--control-h`, `-sm`, `-lg`), type sizes, chart palette. Dark is the primary theme ("Sổ cái": blue-black surfaces, ivory text, brass accent); light is neutral paper (warm white surfaces, ink text). Hierarchy comes from weight and tone — `base.css` sets the shared type roles (sentence-case labels, section titles), and mono (`.mono`) is reserved for identifiers and SQL. Presets override tokens per attribute on `<html>`: `data-theme` (resolved `light`/`dark`), `data-accent` (6 accents), `data-palette` (5 chart palettes), `data-text` (3 type scales), `data-radius` (3 corner scales). Accent and palette blocks also match the attribute on any element, which is how a swatch previews a preset. Fonts are self-hosted via `@fontsource-variable` (Archivo, JetBrains Mono) |
| `components/ui/` | Button, Field (Input/Select/Textarea/Checkbox), Panel, Modal (`<dialog>`), Toolbar, Feedback (Spinner/ErrorBox/EmptyState/Toasts), Segmented, Swatches (colour presets, same group shape as Segmented), KindBadge |
| `components/editor/` | `FieldsPane` (draggable fields), `Canvas` (react-grid-layout, droppable widgets, 1 column under 640px), `VisualPane` (chart type, wells, filters, options), `WidgetChart` (react-query + states) |
| `components/charts/` | `ChartRenderer.tsx` dispatches a widget to its visual; `options.ts` builds one ECharts option per type (column / bar / line / area with stacking and 100 %, combo, scatter / bubble, waterfall, funnel, pie / donut, treemap, heat map, radar, gauge), `Cards.tsx` draws the card, the KPI with trend and the multi-row card, `Tables.tsx` the sortable table and the matrix; `shape.ts` is the pure rows → categories / series / pivot layer they share. Colours, type and spacing are read from the tokens at render time |
| `lib/widget.ts` | `CHART_SPECS`: one row per visual type — how many fields each well takes (min / max), what each slot means (X / Y / Size, Rows / Columns, Value / Target), which options apply; `missingWells()` names the well still short, `comboRole()` decides which measures the combo chart draws as lines |
| `store/editor.ts` | zustand store: definition, selection, dirty flag, drop logic (`autoPlace`: numbers → measures) |
| `store/theme.ts` | the user's look: writes the preset attributes on `<html>`, mirrors them in `localStorage` (`rs.appearance`) for first paint, loads them from `GET /preferences` once the shell mounts and saves changes with a debounced `PUT` (table `user_preferences`), so they follow the user across devices; an empty server bag adopts the browser's current look. The language is not part of it: it stays with the i18n store. Charts re-read tokens on its `stamp` |
| `i18n/` | `LANGUAGES` registry (code, label, locale), `vi` (default) and `en` dictionaries; `useT()` is typed over the dictionary keys; plural forms via `Intl.PluralRules`; language = stored choice → browser language → `vi` |
| `lib/errors.ts` | `describeError()` turns a thrown `ApiError` into text: the translated `errors.<code>` when known, else the server message |
| `components/editor/AiSuggestDialog.tsx` | "Suggest with AI": prompt + provider choice, suggestion cards, adds widgets through the editor store |
| `api/client.ts` | fetch wrapper; a 401 anywhere clears the session; `auth.providers()` tells the login page which methods to show, `auth.entraLoginUrl()` is the full-page link that starts SSO, `preferences.get()` / `preferences.update()` carry the user's look |

Drag and drop: dnd-kit for *field → widget / well* (`DndContext` in `DashboardEditorPage`); react-grid-layout for *widget move / resize*. They do not conflict because grid dragging only starts on `.widget__header`.

## Security model

1. The data-source account should be `SELECT`-only (enforced by the DBA, not the app).
2. `sqlGuard` only lets a single `SELECT` through for datasets and ad-hoc SQL.
3. Each physical connection runs `SET SESSION TRANSACTION READ ONLY` and `SET SESSION max_statement_time`.
4. Every generated statement carries `LIMIT ≤ QUERY_MAX_ROWS`; the client timeout also kills long queries.
5. Data-source passwords are AES-256-GCM encrypted with a key derived from `APP_SECRET`.
6. Every route is guarded by a permission (`requirePermission`), every dashboard and data source by the access policies (`authorize`; editing or managing also needs viewing or querying), and every query on a data source carries the policies' row filters. A user who may only view dashboards can query only the sources those dashboards read (`sourceInViewableDashboard`). Row filters are a `WHERE` over the outer SELECT, so whoever may write SQL on a source (`datasets.manage` + policy `manage`) reads it whole: row-level security protects viewers, not dataset authors. A non-admin holder of `users.manage` / `roles.manage` can grant only permissions they hold, never the admin role, never to themselves; the last administrator cannot be demoted or deleted. A saved data-source password or AI key is only ever tested against its saved connection. The built-in roles keep their old meaning (viewers run saved dashboards and cannot send ad-hoc SQL; editors manage sources, datasets and dashboards; admins manage everything), but an admin can change what editor and viewer grant, add roles, and write policies that narrow access by user attributes.
7. Entra sign-in trusts only an ID token that verifies against the tenant's published keys, carries this app as audience, the expected issuer for its tenant and the nonce of the current attempt; `returnTo` is restricted to same-origin paths. Accounts provisioned from Entra have `password_hash = NULL`, so the password form cannot be used against them.
8. AI provider keys are encrypted like data-source passwords and are write-only through the API; only admins manage them, only editors call `/ai/suggest`, and model output is reduced to the semantic query model before anything runs.

## Adding a language

1. Copy `web/src/i18n/en.ts` to `web/src/i18n/<code>.ts` and translate every value. The file is typed as `Dictionary`, so a missing key fails `npm run typecheck`. A value may be plural forms where the language needs them: `{ one: '{count} row', other: '{count} rows' }` (categories follow `Intl.PluralRules`).
2. Add `{ code, label, locale }` to `LANGUAGES` in `web/src/i18n/index.ts` and the dictionary to `dictionaries`. The Login and Settings switchers, `<html lang>`, number/date formatting and browser-language detection all read from that list.
3. Server error texts come from the `errors` section of the dictionary; the server only sends codes.

## Adding a new chart type

1. Add the type to `WidgetType` / `WIDGET_TYPES` in `web/src/api/types.ts` (the array is the gallery order) and a label in both dictionaries (`chart.<type>`).
2. Describe it in `lib/widget.ts` (`CHART_SPECS`): how many dimensions and measures it takes, the labels of its wells and slots, which options (`features`) the visual pane shows, its default row limit.
3. Render it: an ECharts type gets a builder in `components/charts/options.ts` (register any new series or component in `echarts.ts`) and joins `ECHARTS_TYPES`; an HTML visual gets a component and a case in `ChartRenderer.tsx`.
4. Pick an icon in `VisualPane.tsx` (`typeIcons`).
5. Mirror its wells in `server/src/ai/suggest.ts` (`WIDGET_TYPES`, `SHAPES`) so the AI can propose it and the validator trims it.

## Adding another database engine

`query/executor.ts` and `query/introspect.ts` are the only MariaDB-specific files (plus `DATE_FORMAT` in `builder.ts`). A new engine means: a driver, an introspection query, a dialect for identifier quoting and date buckets, and `datasources.type`.
