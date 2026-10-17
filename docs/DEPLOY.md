# Deploying Bonded

Bonded runs as **one** container. It holds the Next.js server (Node 22) and the stdlib-only Python agents
(Python 3.12) that the server spawns for eval runs. State lives in one of two places:

| Store | When | Where |
|---|---|---|
| JSON file | `DATABASE_URL` unset | `$SPENDBENCH_DATA_DIR/db.json` (`/app/data` in the image). Mount a persistent disk there. |
| Postgres | `DATABASE_URL` set (Supabase or any Postgres) | Table `bonded_snapshot` (one row with the whole store as `jsonb`), plus an append-only `bonded_log` mirror of every trace entry. Both are created automatically. |

How the store works (`web/src/lib/db.ts`, `web/src/lib/persist/`):

- The store is an in-memory snapshot with a synchronous API.
- At boot, `src/instrumentation.ts` loads the snapshot before Next serves any request.
- Writes are debounced (500 ms on Postgres, 150 ms on file). They are flushed asynchronously, off the request path, and retried if they fail.
- On `SIGTERM`, the server flushes before it exits.
- If Postgres is unreachable at boot, the server does not start. It never serves an empty store, which it would later write over your data.

> **Single writer.** Every flush writes the whole snapshot, and the last write wins. Run **exactly one
> instance** per data dir or `DATABASE_URL`. Don't autoscale, and don't run blue/green with two live instances.
> On Postgres, the server takes an advisory lock and logs a warning if a second instance connects.

## Production environment

| Variable | Required | Notes |
|---|---|---|
| `BONDED_ADMIN_TOKEN` | **yes** | 32+ random chars (`openssl rand -hex 32`). Sign in at `/login` with it. Without it, production runs **closed**: reads, the Arena and MCP work, but sign-in, runs and admin writes return 403. |
| `SPENDBENCH_ALLOWED_HOSTS` | **yes** (for MCP) | Your public hostname(s), comma-separated, such as `bonded.onrender.com`. `/api/mcp` rejects any other Host/Origin. `start-prod.sh` defaults it to `$RENDER_EXTERNAL_HOSTNAME` or `<app>.fly.dev`. Set it explicitly when you add a custom domain. |
| `BONDED_INTERNAL_TOKEN` | recommended | The service token the server hands to its Python runners. If unset, it is derived from the session secret. |
| `BONDED_SESSION_SECRET` | optional | HMAC key for admin cookies. Defaults to a key derived from the admin token. |
| `BONDED_PROXY_HOPS` | set to match the platform | The number of proxies that append to `X-Forwarded-For`, used by the rate limits. Render and Fly use `1`, which is the default. |
| `DATABASE_URL` | optional | Postgres connection string. Leave it unset to use the JSON file. |
| `SPENDBENCH_DATA_DIR` | optional | Defaults to `/app/data` in the image. |
| `BONDED_SEED_ON_BOOT` | optional | `1` starts a 5-sim × 30-task baseline run on first boot, but only if no runs exist yet. |
| `BONDED_AUTO_SEED` | optional | The Arena catalog is seeded automatically when the store is empty. Set `0` to disable. |
| `OPENROUTER_API_KEY` | optional | Enables real models and the LLM judges. |
| `SPENDBENCH_DEMO` | keep `0` | The image defaults to `0`. `1` opens every write to everyone. Never set it on a public URL. |
| `BONDED_PG_SSL` | optional | `require` (the default for non-local hosts: encrypted, cert not verified, like libpq), `verify-full`, or `disable`. |
| `BONDED_PG_CA` | optional | PEM of the DB server's CA. It turns on `verify-full`. For Supabase, use Database Settings → SSL Configuration → Download certificate, and paste the PEM (`\n` escapes are fine). |
| `BIND_HOST`, `PORT` | optional | Default to `0.0.0.0:3000`. Render injects `PORT`. |

`GET /api/health` is public and is what every platform health check uses. It returns:

```json
{"ok":true,"store":"postgres","products":572,"results":150,"uptimeS":42,"python":"3.12.x","durable":true,"lastFlush":{"at":"…","ok":true}}
```

`durable: false` means the last flush failed. The server keeps serving and retrying; check the logs.

## 1. Local production (no Docker)

```bash
cd web && npm ci && npm run build && cd ..
BONDED_ADMIN_TOKEN=$(openssl rand -hex 32) PORT=3000 BIND_HOST=127.0.0.1 scripts/start-prod.sh
curl -s localhost:3000/api/health
```

`start-prod.sh` finds `web/.next/standalone/server.js` and copies `.next/static` and `public/` next to it.
It sets `BONDED_ROOT` to the repo root, which is where the Python runs execute, and keeps data in `./data`.
Add `DATABASE_URL=postgres://…` to use Postgres instead.

## 2. Docker

```bash
docker build -t bonded .
docker run -d --name bonded -p 3000:3000 -v bonded-data:/app/data \
  -e BONDED_ADMIN_TOKEN=$(openssl rand -hex 32) \
  -e BONDED_INTERNAL_TOKEN=$(openssl rand -hex 32) \
  -e SPENDBENCH_ALLOWED_HOSTS=localhost \
  -e BONDED_SEED_ON_BOOT=1 \
  bonded
docker logs -f bonded       # "[db] file store loaded …", "[boot] … seeded …"
curl -s localhost:3000/api/health
```

The image:

- Uses multi-stage builds. The runtime is `python:3.12-slim-bookworm` plus the Node 22 binary.
- Runs `next build` with `output: "standalone"`.
- Puts `agents/` at `/app/agents`.
- Starts as root only long enough to `chown` the mounted volume, then runs as uid 1001 (`bonded`).
- Has a `HEALTHCHECK` on `/api/health`.

## 3. Render (one click from GitHub)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Beshalaby/bonded)

1. Push this branch to `main` on GitHub. The blueprint is `render.yaml` at the repo root.
2. Click the button. Or go to Render Dashboard → **New → Blueprint**, pick `Beshalaby/bonded`, and click
   **Apply**. The repo is private, so Render first asks you to install its GitHub app with access to it.
3. Render asks for the `sync: false` values:
   - `SPENDBENCH_ALLOWED_HOSTS`: leave it empty to use `<service>.onrender.com` automatically, or enter your custom domain.
   - `DATABASE_URL`: leave it empty to use the 1 GB disk, or paste a Supabase string (see section 5).
   - `OPENROUTER_API_KEY`: optional.
4. `BONDED_ADMIN_TOKEN` and `BONDED_INTERNAL_TOKEN` are generated for you. Open the service → **Environment**
   to copy the admin token, then sign in at `https://<service>.onrender.com/login`.
5. The first deploy builds the image (about 3–5 min), seeds the Arena and runs the baseline. Then check:
   `curl https://<service>.onrender.com/api/health`.

Notes:

- Persistent disks need a paid instance (`plan: starter`). The free plan has no disk, so on the free plan you
  must set `DATABASE_URL`. Delete the `disk:` block if you go that route.
- Deploys on a service with a disk briefly stop the old instance before starting the new one. That is what
  keeps it single-writer. Expect a few seconds of downtime per deploy.

## 4. Fly.io

```bash
fly auth login
fly launch --no-deploy --copy-config --ha=false     # keep fly.toml; choose an app name, then update `app` in fly.toml
fly volumes create bonded_data --size 1 --region iad
fly secrets set BONDED_ADMIN_TOKEN=$(openssl rand -hex 32) BONDED_INTERNAL_TOKEN=$(openssl rand -hex 32)
# optional: fly secrets set DATABASE_URL='postgres://…' OPENROUTER_API_KEY=…
fly deploy
fly scale count 1                                   # single writer
curl https://<app>.fly.dev/api/health
```

`--ha=false` matters. By default Fly creates two machines, which would be two writers.

## 5. Supabase (managed Postgres for `DATABASE_URL`)

1. Go to <https://supabase.com/dashboard> → **New project**. Pick a name, a strong database password (save it)
   and a region close to your server, then wait about 2 min for it to provision.
2. Click **Connect** (top bar) → **Connection string** → **URI**. Under *Method*, choose **Session pooler**.
   It is IPv4-compatible and supports the advisory lock. The direct connection is IPv6-only, and Render and
   many hosts can't reach it. The string looks like this:
   `postgresql://postgres.<project-ref>:<YOUR-PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres`
3. Replace `<YOUR-PASSWORD>` with your password, URL-encoding any special characters.
4. Put the string into `DATABASE_URL`: on Render (Environment), with `fly secrets set DATABASE_URL=…`, or with `docker run -e …`.
   Then redeploy.
5. Check the result. The boot log shows `[db] postgres store loaded from postgres://aws-0-….pooler.supabase.com:5432/postgres`,
   and `/api/health` shows `"store":"postgres"`. In the Supabase Table Editor you'll see `bonded_snapshot` and
   `bonded_log`.
6. For verified TLS (optional), go to Database Settings → SSL Configuration → **Download certificate** and put the PEM in
   `BONDED_PG_CA`.

Don't use the *Transaction pooler* (port 6543). It works for reads and writes, but it can't hold the
single-writer advisory lock, so you'll see a warning.

The tables are created with **row-level security enabled and no policies**. Supabase's auto-generated Data API
(the `anon` / `authenticated` roles) therefore can't read them. The server connects as the table owner
(`postgres`), which bypasses RLS. Don't put the `DATABASE_URL` or the `service_role` key anywhere client-side.

### Moving existing data

- **File → Postgres.** Before the first boot with `DATABASE_URL`, load your old `db.json` into the empty database.
  Otherwise the server seeds a fresh store first. From `web/`:
  `node -e 'const {Client}=require("pg");const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});c.connect().then(()=>c.query("create table if not exists bonded_snapshot(id int primary key,data jsonb not null,updated_at timestamptz not null default now())")).then(()=>c.query("insert into bonded_snapshot(id,data) values(1,$1::jsonb) on conflict(id) do update set data=excluded.data,updated_at=now()",[require("fs").readFileSync(".data/db.json","utf8")])).then(()=>c.end())'`
- **Back up Postgres:** `select data from bonded_snapshot where id=1` *is* the backup.

## What is and isn't persisted

| Data | File store | Postgres |
|---|---|---|
| Catalog, sessions, trace chain, results, runs, scams registry (db) | disk | `bonded_snapshot` |
| Trace entries (audit mirror, append-only, survives wipes) | – | `bonded_log` |
| Red-team task files `agents/spendbench/tasks_generated.json`, `scams_registry.json` | Synced to `$SPENDBENCH_DATA_DIR/redteam/` every 60 s and on shutdown, then restored on boot | Same, but only if a disk is mounted. Without a disk they reset on redeploy. |
| Runs in progress | Lost on restart. They are marked `failed: interrupted` on the next boot. | same |
| Rate-limit buckets, SSE clients | per process (memory) | same |

## Troubleshooting

- **`/api/health` returns 503 with `cannot load snapshot`.** `DATABASE_URL` is wrong or unreachable. The password
  is redacted in the error. Check for IPv6-only hosts: use Supabase's Session pooler.
- **`EACCES` on `/app/data`.** The volume isn't writable by uid 1001. Run without `--user` so the entrypoint can
  `chown` it, or `chown 1001:1001` the volume yourself.
- **Runs fail with `spawn python3 ENOENT`.** You are running outside the image without Python 3. Health shows
  `"python": null`.
- **MCP clients get 403/421.** Add the public hostname to `SPENDBENCH_ALLOWED_HOSTS`.
