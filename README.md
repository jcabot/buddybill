# BuddySplit

Split expenses with your buddies — no awkward math.

A progressive web app for groups (friends, flatmates, dinner crews) to track
shared expenses across multiple activities/trips and see who owes or is owed
money. Each group's data is persisted as a single Excel file (one tab per
activity) so it stays portable, inspectable, and exportable at any time. An
exported file can be re-imported into another BuddySplit deployment for
migration.

## Stack

- **Frontend**: React + Vite + TypeScript, configured as a PWA via `vite-plugin-pwa`
- **Backend**: Node + Express + TypeScript, file-based storage (no database)
- **Storage**: JSON for auth/index, `.xlsx` per group via SheetJS
- **Auth**: email + password, bcrypt hashes, JWT cookie + double-submit CSRF
- **OCR**: Tesseract.js in the browser (lazy-loaded)
- **Hosting**: Fly.io with a persistent volume

## Repo layout

```
shared/   types, zod schemas, money helpers used on both sides
server/   Express + SheetJS, file-based persistence
client/   React + Vite + Tailwind PWA
```

## Local development

```bash
npm install
npm run dev
```

The server runs on `http://localhost:8080` and the Vite dev server on
`http://localhost:5173` with `/api` proxied to the server.

The data directory defaults to `./data` (created on first write). Override with
`DATA_DIR=/some/path`.

If `JWT_SECRET` is not set in dev, the server generates an ephemeral random
secret per process and logs a warning. Logins reset on every restart. To
persist sessions locally, put `JWT_SECRET=anything` in a `.env` file.

## Build & run in production mode

```bash
npm run build
JWT_SECRET=$(openssl rand -hex 32) NODE_ENV=production npm start
```

The server refuses to boot in production without `JWT_SECRET`.

## Tests

```bash
npm test
```

Vitest covers balance math, money rounding, Excel round-trip, and split
validation. The shared workspace is rebuilt automatically before server
typecheck/test.

## Excel format

Each group lives in `data/groups/<group_id>.xlsx` with sheets:

- `Meta` — group name, owner, currency, schema version
- `Members` — `member_id`, `name`
- `Activities` — `activity_id`, `name`, `balanced`
- One sheet per activity, named by `activity_id` on disk (avoids Excel's
  31-char/illegal-char limits and rename complications)

The **export** path (`Settings → Download .xlsx`) builds a friendlier file:
activity sheets are renamed to the friendly activity name (sanitized,
de-duplicated), each gets a balance summary appended below the invoices, and
a final `Balance` sheet shows per-member totals + per-activity breakdown.

The **import** path (`Dashboard → Import .xlsx`) accepts only files produced
by `/export` — strict zod validation, precise error messages, no schema
mapping. Intended for migrating between deployments. Member/activity/invoice
ids are preserved; only the `group_id` is regenerated.

## Deployment

The app is designed to run on **Fly.io** with a single machine and a
persistent volume. The repo ships with `Dockerfile`, `fly.toml`, and a
`.github/workflows/deploy.yml` workflow ready to use.

You can deploy through the Fly web dashboard (no CLI required) or with
`flyctl`. Step-by-step instructions, the required app name / region / volume /
`JWT_SECRET` checklist, and a table of common errors are in
**[docs/deploy-fly.md](docs/deploy-fly.md)**.

## Security

- Bcrypt-hashed passwords (12 rounds), no user enumeration on login.
- JWT in `httpOnly Secure SameSite=Lax` cookie + double-submit CSRF token
  on every unsafe method.
- `express-rate-limit` on login/signup (30 / 15 min / IP).
- Owner-checks happen inside the per-group mutex to avoid TOCTOU.
- Atomic file writes via `tmp + rename`.

Known v1 gaps: no password reset flow, no MFA, no JWT revocation list, no
email verification. See section 11 of the original PRD for details.
