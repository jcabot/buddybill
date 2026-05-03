# BuddySplit — agent notes

PWA for splitting expenses among friend groups. File-based storage, no
database. See `README.md` for user-facing setup.

## Repo layout

npm workspaces monorepo:

- `shared/` — types, zod schemas, money helpers (compiled to `dist/` before
  server/client typecheck)
- `server/` — Express + TS + SheetJS
- `client/` — React + Vite + TS PWA, Tailwind + CSS-variable tokens

## Build order matters

Server and client both consume `@buddysplit/shared` via the `dist/` build.
**Always build shared first** before server typecheck or test:

```bash
npm --workspace shared run build
```

Root scripts (`npm test`, `npm run typecheck`, `npm run dev`) already chain
this. Skipping it produces "module not found" errors that look unrelated.

## Storage model — non-obvious

- `data/auth/users.json` — bcrypt-hashed credentials
- `data/users/<uid>/groups-index.json` — per-user group index
- `data/groups/<group_id>.xlsx` — one workbook per group, source of truth

Activity sheets in the on-disk file are **named by `activity_id`** (e.g.
`act_abc123`), not by the activity's display name. This sidesteps Excel's
31-char limit, illegal-char rules, and uniqueness constraints, and makes a
rename a Meta-only change.

The **export** path (`workbookForExport` in `services/excelSchema.ts`)
re-keys activity sheets to friendly sanitized names, appends a per-activity
balance summary, and adds a global `Balance` sheet. The **import** path
(`snapshotFromExportWorkbook`) is strict — accepts only files produced by
our own export, with zod validation on every row.

## Concurrency

Every write goes through `withGroupLock(gid, fn)` in `services/lock.ts`
(an in-memory `async-mutex` keyed by group id). Owner-checks happen
**inside** the lock to avoid TOCTOU. Files are written via `tmp + rename`
for atomicity.

This assumes a **single Node process**. Don't scale to multiple Fly
machines without switching to file locks or a DB.

## Money

All split math runs in **integer minor units** (cents) via helpers in
`shared/src/money.ts`. JPY has zero minor places; everything else assumes
two. Equal-split remainder is distributed deterministically: first N
members get +1 cent.

`MemberBalance.contribution` (formerly `owed`) is what the member should
pay toward the activity's invoices, regardless of who actually paid. `net`
= `paid - contribution`.

## Auth & CSRF

- JWT in `bsid` cookie (`httpOnly Secure SameSite=Lax`, 30-day TTL)
- Double-submit CSRF: `bs_csrf` cookie (readable) + `X-CSRF-Token` header
  on unsafe methods. Login/signup are exempt.
- `JWT_SECRET` required in production. In dev, falls back to a random
  per-process value (logs a warning, sessions reset on restart).

## Tests worth running

`npm test` runs vitest:
- `services/balance.test.ts` — table-driven balance scenarios
- `services/excelSchema.test.ts` — round-trip a fixture snapshot
- `money.test.ts` — equal-split rounding, JPY edge cases

If you change anything in `services/balance.ts`, `services/excelSchema.ts`,
or `shared/src/money.ts`, run tests before declaring done.

## Conventions

- Don't add features beyond what's asked. The user prefers terse, scoped
  changes — no hypothetical hardening, no comment essays, no half-done
  abstractions.
- Comments only for non-obvious WHY (a hidden constraint or workaround).
  Don't restate what the code does.
- Default to editing existing files; don't create new docs/README files
  unless asked.
- For UI changes, the dev server (`npm run dev`) is usually already
  running; tsx and Vite hot-reload. Verify with `curl /api/health` and the
  app in a browser when relevant.
