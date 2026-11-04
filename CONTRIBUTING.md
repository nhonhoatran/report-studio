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
- **Web**: pages compose the shared pieces in `components/ui`; no hand-written buttons, inputs or error boxes. Colours, spacing and type come from `styles/tokens.css` only. Every user-facing string goes through `useT()` with a key in every dictionary under `i18n/` (`vi.ts` is the source of keys; the others are typed against it). Show thrown errors through `ErrorBox` / `toast.error(err)` (the error itself, not `err.message`) so server error codes are translated.
- **Server errors**: throw `HttpError` with a code from `ErrorCode` (`lib/errors.ts`) and add `errors.<code>` to every dictionary. Scalar `details` become template parameters.
- **AI**: anything the model returns is data; validate it in `ai/suggest.ts` before it reaches a client. Keys are write-only and encrypted; never log them.
- **Adding a language**: see `docs/ARCHITECTURE.md` → *Adding a language*.
- **Dashboard definition** is versioned (`version: 1`); if you change its shape, bump the version and migrate on load in `store/editor.ts`.
- Keep the query builder covered by unit tests (`server/test`): every new operator, bucket or aggregation gets a case.
