# HTTP API

All endpoints live under `/api`, speak JSON, and (except login/health) require the session cookie set by `POST /api/auth/login`. Errors are `{ "error": string, "details"?: any }` with a 4xx/5xx status. Roles: `viewer < editor < admin`.

## Auth
| Method | Path | Role | Body / notes |
|---|---|---|---|
| POST | `/auth/login` | – | `{ username, password }` → `{ user }`, sets `rs_session` cookie (httpOnly, SameSite=Lax) |
| POST | `/auth/logout` | – | clears the cookie |
| GET | `/auth/me` | any | `{ user }` |
| POST | `/auth/change-password` | any | `{ currentPassword, newPassword }` |
| GET | `/auth/users` | admin | `{ users }` |
| POST | `/auth/users` | admin | `{ username, displayName, password, role }` |
| PUT | `/auth/users/:id` | admin | `{ displayName?, password?, role? }` |
| DELETE | `/auth/users/:id` | admin | cannot delete yourself |

## Preferences
| Method | Path | Role | Body / notes |
|---|---|---|---|
| GET | `/preferences` | any | `{ preferences }` — the caller's own UI look, `{}` until saved |
| PUT | `/preferences` | any | `{ preferences }` → `{ preferences }`; replaces the caller's bag |

`preferences` is owned by the web client: a flat object of up to 32 identifier keys with string (≤ 60 chars), number or boolean values, at most 4 KB as JSON. The client stores `{ theme: 'light'|'dark'|'system', accent, palette, text, radius }` — preset names are listed in `web/src/store/theme.ts`; unknown values fall back to the defaults on the client.

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
