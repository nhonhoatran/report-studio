# HTTP API

All endpoints live under `/api`, speak JSON, and (except login/health) require the session cookie set by `POST /api/auth/login` or by the Microsoft Entra callback. Errors are `{ "error": string, "details"?: any }` with a 4xx/5xx status. Roles: `viewer < editor < admin`.

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

## Misc
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ ok: true, version }` |

Example session with curl:

```bash
curl -c c.txt -H 'content-type: application/json' -d '{"username":"admin","password":"admin123"}' http://localhost:4000/api/auth/login
curl -b c.txt -H 'content-type: application/json' -d '{"datasourceId":1,"source":{"type":"table","table":"v_sales"},"dimensions":[{"field":"region"}],"measures":[{"field":"revenue","agg":"sum"}]}' http://localhost:4000/api/query
```
