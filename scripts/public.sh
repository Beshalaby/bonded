#!/usr/bin/env bash
# Put Bonded on the internet for a demo, from this laptop, through a free Cloudflare quick tunnel.
#
#   scripts/public.sh              # build (if needed), start, print the public link; Ctrl+C stops everything
#   scripts/public.sh --rebuild    # force a fresh production build first
#   PORT=3100 scripts/public.sh    # use another local port
#
# What it does, in order:
#   1. preflight: cloudflared, node, python3, web/.env.local with OPENROUTER_API_KEY; the port must be free
#   2. logins on: creates BONDED_ADMIN_TOKEN + BONDED_INTERNAL_TOKEN once (kept in web/.env.local, git-ignored)
#   3. production build of web/ (skipped when the build is newer than the source, unless --rebuild)
#   4. starts the tunnel FIRST and reads its https://<random>.trycloudflare.com address, so the app can start
#      knowing its public hostname (MCP only answers to allow-listed hosts: DNS-rebinding protection)
#   5. starts the production server on the existing demo data (web/.data), with that hostname allowed
#   6. keeps the Mac awake (caffeinate) while running
#   7. checks the public URL from outside: home page, both MCP servers, a sign-in-gated write
#   8. prints the link, the admin sign-in, and the MCP lines to hand to judges
#
# The quick-tunnel address changes every time this script starts. Logs: web/.public/{tunnel,server}.log
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/web"
ENVF="$WEB/.env.local"
STATE="$WEB/.public"
PORT="${PORT:-3000}"
REBUILD=0
[[ "${1:-}" == "--rebuild" ]] && REBUILD=1

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

mkdir -p "$STATE"
PIDS=()
cleanup() {
  echo
  bold "Stopping…"
  for p in "${PIDS[@]:-}"; do [[ -n "$p" ]] && kill "$p" 2>/dev/null || true; done
  wait 2>/dev/null || true
  ok "tunnel, server and keep-awake stopped"
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------- 1. preflight
bold "1/7  Preflight"
command -v cloudflared >/dev/null || die "cloudflared is not installed: brew install cloudflared"
command -v node >/dev/null || die "node is not installed"
command -v python3 >/dev/null || die "python3 is not installed"
[[ -f "$ENVF" ]] || die "missing $ENVF (copy .env.example and add OPENROUTER_API_KEY)"
grep -q '^OPENROUTER_API_KEY=.' "$ENVF" || warn "no OPENROUTER_API_KEY: real models and LLM judges are off (sims still work)"
grep -q '^NESSIE_API_KEY=.' "$ENVF" || warn "no NESSIE_API_KEY: agents use the simulated ledger instead of Capital One"
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  die "port $PORT is in use (stop the dev server first: pkill -f 'next dev'), or run with PORT=<other>"
fi
[[ -d "$WEB/node_modules" ]] || (cd "$WEB" && npm ci --no-audit --no-fund)
ok "tools and keys present, port $PORT free"

# ---------------------------------------------------------------- 2. logins on
bold "2/7  Logins"
umask 077
if ! grep -q '^BONDED_ADMIN_TOKEN=.' "$ENVF"; then
  echo "BONDED_ADMIN_TOKEN=$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))')" >> "$ENVF"
  ok "created an admin token (stored in web/.env.local)"
fi
if ! grep -q '^BONDED_INTERNAL_TOKEN=.' "$ENVF"; then
  echo "BONDED_INTERNAL_TOKEN=$(python3 -c 'import secrets;print(secrets.token_hex(32))')" >> "$ENVF"
fi
chmod 600 "$ENVF"
set -a; . "$ENVF"; set +a
ok "logins on: visitors browse, check listings and connect agents; running models needs your sign-in"

# ---------------------------------------------------------------- 3. production build
bold "3/7  Production build"
BUILT="$WEB/.next/standalone/server.js"
if [[ $REBUILD == 1 || ! -f "$BUILT" ]] || [[ -n "$(find "$WEB/src" "$WEB/public" "$WEB/next.config.ts" -newer "$BUILT" -print -quit 2>/dev/null)" ]]; then
  (cd "$WEB" && NEXT_DIST_DIR= npx next build) > "$STATE/build.log" 2>&1 || { tail -30 "$STATE/build.log"; die "build failed (full log: web/.public/build.log)"; }
  git -C "$ROOT" checkout -- web/tsconfig.json 2>/dev/null || true
  ok "built"
else
  ok "existing build is up to date"
fi

# ---------------------------------------------------------------- 4. tunnel
bold "4/7  Cloudflare tunnel"
: > "$STATE/tunnel.log"
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" > "$STATE/tunnel.log" 2>&1 &
PIDS+=($!)
URL=""
for _ in $(seq 1 60); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$STATE/tunnel.log" | head -1 || true)
  [[ -n "$URL" ]] && break
  sleep 1
done
[[ -n "$URL" ]] || { tail -20 "$STATE/tunnel.log"; die "no tunnel URL after 60s (network blocked? see web/.public/tunnel.log)"; }
HOST="${URL#https://}"
echo "$URL" > "$STATE/url"
ok "$URL"

# ---------------------------------------------------------------- 5. server
bold "5/7  Server"
LAN=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
export SPENDBENCH_ALLOWED_HOSTS="$HOST${LAN:+,$LAN}"
export BONDED_PUBLIC_URL="$URL"                  # pages show copy-paste snippets with this link, even on localhost
export SPENDBENCH_DATA_DIR="$WEB/.data"          # the demo data (real-model results, wallets, traces)
export BONDED_PROXY_HOPS=1                       # Cloudflare adds the visitor's IP to X-Forwarded-For
export PORT
PORT="$PORT" "$ROOT/scripts/start-prod.sh" > "$STATE/server.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 90); do curl -s -o /dev/null -m 2 "http://127.0.0.1:$PORT/api/health" && break; sleep 1; done
curl -s -o /dev/null -m 5 "http://127.0.0.1:$PORT/api/health" || { tail -30 "$STATE/server.log"; die "server did not start (web/.public/server.log)"; }
ok "running on :$PORT with demo data"

# ---------------------------------------------------------------- 6. keep awake
bold "6/7  Keep-awake"
if command -v caffeinate >/dev/null; then caffeinate -dimsu & PIDS+=($!); ok "Mac will not sleep while this runs"; else warn "caffeinate not found: disable sleep manually"; fi

# ---------------------------------------------------------------- 7. outside checks
bold "7/7  Checking from the internet"
pass=1
check() { # label, expected code, curl args...
  local label="$1" want="$2"; shift 2
  local got; got=$(curl -s -o /dev/null -m 25 -w '%{http_code}' "$@" || echo 000)
  if [[ "$got" == "$want" ]]; then ok "$label ($got)"; else warn "$label: got $got, expected $want"; pass=0; fi
}
for _ in $(seq 1 30); do curl -s -o /dev/null -m 5 "$URL/api/health" && break; sleep 2; done   # DNS for a new tunnel can lag
MCP_INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"public-check"}}}'
H=(-H 'content-type: application/json' -H 'accept: application/json, text/event-stream')
check "home page"                   200 "$URL/"
check "Penny MCP server"            200 -X POST "${H[@]}" -d "$MCP_INIT" "$URL/api/mcp/penny"
check "SpendBench MCP server"       200 -X POST "${H[@]}" -d "$MCP_INIT" "$URL/api/mcp/bench"
check "model runs need sign-in"     401 -X POST -H 'content-type: application/json' -d '{"models":["sim/careful"],"taskCount":1}' "$URL/api/runs"
[[ $pass == 1 ]] || warn "some checks failed; logs in web/.public/"

cat <<EOF

$(bold "Bonded is live")
  Public link      $URL
  Sign in (you)    $URL/login        admin token: $BONDED_ADMIN_TOKEN
  Penny MCP        $URL/api/mcp/penny
  SpendBench MCP   $URL/api/mcp/bench
  Judges           open $URL/connect or $URL/penny#agents: every snippet already uses this address
  Claude Code      claude mcp add --transport http bonded-penny $URL/api/mcp/penny

  The link changes each time this script starts. Keep this window open; Ctrl+C stops everything.
  Logs: web/.public/server.log, web/.public/tunnel.log
EOF

wait "${PIDS[0]}"   # the tunnel; if it dies, everything stops
