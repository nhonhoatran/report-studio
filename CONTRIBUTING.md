# Contributing

## Setup

```bash
npm install
docker compose up -d mariadb          # or point server/.env at your own MariaDB
cp server/.env.example server/.env
npm run dev
```

## Before opening a PR

```bash
npm run typecheck
npm test
npm run build
```

## Conventions

- **Server**: one router per resource in `server/src/routes`; throw `HttpError` (see `lib/errors.ts`), never `res.status(500)` by hand. Anything that touches a user data source goes through `query/executor.ts`.
- **Web**: pages compose the shared pieces in `components/ui`; no hand-written buttons, inputs or error boxes. Colours, spacing and type come from `styles/tokens.css` only. Every user-facing string goes through `useT()` with a key in both `i18n/vi.ts` and `i18n/en.ts`.
- **Dashboard definition** is versioned (`version: 1`); if you change its shape, bump the version and migrate on load in `store/editor.ts`.
- Keep the query builder covered by unit tests (`server/test`): every new operator, bucket or aggregation gets a case.
