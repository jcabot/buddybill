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

## Deployment (Fly.io)

The repo includes `fly.toml`, a multi-stage `Dockerfile`, and
`.github/workflows/deploy.yml` for auto-deploy on push to `main`. You can
deploy entirely through the Fly **web dashboard** (no CLI required) or with
`flyctl` from a terminal — both paths are documented below.

### Required pieces, regardless of path

| Piece | Why it matters |
|---|---|
| **Unique app name** | Fly's app names are global. The placeholder `app = "buddysplit"` in `fly.toml` is almost certainly taken — Fly will offer alternatives during launch. |
| **Region** | Pick the closest one (e.g. `cdg` Paris, `mad` Madrid, `lhr` London, `iad` US-East). The volume must live in the same region as the app. |
| **Persistent volume** | Stores `users.json`, the per-user index, and every group's `.xlsx`. Without it, all data vanishes on each deploy. The volume name **must** match `mounts.source` in `fly.toml` (default: `buddysplit_data`). |
| **`JWT_SECRET`** | Stored as a Fly **secret** (not a plain env var). The server refuses to boot in production without it. **The name is case-sensitive** — must be exactly `JWT_SECRET`. |

### Path A — Web dashboard (no CLI)

1. **Create the app** — fly.io dashboard → **Launch new app** → connect this
   GitHub repo. Fly detects the `Dockerfile` and `fly.toml`. Pick a unique app
   name and a region.
2. **Create the volume** — app page → **Volumes** → **Create Volume** with the
   name `buddysplit_data`, size **1 GB**, in the **same region** as the app.
   (Fly will reject the deploy if this is missing or in another region.)
3. **Add the JWT secret** — app page → **Secrets** → **New Secret**.
   - Name: `JWT_SECRET` *(uppercase, exactly this — `jwt_secret` will not work)*
   - Value: paste a 64-char hex string. Generate one in a terminal:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
     Or in any browser DevTools console:
     ```js
     Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('')
     ```
4. **Deploy** — saving the secret automatically triggers a redeploy. You can
   also use **Deployments → Redeploy** at any time. Watch progress in **Live
   Logs**.
5. **Enable auto-deploy from GitHub** — app page → **Settings → Continuous
   Deployment** → **Enable**. Future pushes to `main` redeploy automatically.
   (Alternatively, use the included `.github/workflows/deploy.yml` — see GitHub
   Actions section below.)

### Path B — flyctl from a terminal

```bash
# 1. Install flyctl + log in
iwr https://fly.io/install.ps1 -useb | iex      # Windows
# curl -L https://fly.io/install.sh | sh        # macOS / Linux
fly auth login

# 2. Create the app (Fly will offer a unique name; updates fly.toml)
fly launch --copy-config --no-deploy

# 3. Create the persistent volume (must match `mounts.source` in fly.toml)
fly volumes create buddysplit_data --size 1 --region <same-as-app>

# 4. Set the JWT secret (case-sensitive name!)
fly secrets set JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# 5. Deploy
fly deploy
```

### GitHub Actions auto-deploy (alternative to Fly's CD)

The workflow at `.github/workflows/deploy.yml` runs `flyctl deploy --remote-only`
on every push to `main`. To enable it:

```bash
fly tokens create deploy
# Paste the output into GitHub: repo → Settings → Secrets and variables →
# Actions → New repository secret → name FLY_API_TOKEN, value <token>
```

If you also enabled Fly's built-in CD in Path A step 5, pick one — running
both produces redundant deploys.

### Verifying a successful deploy

After deploy completes, in **Live Logs** you should see:

```
BuddySplit server listening on 0.0.0.0:8080 (env=production)
```

Then visit the app URL shown at the top of the dashboard (typically
`https://<your-app>.fly.dev`).

### Common deployment errors

| Symptom in logs | Cause | Fix |
|---|---|---|
| `Error: JWT_SECRET must be set in production` | Secret missing or named wrong (e.g. `jwt_secret`, `JWT-SECRET`). | Set a secret named **exactly** `JWT_SECRET`. Saving triggers a redeploy. |
| `EACCES`, `permission denied`, or `ENOENT` on `/data/...` | Volume not mounted, or in a different region than the machine. | Create a volume named `buddysplit_data` in the same region; redeploy. |
| `failed to compute cache key: ".../node_modules": not found` | Dockerfile referenced a path that doesn't exist (e.g. `server/node_modules` — npm workspaces hoist deps to root). | Already fixed in the bundled `Dockerfile`; if you forked, sync to the latest. |
| Health check timeout — `waiting for machine to be reachable on 0.0.0.0:8080` | Server crashed on boot (check the line before the timeout) **or** Node bound to IPv6 only. | Check logs for the underlying error. The bundled `server/src/index.ts` already binds to `0.0.0.0` explicitly. |
| Build succeeds but app loads a blank page | `client/dist` not present in the runtime image. | Confirm the Dockerfile copies `client/dist` (it does, by default). |

### Operational notes

- **Single machine**: the in-memory per-group `async-mutex` assumes one writer.
  Don't scale beyond one machine without switching to file locks or a DB.
- **Cold starts**: `auto_stop_machines = "suspend"` in `fly.toml` keeps costs
  near zero; the first request after a quiet period takes a few seconds. Set
  `min_machines_running = 1` to disable.
- **Backups**: Fly volumes snapshot daily. Users can also export their group
  `.xlsx` from Settings as an extra safety net.
- **Rotating `JWT_SECRET`**: changing the secret invalidates every existing
  session — all users have to log back in. Treat it like a password.

## Security

- Bcrypt-hashed passwords (12 rounds), no user enumeration on login.
- JWT in `httpOnly Secure SameSite=Lax` cookie + double-submit CSRF token
  on every unsafe method.
- `express-rate-limit` on login/signup (30 / 15 min / IP).
- Owner-checks happen inside the per-group mutex to avoid TOCTOU.
- Atomic file writes via `tmp + rename`.

Known v1 gaps: no password reset flow, no MFA, no JWT revocation list, no
email verification. See section 11 of the original PRD for details.
