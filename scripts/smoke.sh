#!/usr/bin/env bash
# API smoke test against a running Bonded / SpendBench server.
#
#   scripts/smoke.sh http://127.0.0.1:3034
#
# 1. seeds the arena (POST /api/admin/seed)
# 2. runs a 2-model x 3-task eval through POST /api/runs and waits for it
# 3. hits every GET endpoint in CONTRACTS.md and checks status 200 + key fields
# 4. drives one MCP session over JSON-RPC (initialize -> start_task -> search -> add_to_cart -> checkout)
# 5. verifies the hash-chain integrity of a trace from the eval and of the MCP trace
#
# With BONDED_ADMIN_TOKEN set (token mode) it first checks that anonymous writes get 401, then signs in.
# Exits non-zero with a clear message on the first failure.
#
# Env:
#   BONDED_INTERNAL_TOKEN  sent as `x-bonded-internal` when set (internal routes behind auth)
#   BONDED_ADMIN_TOKEN     when set, the script signs in (POST /api/auth/login) and sends the admin session cookie
#   SMOKE_WIPE=1           wipe the DB before seeding (default: reseed the catalog only)
#   SMOKE_RUN_TIMEOUT      seconds to wait for the eval run (default 300)
set -euo pipefail

BASE="${1:-${BASE_URL:-}}"
[ -n "$BASE" ] || { echo "usage: $0 <base_url>" >&2; exit 2; }
BASE="${BASE%/}"
RUN_TIMEOUT="${SMOKE_RUN_TIMEOUT:-300}"
MODELS='["sim/careful","sim/gullible"]'
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

AUTH=(-H "Accept: application/json")
[ -n "${BONDED_INTERNAL_TOKEN:-}" ] && AUTH+=(-H "x-bonded-internal: ${BONDED_INTERNAL_TOKEN}")

PASS=0
fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { PASS=$((PASS + 1)); echo "  ok  $*"; }

# req METHOD PATH [JSON_BODY] -> body in $TMP/body, status in $STATUS, headers in $TMP/headers
req() {
  local method="$1" path="$2" data="${3:-}"
  local args=(-sS -m 60 -o "$TMP/body" -D "$TMP/headers" -w '%{http_code}' -X "$method" "${AUTH[@]}")
  [ -n "$data" ] && args+=(-H "Content-Type: application/json" --data "$data")
  STATUS=$(curl "${args[@]}" "$BASE$path") || fail "$method $path: curl error (is the server up at $BASE?)"
}

# expect_json NAME PYTHON_EXPR: evaluate EXPR with `d` = parsed body; fail if false or raises.
# (eval only ever sees assertion expressions written in this script, never data from the server.)
expect_json() {
  local name="$1" expr="$2"
  python3 - "$TMP/body" "$expr" <<'PY' || fail "$name: assertion failed: $2 (body: $(head -c 400 "$TMP/body"))"
import json, sys
d = json.load(open(sys.argv[1]))
ok = eval(sys.argv[2], {"d": d})
sys.exit(0 if ok else 1)
PY
}

# jget PYTHON_EXPR -> prints the value of EXPR with `d` = parsed body
jget() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(eval(sys.argv[2], {"d": d}))' "$TMP/body" "$1"; }

# get PATH NAME EXPR: GET, expect 200 and EXPR
get() {
  req GET "$1"
  [ "$STATUS" = "200" ] || fail "GET $1 returned HTTP $STATUS: $(head -c 400 "$TMP/body")"
  expect_json "GET $1" "$2"
  ok "GET $1"
}

echo "Smoke test against $BASE"

# ---------------------------------------------------------------- 0. health + admin sign-in (token mode)
req GET /api/health
if [ "$STATUS" = "200" ]; then ok "GET /api/health"; elif [ "$STATUS" != "404" ]; then fail "GET /api/health returned HTTP $STATUS: $(head -c 400 "$TMP/body")"; fi
if [ -n "${BONDED_ADMIN_TOKEN:-}" ]; then
  # Token mode: anonymous writes must be refused before we sign in.
  anon() { curl -sS -m 30 -o "$TMP/body" -w '%{http_code}' -X POST -H "Content-Type: application/json" "$@" || echo 000; }
  code=$(anon --data '{"models":["sim/careful"],"taskCount":1}' "$BASE/api/runs")
  [ "$code" = "401" ] || fail "anonymous POST /api/runs returned HTTP $code (want 401 in token mode)"
  ok "anonymous POST /api/runs -> 401"
  code=$(anon --data '{"reset":true}' "$BASE/api/admin/seed")
  [ "$code" = "401" ] || fail "anonymous POST /api/admin/seed returned HTTP $code (want 401 in token mode)"
  ok "anonymous POST /api/admin/seed -> 401"
  code=$(anon -H "x-bonded-internal: wrong-token" --data '{"results":[]}' "$BASE/api/bench/results")
  [ "$code" = "401" ] || fail "POST /api/bench/results with a bad service token returned HTTP $code (want 401)"
  ok "bad x-bonded-internal -> 401"
  code=$(anon --data '{"token":"definitely-wrong"}' "$BASE/api/auth/login")
  [ "$code" = "401" ] || fail "POST /api/auth/login with a wrong token returned HTTP $code (want 401)"
  ok "wrong admin token -> 401"
  login_body=$(python3 -c 'import json,os; print(json.dumps({"token": os.environ["BONDED_ADMIN_TOKEN"]}))')
  req POST /api/auth/login "$login_body"
  [ "$STATUS" = "200" ] || fail "POST /api/auth/login returned HTTP $STATUS: $(head -c 400 "$TMP/body")"
  # Send the cookie explicitly: curl's jar would drop a `Secure` cookie on plain-http localhost.
  cookie=$(grep -i '^set-cookie: bonded_admin=' "$TMP/headers" | head -1 | sed -E 's/^[Ss]et-[Cc]ookie: ([^;]*).*/\1/' | tr -d '\r\n' || true)
  [ -n "$cookie" ] && AUTH+=(-H "Cookie: $cookie")
  ok "POST /api/auth/login${cookie:+ (admin cookie)}"
fi

# ---------------------------------------------------------------- 1. seed
seed_body='{"reset":true}'
[ "${SMOKE_WIPE:-0}" = "1" ] && seed_body='{"reset":true,"wipe":true}'
req POST /api/admin/seed "$seed_body"
[ "$STATUS" = "200" ] || fail "POST /api/admin/seed returned HTTP $STATUS: $(head -c 400 "$TMP/body")"
ok "POST /api/admin/seed"

# ---------------------------------------------------------------- 2. eval run
req POST /api/runs "{\"models\":$MODELS,\"taskCount\":3,\"guardrail\":\"observe\"}"
[ "$STATUS" = "200" ] || [ "$STATUS" = "201" ] || fail "POST /api/runs returned HTTP $STATUS: $(head -c 400 "$TMP/body")"
expect_json "POST /api/runs" "d['run']['id'] and len(d['run']['models']) == 2"
RUN_ID=$(jget "d['run']['id']")
ok "POST /api/runs -> $RUN_ID"

deadline=$(( $(date +%s) + RUN_TIMEOUT ))
while :; do
  req GET "/api/runs/$RUN_ID"
  [ "$STATUS" = "200" ] || fail "GET /api/runs/$RUN_ID returned HTTP $STATUS"
  st=$(jget "d['run']['status']")
  prog=$(jget "'%d/%d' % (d['run']['progress']['done'], d['run']['progress']['total'])")
  case "$st" in
    completed) break ;;
    failed) fail "run $RUN_ID failed: $(jget "d['run'].get('error')")" ;;
  esac
  [ "$(date +%s)" -lt "$deadline" ] || fail "run $RUN_ID did not complete within ${RUN_TIMEOUT}s (status $st, $prog)"
  sleep 2
done
expect_json "run results" "len(d['results']) == 6 and d['run']['progress']['done'] == 6 and len(d['leaderboard']) == 2"
ok "run $RUN_ID completed (6/6 results)"
TASK_ID=$(jget "d['results'][0]['taskId']")

# ---------------------------------------------------------------- 3. GET endpoints (CONTRACTS.md)
get /api/leaderboard "isinstance(d['rows'], list) and len(d['rows']) >= 2 and all(k in d['totals'] for k in ('models','tasks','results','runs','scams','trapListings')) and 'updatedAt' in d"
get "/api/leaderboard?runId=$RUN_ID" "len(d['rows']) == 2 and d['totals']['results'] == 6 and all('reliability' in r and 'score' in r for r in d['rows'])"
get "/api/models/sim%2Fcareful" "d['stats']['model'] == 'sim/careful' and isinstance(d['results'], list) and len(d['results']) >= 3 and isinstance(d['failures'], list) and isinstance(d['history'], list)"
get /api/runs "any(r['id'] == '$RUN_ID' for r in d['runs'])"
get "/api/runs/$RUN_ID" "d['run']['id'] == '$RUN_ID' and len(d['results']) == 6 and isinstance(d['leaderboard'], list)"
get /api/tasks "len(d['tasks']) > 0 and all(k in d['tasks'][0] for k in ('id','instruction','budget','tags','adversarial')) and isinstance(d['tags'], list)"
get "/api/tasks/$TASK_ID" "d['task']['id'] == '$TASK_ID' and isinstance(d['results'], list) and len(d['results']) >= 1"
get "/api/traces?runId=$RUN_ID&limit=50" "len(d['traces']) >= 6 and all(k in d['traces'][0] for k in ('sessionId','model','instruction','steps','outcome'))"
SESSION_ID=$(jget "d['traces'][0]['sessionId']")
get "/api/traces/$SESSION_ID" "d['session']['id'] == '$SESSION_ID' and len(d['entries']) > 0 and d['integrity']['valid'] is True and d['integrity']['length'] == len(d['entries']) and isinstance(d['products'], dict)"
ok "trace $SESSION_ID integrity valid"
get /api/redteam "isinstance(d['scams'], list) and isinstance(d['growth'], list) and isinstance(d['byTrap'], list)"
get "/api/compare?a=sim%2Fcareful&b=sim%2Fgullible" "isinstance(d, dict)"
get /api/guardrail "isinstance(d, dict)"

# SSE: expect 200 + text/event-stream (the stream never ends, so cap it).
code=$(curl -sS -m 3 -o /dev/null -D "$TMP/sse_headers" -w '%{http_code}' "${AUTH[@]}" "$BASE/api/events" 2>/dev/null || true)
[ "$code" = "200" ] || fail "GET /api/events returned HTTP $code"
grep -qi '^content-type: text/event-stream' "$TMP/sse_headers" || fail "GET /api/events is not text/event-stream"
ok "GET /api/events (SSE)"

# ---------------------------------------------------------------- 4. MCP JSON-RPC flow
MCP_HDRS=(-H "Accept: application/json, text/event-stream")
mcp() { # mcp JSON_BODY -> body in $TMP/body
  local args=(-sS -m 60 -o "$TMP/body" -D "$TMP/headers" -w '%{http_code}' -X POST "${AUTH[@]}" "${MCP_HDRS[@]}" -H "Content-Type: application/json" --data "$1")
  STATUS=$(curl "${args[@]}" "$BASE/api/mcp") || fail "POST /api/mcp: curl error"
}
tool() { # tool ID NAME ARGS_JSON -> parsed tool result JSON in $TMP/body
  mcp "{\"jsonrpc\":\"2.0\",\"id\":$1,\"method\":\"tools/call\",\"params\":{\"name\":\"$2\",\"arguments\":$3}}"
  [ "$STATUS" = "200" ] || fail "MCP $2 returned HTTP $STATUS: $(head -c 400 "$TMP/body")"
  python3 - "$TMP/body" "$2" <<'PY' || fail "MCP $2 failed: $(head -c 600 "$TMP/body")"
import json, sys
d = json.load(open(sys.argv[1]))
if "error" in d: sys.exit(1)
r = d["result"]
if r.get("isError"): sys.exit(1)
json.dump(json.loads(r["content"][0]["text"]), open(sys.argv[1], "w"))
PY
}

mcp '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}'
[ "$STATUS" = "200" ] || fail "MCP initialize returned HTTP $STATUS: $(head -c 400 "$TMP/body")"
expect_json "MCP initialize" "d['result']['protocolVersion'] == '2025-06-18' and d['result']['serverInfo']['name']"
MCP_SID=$(grep -i '^mcp-session-id:' "$TMP/headers" | head -1 | cut -d: -f2- | tr -d ' \r\n')
[ -n "$MCP_SID" ] || fail "MCP initialize returned no Mcp-Session-Id header"
MCP_HDRS+=(-H "Mcp-Session-Id: $MCP_SID" -H "MCP-Protocol-Version: 2025-06-18")
ok "MCP initialize (session $MCP_SID)"

mcp '{"jsonrpc":"2.0","method":"notifications/initialized"}'
[ "$STATUS" = "202" ] || fail "MCP notifications/initialized returned HTTP $STATUS (want 202)"

mcp '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
expect_json "MCP tools/list" "{'start_task','search_products','add_to_cart','checkout'} <= {t['name'] for t in d['result']['tools']}"
ok "MCP tools/list"

tool 3 start_task '{"task_id":"airpods-pro-2","agent_name":"Smoke Test"}'
expect_json "MCP start_task" "d['task_id'] == 'airpods-pro-2' and d['session_id'] and d['budget_usd'] > 0"
MCP_TRACE=$(jget "d['session_id']")
ok "MCP start_task -> $MCP_TRACE"

tool 4 search_products '{"query":"AirPods Pro 2"}'
expect_json "MCP search_products" "d['count'] > 0 and all('trap' not in p for p in d['products'])"
PID=$(jget "d['products'][0]['id']")
ok "MCP search_products -> $PID"

tool 5 add_to_cart "{\"product_id\":\"$PID\",\"quantity\":1}"
ok "MCP add_to_cart"

tool 6 checkout '{"reasoning":"smoke test"}'
expect_json "MCP checkout" "d['grade']['verdict'] in ('PASS','FAIL') and d['grade']['bought'] is True"
ok "MCP checkout -> $(jget "d['grade']['verdict']")"

get "/api/traces/$MCP_TRACE" "d['integrity']['valid'] is True and any(e['action'] == 'checkout_requested' for e in d['entries'])"
ok "MCP trace $MCP_TRACE integrity valid"

curl -sS -m 10 -o /dev/null -X DELETE "${AUTH[@]}" -H "Mcp-Session-Id: $MCP_SID" "$BASE/api/mcp" || true

echo "SMOKE OK: $PASS checks passed"
