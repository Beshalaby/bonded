#!/usr/bin/env bash
# Read-only pitch pre-flight: checks everything the demo touches, changes nothing.
#
#   scripts/preflight.sh            # against the public tunnel link (web/.public/url) if one exists, else localhost
#   scripts/preflight.sh <base-url> # against a specific address
#   FULL=1 scripts/preflight.sh     # also runs one real listing check and one Penny plan (a few cents of OpenRouter)
#
# Unlike scripts/rehearse.sh (which re-seeds and WIPES the demo data), this is safe to run minutes before the pitch.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENVF="$ROOT/web/.env.local"
BASE="${1:-}"
[[ -z "$BASE" && -f "$ROOT/web/.public/url" ]] && BASE="$(cat "$ROOT/web/.public/url")"
BASE="${BASE:-http://127.0.0.1:3000}"
BASE="${BASE%/}"
[[ -f "$ENVF" ]] && { set -a; . "$ENVF"; set +a; }

PASS=0; FAIL=0; WARN=0
ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$*"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; FAIL=$((FAIL+1)); }
warn() { printf '  \033[33mWARN\033[0m  %s\n' "$*"; WARN=$((WARN+1)); }
J() { python3 -c "import sys,json
try: d=json.load(sys.stdin)
except Exception: print(''); sys.exit()
$1" 2>/dev/null; }

echo "Pre-flight against $BASE"
echo
echo "Keys and access"
[[ -n "${OPENROUTER_API_KEY:-}" ]] && ok "OpenRouter key present" || bad "no OPENROUTER_API_KEY in web/.env.local"
[[ -n "${NESSIE_API_KEY:-}" ]] && ok "Capital One Nessie key present" || warn "no NESSIE_API_KEY: wallets use the simulated ledger"
[[ -n "${BONDED_ADMIN_TOKEN:-}" ]] && ok "admin token present (sign in at $BASE/login)" || warn "no BONDED_ADMIN_TOKEN: server is open to everyone"
if [[ -n "${OPENROUTER_API_KEY:-}" ]]; then
  left=$(curl -s -m 15 https://openrouter.ai/api/v1/key -H "Authorization: Bearer $OPENROUTER_API_KEY" | J "k=d['data'];print(round((k.get('limit') or 0)-(k.get('usage') or 0),2) if k.get('limit') else 'unlimited')")
  [[ -n "$left" ]] && ok "OpenRouter credit left on the key: \$$left" || warn "couldn't read OpenRouter usage"
fi

echo
echo "Server"
h=$(curl -s -m 20 "$BASE/api/health")
[[ "$(echo "$h" | J "print(d.get('ok'))")" == "True" ]] && ok "health: store=$(echo "$h" | J "print(d['store'])"), $(echo "$h" | J "print(d['products'])") products, $(echo "$h" | J "print(d['results'])") results" || bad "health endpoint not OK ($BASE/api/health)"
pub=$(curl -s -m 15 "$BASE/api/public-url" | J "print(d.get('url') or '')")
if [[ "$BASE" == https://* ]]; then
  [[ "$pub" == "$BASE" ]] && ok "snippets show the public link" || warn "server's public URL is '$pub' (snippets may show another address)"
fi

echo
echo "Pages"
for p in / /present /live /check /penny /connect /bank /redteam /runs /methodology; do
  c=$(curl -s -o /dev/null -m 30 -w '%{http_code}' "$BASE$p")
  [[ "$c" == 200 ]] && ok "$p" || bad "$p returned $c"
done

echo
echo "Story numbers"
lb=$(curl -s -m 20 "$BASE/api/leaderboard")
top=$(echo "$lb" | J "r=d['rows'][0];print(r['displayName'],r['score'],'n='+str(r['n']))")
[[ "$top" == Bonded\ Shield* ]] && ok "#1 on the ranking: $top" || warn "#1 on the ranking is: $top"
echo "$lb" | J "
rows={r['model']:r for r in d['rows']}
for base in ('openai/gpt-5-mini','qwen/qwen3-235b-a22b-2507'):
    b=rows.get(base); s=rows.get('bonded/shield:'+base)
    if b and s:
        sc=lambda r: round(r['metrics']['scamRate']*r['n'])
        print(f\"  INFO  {b['displayName']}: {b['score']} with {sc(b)} scams  ->  {s['displayName']}: {s['score']} with {sc(s)} scams\")"
bank=$(curl -s -m 30 "$BASE/api/bank")
prov=$(echo "$bank" | J "print(d.get('provider'))")
[[ "$prov" == capital_one_nessie ]] && ok "wallets on Capital One Nessie ($(echo "$bank" | J "print(len(d['wallets']))") cards)" || warn "wallets provider is '$prov'"
echo "$bank" | J "
for w in d.get('wallets',[])[:4]: print(f\"  INFO  {w['displayName']} ••{w['accountLast4']}  balance \${w['balance']}\")"
rt=$(curl -s -m 20 "$BASE/api/redteam" | J "print(len(d.get('scams',[])))")
[[ "${rt:-0}" -gt 0 ]] && ok "red team: $rt scams that fooled a model" || warn "red team registry is empty"

echo
echo "MCP (as a hosted agent would connect)"
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"preflight"}}}'
for srv in penny bench; do
  hdr=$(mktemp)
  name=$(curl -s -m 20 -D "$hdr" -X POST "$BASE/api/mcp/$srv" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -H 'Origin: https://claude.ai' -d "$INIT" | J "print(d['result']['serverInfo']['name'])")
  sid=$(awk 'tolower($1)=="mcp-session-id:"{print $2}' "$hdr" | tr -d '\r'); rm -f "$hdr"
  n=$(curl -s -m 20 -X POST "$BASE/api/mcp/$srv" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -H "mcp-session-id: $sid" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | J "print(len(d['result']['tools']))")
  [[ -n "$name" && -n "$n" ]] && ok "/api/mcp/$srv → '$name', $n tools" || bad "/api/mcp/$srv did not initialize"
done

echo
echo "Shield"
v=$(curl -s -m 30 -X POST "$BASE/api/shield/analyze" -H 'content-type: application/json' -d '{"product_id":"p_airpods_injection","intent":{"request":"Buy AirPods Pro 2, budget $260","budget":260}}' | J "print(d.get('decision'))")
[[ "$v" == avoid ]] && ok "hidden-instruction listing → avoid" || bad "Shield returned '$v' for the injection listing"
g=$(curl -s -m 30 -X POST "$BASE/api/shield/analyze" -H 'content-type: application/json' -d '{"product_id":"p_airpods_pro2","intent":{"request":"Buy AirPods Pro 2, budget $260","budget":260}}' | J "print(d.get('decision'))")
[[ "$g" == buy ]] && ok "genuine AirPods → buy" || warn "Shield returned '$g' for the genuine AirPods"

if [[ "${FULL:-0}" == 1 ]]; then
  echo
  echo "Live calls (FULL=1, a few cents)"
  c=$(curl -s -m 90 -X POST "$BASE/api/check" -H 'content-type: application/json' -d '{"url":"https://www.brooklinen.com/products/classic-core-sheet-set"}' | J "print(d['verdict']['decision'])")
  [[ -n "$c" ]] && ok "real listing check (Brooklinen) → $c" || warn "real listing check failed (site may be blocking right now)"
fi

echo
printf 'Result: %d passed, %d warnings, %d failed\n' "$PASS" "$WARN" "$FAIL"
[[ $FAIL == 0 ]]
