#!/usr/bin/env bash
# Run the real-model SpendBench benchmark in one command (needs OPENROUTER_API_KEY on the *server*).
#
#   scripts/real_models.sh                 # 30 tasks × the 6 default models (agents/harness/models.py), asks first
#   scripts/real_models.sh -y              # no confirmation prompt
#   scripts/real_models.sh -n              # estimate only, don't run
#   MODELS=openai/gpt-5-mini,sim/careful TASKS=10 scripts/real_models.sh
#   URL=http://127.0.0.1:3011 scripts/real_models.sh
#
# Flow: check the key (local env + the server's /api/live model availability) -> estimate cost from the price table
# in agents/common/llm.py (tasks × models × average tokens per episode × price, plus LLM judges) -> confirm ->
# POST /api/runs -> poll until done -> print the leaderboard for that run.
#
# Env: URL (default http://127.0.0.1:$PORT, PORT=3000), MODELS (comma list), TASKS (30), GUARDRAIL (observe),
#      AVG_PROMPT_TOKENS (24000 per episode), AVG_COMPLETION_TOKENS (1800 per episode; reasoning models bill hidden
#      reasoning tokens as completion), BONDED_ADMIN_TOKEN (sign in when the server runs in token auth mode).
#
# The server must have been STARTED with the key, e.g.:
#   cd web && OPENROUTER_API_KEY=sk-or-... npm run dev
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3000}"
URL="${URL:-http://127.0.0.1:${PORT}}"
TASKS="${TASKS:-30}"
GUARDRAIL="${GUARDRAIL:-observe}"
YES=0; DRY=0
for a in "$@"; do
  case "$a" in
    -y|--yes) YES=1 ;;
    -n|--dry-run) DRY=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown argument: $a" >&2; exit 2 ;;
  esac
done
MODELS="${MODELS:-$(cd "$ROOT" && python3 -c 'from agents.harness.models import DEFAULT_REAL_MODELS as d; print(",".join(d))')}"
COOKIES="$(mktemp -t bonded-cookies.XXXXXX)"
trap 'rm -f "$COOKIES"' EXIT
CURL=(curl -sS -m 60 -b "$COOKIES" -c "$COOKIES")

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# 1. server + key checks --------------------------------------------------------------------------------------
"${CURL[@]}" -o /dev/null "$URL/api/leaderboard" 2>/dev/null || die "no server at $URL (start it with: cd web && OPENROUTER_API_KEY=... npm run dev)"
[ -n "${OPENROUTER_API_KEY:-}" ] || say "note: OPENROUTER_API_KEY is not set in this shell; checking the server's key instead"
LIVE="$("${CURL[@]}" "$URL/api/live" 2>/dev/null || echo '{}')"
SERVER_KEY="$(printf '%s' "$LIVE" | python3 -c 'import json,sys
try: d=json.load(sys.stdin)
except Exception: print("unknown"); raise SystemExit
ms=[m for m in d.get("models",[]) if not m.get("simulated")]
print("unknown" if not ms else ("yes" if any(m.get("available") for m in ms) else "no"))')"
NEEDS_KEY="$(python3 -c 'import sys; print(int(any(not m.startswith("sim/") for m in sys.argv[1].split(",") if m)))' "$MODELS")"
if [ "$NEEDS_KEY" = 1 ] && [ "$SERVER_KEY" = "no" ]; then
  die "the server at $URL has no OPENROUTER_API_KEY. Restart it with the key exported:
    cd web && OPENROUTER_API_KEY=sk-or-... npm run dev"
fi
if [ -n "${BONDED_ADMIN_TOKEN:-}" ]; then
  "${CURL[@]}" -o /dev/null -X POST "$URL/api/auth/login" -H 'Content-Type: application/json' \
    -d "$(python3 -c 'import json,os; print(json.dumps({"token": os.environ["BONDED_ADMIN_TOKEN"]}))')" || die "admin sign-in failed"
fi

# 2. cost estimate -------------------------------------------------------------------------------------------
cd "$ROOT"
python3 - "$MODELS" "$TASKS" <<'PY'
import os, sys
from agents.common.llm import DEFAULT_PRICE, PRICES, price_of
from agents.harness.models import display_name
models = [m for m in sys.argv[1].split(",") if m]
tasks = int(sys.argv[2])
pt = int(os.environ.get("AVG_PROMPT_TOKENS") or 24000)
ct = int(os.environ.get("AVG_COMPLETION_TOKENS") or 1800)
judge = os.environ.get("JUDGE_MODEL") or "openai/gpt-4o-mini"
total = 0.0
print(f"Estimated cost: {tasks} tasks × {len(models)} models, ~{pt:,} prompt + ~{ct:,} completion tokens per episode")
print(f"  {'model':<34} {'$/1M in':>8} {'$/1M out':>9} {'per task':>9} {'total':>8}")
for m in models:
    if m.startswith("sim/"):
        print(f"  {m:<34} {'-':>8} {'-':>9} {'$0':>9} {'$0.00':>8}  (simulated)")
        continue
    pin, pout = price_of(m)
    per = (pt * pin + ct * pout) / 1e6
    total += per * tasks
    flag = "  (price unknown: using default)" if m not in PRICES and price_of(m) == DEFAULT_PRICE else ""
    print(f"  {display_name(m)[:34]:<34} {pin:>8.2f} {pout:>9.2f} {'$%.4f' % per:>9} {'$%.2f' % (per * tasks):>8}{flag}")
real = sum(1 for m in models if not m.startswith("sim/"))
jin, jout = price_of(judge)
# guardrail judge on every checkout (~700 in / 60 out) + attribution judge on ~half the episodes (~9k in / 150 out)
j = tasks * real * ((700 * jin + 60 * jout) + 0.5 * (9000 * jin + 150 * jout)) / 1e6
print(f"  {'LLM judges (' + judge + ')':<34} {'':>8} {'':>9} {'':>9} {'$%.2f' % j:>8}")
print(f"  TOTAL ≈ ${total + j:.2f}  (approximate list prices; budget up to ~2× for verbose or reasoning-heavy models)")
PY

if [ "$DRY" = 1 ]; then exit 0; fi
if [ "$YES" != 1 ]; then
  read -r -p "Run it? [y/N] " ans
  case "$ans" in y|Y|yes|YES) ;; *) say "aborted"; exit 0 ;; esac
fi

# 3. run -----------------------------------------------------------------------------------------------------
BODY="$(python3 -c 'import json,sys; m=[x for x in sys.argv[1].split(",") if x]; print(json.dumps({"models": m, "taskCount": int(sys.argv[2]), "guardrail": sys.argv[3], "name": "Real models: %d × %s tasks" % (len(m), sys.argv[2])}))' "$MODELS" "$TASKS" "$GUARDRAIL")"
RESP="$("${CURL[@]}" -X POST "$URL/api/runs" -H 'Content-Type: application/json' -d "$BODY")" || die "POST /api/runs failed"
RUN_ID="$(printf '%s' "$RESP" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["run"]["id"]) if "run" in d else sys.exit("POST /api/runs: " + str(d.get("error") or d))')"
say "run $RUN_ID started ($URL/runs/$RUN_ID)"
T0=$(date +%s)
while :; do
  sleep 3
  ST="$("${CURL[@]}" "$URL/api/runs/$RUN_ID" | python3 -c 'import json,sys
r=json.load(sys.stdin)["run"]; p=r["progress"]
print(r["status"], "%d/%d" % (p["done"], p["total"]), (r.get("error") or "")[:200])' 2>/dev/null)" || ST="(server busy, retrying)"
  printf '\r  %-80s %4ss' "$ST" "$(( $(date +%s) - T0 ))"
  case "$ST" in completed*) echo; break ;; failed*) echo; die "run failed: $ST" ;; esac
done

# 4. leaderboard ---------------------------------------------------------------------------------------------
"${CURL[@]}" "$URL/api/leaderboard?runId=$RUN_ID" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print()
print("%-3s %-26s %-10s %6s %8s %6s %7s %6s %9s %7s  %s" % ("#", "model", "provider", "score", "success", "scam", "overBud", "wrong", "$/task", "lat s", "P(success) 90% CI"))
for i, r in enumerate(d["rows"], 1):
    m, rel = r["metrics"], r["reliability"]
    print("%-3d %-26s %-10s %6.1f %7.0f%% %5.0f%% %6.0f%% %5.0f%% %9.4f %7.1f  [%.2f, %.2f]  n=%d" % (
        i, r["displayName"][:26], r["provider"][:10], r["score"], 100 * m["successRate"], 100 * m["scamRate"],
        100 * m["budgetViolationRate"], 100 * m["wrongItemRate"], m["avgCostUsd"], m["avgLatencyMs"] / 1000,
        rel["lower"], rel["upper"], r["n"]))
'
say "details: $URL/runs/$RUN_ID"
