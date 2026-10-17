#!/usr/bin/env bash
# Production entrypoint (Docker CMD, Render, Fly, or a plain VM after `npm run build`).
#
#   scripts/start-prod.sh                      # in the image: /app/scripts/start-prod.sh
#   (cd web && npm run build) && scripts/start-prod.sh   # local prod from a checkout
#
# What it does:
#   - finds the standalone server (web/server.js in the image, or web/.next/standalone/server.js in a checkout,
#     in which case it copies .next/static and public/ next to it, as `next build` does not)
#   - exports the paths the app needs (BONDED_ROOT = repo root containing agents/, data dir, self URL)
#   - restores red-team artifacts (agents/spendbench/tasks_generated.json, scams_registry.json) from the data
#     dir, and copies them back every 60 s and on shutdown, so they survive redeploys on a persistent disk
#   - starts `node server.js`. The server itself (src/instrumentation.ts -> lib/persist/boot.ts) loads the store,
#     seeds the Arena in-process if the store is empty (no HTTP, so no token needed), and with
#     BONDED_SEED_ON_BOOT=1 starts a baseline run once it is listening (its Python children authenticate with
#     the service token the server passes them).
#
# Env (all optional): PORT (3000), BIND_HOST (0.0.0.0), SPENDBENCH_DATA_DIR (<root>/data), DATABASE_URL,
#   BONDED_SEED_ON_BOOT=1, BONDED_AUTO_SEED=0, BONDED_STATE_DIR (defaults to SPENDBENCH_DATA_DIR).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export BONDED_ROOT="${BONDED_ROOT:-$ROOT}"
export SPENDBENCH_ROOT="${SPENDBENCH_ROOT:-$BONDED_ROOT}"
export NODE_ENV=production
export PORT="${PORT:-3000}"
# Next standalone binds to $HOSTNAME, but containers set HOSTNAME to the container id: bind via BIND_HOST.
export HOSTNAME="${BIND_HOST:-0.0.0.0}"
export SPENDBENCH_DATA_DIR="${SPENDBENCH_DATA_DIR:-$BONDED_ROOT/data}"
export SPENDBENCH_SELF_URL="${SPENDBENCH_SELF_URL:-http://127.0.0.1:$PORT}"
export NEXT_TELEMETRY_DISABLED=1

# In the image we start as root only long enough to make the mounted volume (Render disk / Fly volume, which
# are root-owned) writable, then re-exec this script as the unprivileged `bonded` user. Never serve as root.
if [ "$(id -u)" = 0 ] && id bonded >/dev/null 2>&1; then
  mkdir -p "$SPENDBENCH_DATA_DIR"
  chown -R bonded:bonded "$SPENDBENCH_DATA_DIR"
  exec gosu bonded "$0" "$@"
fi

# Public hostname for the MCP host allowlist, when the platform tells us (still set it explicitly if you add
# a custom domain).
if [ -z "${SPENDBENCH_ALLOWED_HOSTS:-}" ]; then
  if [ -n "${RENDER_EXTERNAL_HOSTNAME:-}" ]; then export SPENDBENCH_ALLOWED_HOSTS="$RENDER_EXTERNAL_HOSTNAME"
  elif [ -n "${FLY_APP_NAME:-}" ]; then export SPENDBENCH_ALLOWED_HOSTS="$FLY_APP_NAME.fly.dev"; fi
fi
# Let the app's own SIGTERM handler flush the store before exit (Next's handler would exit first).
export NEXT_MANUAL_SIG_HANDLE=1

# ---- locate the server
if [ -f "$BONDED_ROOT/web/server.js" ]; then
  APP="$BONDED_ROOT/web"                                   # Docker image layout
elif [ -f "$BONDED_ROOT/web/.next/standalone/server.js" ]; then
  APP="$BONDED_ROOT/web/.next/standalone"                  # checkout after `next build`
  rm -rf "$APP/.next/static" && cp -R "$BONDED_ROOT/web/.next/static" "$APP/.next/static"
  [ -d "$BONDED_ROOT/web/public" ] && rm -rf "$APP/public" && cp -R "$BONDED_ROOT/web/public" "$APP/public"
else
  echo "start-prod: no server.js found. Run: (cd web && npm ci && npm run build)" >&2
  exit 1
fi

# ---- preflight
PY="${PYTHON:-python3}"
if ! "$PY" --version >/dev/null 2>&1; then echo "start-prod: WARNING: $PY not found; eval runs will fail" >&2; fi
[ -n "${BONDED_ADMIN_TOKEN:-}" ] || echo "start-prod: WARNING: BONDED_ADMIN_TOKEN is not set: server runs CLOSED (reads, Arena and MCP work; sign-in, runs and admin writes return 403). See docs/DEPLOY.md" >&2
[ -n "${SPENDBENCH_ALLOWED_HOSTS:-}" ] || echo "start-prod: WARNING: SPENDBENCH_ALLOWED_HOSTS is not set: /api/mcp only answers for localhost" >&2
export BONDED_PROXY_HOPS="${BONDED_PROXY_HOPS:-1}"
if [ -n "${DATABASE_URL:-}" ]; then echo "start-prod: store = postgres (DATABASE_URL)"; else
  mkdir -p "$SPENDBENCH_DATA_DIR"; echo "start-prod: store = file ($SPENDBENCH_DATA_DIR/db.json)"; fi

# ---- red-team artifacts on the persistent disk
STATE="${BONDED_STATE_DIR:-$SPENDBENCH_DATA_DIR}/redteam"
ART=("agents/spendbench/tasks_generated.json" "agents/spendbench/scams_registry.json")
sync_back() {
  mkdir -p "$STATE" 2>/dev/null || return 0
  for f in "${ART[@]}"; do [ -f "$BONDED_ROOT/$f" ] && cp "$BONDED_ROOT/$f" "$STATE/$(basename "$f").tmp" \
    && mv "$STATE/$(basename "$f").tmp" "$STATE/$(basename "$f")"; done
  return 0
}
if mkdir -p "$STATE" 2>/dev/null; then
  for f in "${ART[@]}"; do [ -f "$STATE/$(basename "$f")" ] && cp "$STATE/$(basename "$f")" "$BONDED_ROOT/$f"; done
  CAN_SYNC=1
else
  CAN_SYNC=0
fi

# ---- run
cd "$APP"
node server.js &
NODE_PID=$!
SYNC_PID=""
if [ "$CAN_SYNC" = 1 ]; then
  ( while sleep 60; do sync_back; done ) &
  SYNC_PID=$!
fi
shutdown() {
  kill -TERM "$NODE_PID" 2>/dev/null || true
  wait "$NODE_PID" 2>/dev/null || true
  [ -n "$SYNC_PID" ] && kill "$SYNC_PID" 2>/dev/null || true
  [ "$CAN_SYNC" = 1 ] && sync_back
  exit 0
}
trap shutdown TERM INT
set +e
wait "$NODE_PID"
CODE=$?
[ -n "$SYNC_PID" ] && kill "$SYNC_PID" 2>/dev/null
[ "$CAN_SYNC" = 1 ] && sync_back
exit "$CODE"
