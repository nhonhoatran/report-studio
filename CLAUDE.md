# Report Studio — notes for AI coding assistants

- npm workspace: `server/` (Express + TypeScript, ESM, NodeNext imports end in `.js`) and `web/` (React 18 + Vite, `@/` alias to `web/src`).
- Checks: `npm run typecheck`, `npm test` (vitest in `server/test`), `npm run build`. Run all three before finishing.
- Local MariaDB for dev: `docker compose up -d mariadb`; the app migrates its own schema on boot.
- UI rules: compose `web/src/components/ui/*`; values only from `web/src/styles/tokens.css`; strings only via `useT()` with keys in both `i18n/vi.ts` and `i18n/en.ts`.
- Per-user look: `store/theme.ts` writes `data-theme` (resolved), `data-accent`, `data-palette`, `data-text`, `data-radius` on `<html>`; each preset is an attribute block in `tokens.css` (dark values, then a light block for both root and descendants). Add a preset = a token block + its name in the store's list + a label in both dictionaries.
- Anything that executes SQL on a user data source must go through `server/src/query/executor.ts` and, for raw SQL, `sqlGuard.assertReadOnlySelect`.
- Dashboard JSON (`definition`) is client-owned and versioned; keep the server schema in `routes/dashboards.ts` permissive.
- See `docs/ARCHITECTURE.md` before changing the query builder or the editor store.
