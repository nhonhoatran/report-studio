# HTTP API

All endpoints live under `/api`, speak JSON, and (except login/health) require the session cookie set by `POST /api/auth/login` or by the Microsoft Entra callback. Errors are `{ "error": string, "code"?: string, "details"?: any }` with a 4xx/5xx status; `code` is a stable identifier (see `ErrorCode` in `server/src/lib/errors.ts`, e.g. `invalid_credentials`, `sql_not_select`, `db_timeout`, `ai_auth_failed`) that clients can translate, `error` is the English message. Roles: `viewer < editor < admin`.

`user` objects look like `{ id, username, displayName, role, provider: 'local' | 'entra', hasPassword, email, createdAt? }`.

## Auth
| Method | Path | Role | Body / notes |
|---|---|---|---|
| GET | `/auth/providers` | – | `{ local: boolean, entra: boolean }` — which sign-in methods the server offers |
| POST | `/auth/login` | – | `{ username, password }` → `{ user }`, sets `rs_session` cookie (httpOnly, SameSite=Lax); 403 when `AUTH_LOCAL_LOGIN=false` |
| GET | `/auth/entra/login?returnTo=/path` | – | browser navigation; stores the attempt in the `rs_entra` cookie (10 min) and redirects to Microsoft Entra (OIDC code flow + PKCE) |
| GET | `/auth/entra/callback` | – | Entra redirect target: verifies state + ID token, finds/links/creates the account, sets `rs_session`, redirects to `returnTo`; on failure redirects to `/login?error=entra_denied\|entra_domain\|entra_no_account\|entra_state\|entra_failed` |
| POST | `/auth/logout` | – | clears the cookie |
| GET | `/auth/me` | any | `{ user }` (read from the database, so a deleted account gets 401) |
| POST | `/auth/change-password` | any | `{ currentPassword, newPassword }`; 400 for an Entra account without a password |
| GET | `/auth/users` | admin | `{ users }` |
| POST | `/auth/users` | admin | `{ username, displayName, password, role }` — creates a password (`local`) account |
| PUT | `/auth/users/:id` | admin | `{ displayName?, password?, role? }` |
| DELETE | `/auth/users/:id` | admin | cannot delete yourself |


## Preferences
| Method | Path | Role | Body / notes |
|---|---|---|---|
| GET | `/preferences` | any | `{ preferences }` — the caller's own UI look, `{}` until saved |
| PUT | `/preferences` | any | `{ preferences }` → `{ preferences }`; replaces the caller's bag (upsert into `user_preferences`) |

`preferences` is owned by the web client: a flat object of up to 32 identifier keys with string (≤ 60 chars), number or boolean values, at most 4 KB as JSON (400 `preferences_too_large` beyond that). The client stores `{ theme: 'light'|'dark'|'system', accent, palette, text, radius }` — preset names are listed in `web/src/store/theme.ts`; unknown values fall back to the defaults on the client. The language is not part of the bag; it stays a per-browser choice.

## Data sources
| Method | Path | Role | Body / notes |
|---|---|---|---|
| GET | `/datasources` | any | `{ datasources }` (no passwords) |
| GET | `/datasources/:id` | any | |
| POST | `/datasources/test` | editor | `{ host, port, database, username, password, ssl, id? }` → `{ ok, version?, latencyMs?, error? }`; with `id` and empty password the saved password is reused |
| POST | `/datasources` | editor | `{ name, host, port, database, username, password, ssl }` |
| PUT | `/datasources/:id` | editor | partial; omit `password` to keep it |
| DELETE | `/datasources/:id` | editor | cascades to its datasets |
| GET | `/datasources/:id/tables` | any | `{ tables: [{ name, type: 'table'|'view', rows, comment }] }` |
| GET | `/datasources/:id/tables/:table/columns` | any | `{ columns: [{ name, kind, dataType, nullable, isKey, comment }] }` |

## SQL datasets
| Method | Path | Role | Body / notes |
|---|---|---|---|
| GET | `/datasets?datasourceId=` | any | |
| GET | `/datasets/:id` | any | |
| GET | `/datasets/:id/fields` | any | output columns, resolved with `LIMIT 0` |
| POST | `/datasets/preview-fields` | editor | `{ datasourceId, sql }` → `{ fields }` (validates without saving) |
| POST | `/datasets` | editor | `{ datasourceId, name, description?, sql }` — one SELECT only |
| PUT | `/datasets/:id` | editor | partial |
| DELETE | `/datasets/:id` | editor | |

## Dashboards
| Method | Path | Role | Body / notes |
|---|---|---|---|
| GET | `/dashboards` | any | list without definitions (`widgetCount` included) |
| GET | `/dashboards/:id` | any | with `definition` |
| POST | `/dashboards` | editor | `{ name, description?, definition }` |
| PUT | `/dashboards/:id` | editor | same body, full replace |
| POST | `/dashboards/:id/duplicate` | editor | |
| DELETE | `/dashboards/:id` | editor | |

`definition` shape: `{ version: 1, widgets: Widget[], filters: [], settings: {} }` — see `docs/ARCHITECTURE.md`.

## Query
| Method | Path | Role | Body / notes |
|---|---|---|---|
| POST | `/query` | any (`source.type = 'sql'` needs editor) | semantic query → `{ columns, rows, rowCount, truncated, durationMs, sql }` |
| POST | `/query/explain` | editor | same body → `{ sql, params, columns }` without executing |

Semantic query body:

```jsonc
{
  "datasourceId": 1,
  "source": { "type": "table", "table": "v_sales" },   // | { "type": "dataset", "datasetId": 2 } | { "type": "sql", "sql": "SELECT …" }
  "dimensions": [{ "field": "order_date", "bucket": "month" }],  // bucket: none|year|quarter|month|week|day|hour
  "measures":   [{ "field": "revenue", "agg": "sum" }],          // agg: sum|avg|count|count_distinct|min|max ; field "*" allowed for count
  "filters":    [{ "field": "status", "op": "in", "values": ["paid"] }],
  // op: eq|neq|gt|gte|lt|lte|in|not_in|contains|starts_with|between|is_null|not_null
  "orderBy":    [{ "alias": "sum_revenue", "direction": "desc" }],   // alias of an output column
  "limit": 1000                                                     // capped by QUERY_MAX_ROWS
}
```

Output aliases: dimension → `field` or `field_bucket`; measure → `agg_field` (`count_all` for `*`); duplicates get `_2`, `_3`.

## AI
| Method | Path | Role | Body / notes |
|---|---|---|---|
| GET | `/ai/providers` | any | `{ providers: [{ id, name, kind, model, baseUrl, isDefault }] }` — never includes keys |
| POST | `/ai/providers/test` | admin | `{ kind, model, baseUrl?, apiKey?, id? }` → `{ ok, latencyMs?, model?, error?, code? }`; with `id` and no `apiKey` the saved key is reused |
| POST | `/ai/providers` | admin | `{ name, kind, model, baseUrl?, apiKey, isDefault? }`; the first provider becomes the default |
| PUT | `/ai/providers/:id` | admin | partial; omit `apiKey` to keep it; `isDefault: true` moves the default here |
| DELETE | `/ai/providers/:id` | admin | deleting the default promotes the oldest remaining provider |
| POST | `/ai/suggest` | editor | `{ providerId?, sourceLabel, fields: [{ name, kind, dataType? }], prompt?, lang?, count? }` → `{ suggestions, provider, durationMs }` |

`kind`: `anthropic` (Claude, official SDK), `openai`, `gemini`, `openai_compatible` (any `/v1/chat/completions` server such as Ollama, vLLM, DeepSeek or Groq; `baseUrl` required, e.g. `http://ollama:11434/v1`). `baseUrl` is optional for the other kinds and overrides the provider's public endpoint.

A suggestion:

```jsonc
{
  "type": "line",                                   // column|bar|line|area|combo|scatter|waterfall|funnel|pie|donut|treemap|heatmap|radar|gauge|kpi|trend|multirow|table|matrix
  "title": "Doanh thu theo tháng",
  "explanation": "…",
  "dimensions": [{ "field": "order_date", "kind": "date", "bucket": "month" }],
  "measures":   [{ "field": "revenue", "kind": "number", "agg": "sum" }],
  "filters":    [],                                 // same shape as query filters
  "sortBy": "none"                                  // none|measure_desc|measure_asc
}
```

Every field name has been checked against `fields`; aggregations, buckets and the number of dimensions/measures are already legal for `type`. The server never executes anything on behalf of the model; the client turns a suggestion into a widget and runs it through `/query` like any other visual.

## Misc
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ ok: true, version }` |

Example session with curl:

```bash
curl -c c.txt -H 'content-type: application/json' -d '{"username":"admin","password":"admin123"}' http://localhost:4000/api/auth/login
curl -b c.txt -H 'content-type: application/json' -d '{"datasourceId":1,"source":{"type":"table","table":"v_sales"},"dimensions":[{"field":"region"}],"measures":[{"field":"revenue","agg":"sum"}]}' http://localhost:4000/api/query
```
