#!/usr/bin/env bash
# Automated dress rehearsal of the 2-minute demo (docs/DEMO.md). Times each step and prints a PASS/FAIL checklist.
#
#   scripts/rehearse.sh                          # against http://127.0.0.1:3000
#   scripts/rehearse.sh http://127.0.0.1:3011
#   SKIP_SEED=1 scripts/rehearse.sh              # keep the current data (faster; for repeated runs)
#   PACE_MS=750 scripts/rehearse.sh              # /live pacing (default 750 ms, what the demo uses)
#
# Steps:
#   1. fresh seed with history (scripts/seed_history.sh: wipe + baseline run + 2 red-team rounds + 2 more runs)
#   2. /present slides 1-6 load (HTTP 200)
#   3. /live: sim/gullible on airpods-pro-2 completes and is graded scammed
#   4. live red-team round keeps >= 1 scam
#   5. MCP bring-your-own-agent flow (web/src/lib/mcp/e2e_client.py) passes
#   6. hash-chain integrity of the latest traces is valid
# The server must be in open (dev / SPENDBENCH_DEMO=1) mode. Needs only curl and python3.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="${1:-${URL:-http://127.0.0.1:${PORT:-3000}}}"
URL="${URL%/}"
PACE_MS="${PACE_MS:-750}"
PORT_FROM_URL="$(python3 -c 'import sys,urllib.parse as u; p=u.urlparse(sys.argv[1]); print(p.port or (443 if p.scheme=="https" else 80))' "$URL")"
LOG="$(mktemp -t bonded-rehearse.XXXXXX)"
NAMES=(); RESULTS=(); TIMES=(); NOTES=()
T_ALL=$(date +%s)

now_ms() { python3 -c 'import time; print(int(time.time()*1000))'; }
jq_py() { python3 -c "import json,sys
try: d=json.load(sys.stdin)
except Exception: print(''); raise SystemExit
$1"; }

# step "<name>" <function>: runs it, records PASS/FAIL, elapsed time and the function's last stdout line as a note
step() {
  local name="$1" fn="$2" t0 t1 out rc
  printf '• %-46s ' "$name"
  t0=$(now_ms)
  out="$("$fn" 2>>"$LOG")"; rc=$?
  t1=$(now_ms)
  local secs; secs=$(python3 -c "print('%.1f' % (($t1 - $t0) / 1000))")
  NAMES+=("$name"); TIMES+=("$secs"); NOTES+=("$(printf '%s' "$out" | tail -1)")
  if [ $rc -eq 0 ]; then RESULTS+=("PASS"); printf 'PASS  %6ss  %s\n' "$secs" "$(printf '%s' "$out" | tail -1)"
  else RESULTS+=("FAIL"); printf 'FAIL  %6ss  %s\n' "$secs" "$(printf '%s' "$out" | tail -1)"; fi
}

# ---------------------------------------------------------------- steps
s_server() {
  local code; code=$(curl -s -o /dev/null -m 60 -w '%{http_code}' "$URL/api/leaderboard")
  [ "$code" = 200 ] || { echo "GET /api/leaderboard -> $code (is the server running at $URL?)"; return 1; }
  echo "server up at $URL"
}

s_seed() {
  if [ "${SKIP_SEED:-0}" = 1 ]; then echo "skipped (SKIP_SEED=1)"; return 0; fi
  if ! PORT="$PORT_FROM_URL" "$ROOT/scripts/seed_history.sh" >>"$LOG" 2>&1; then echo "seed_history.sh failed (see $LOG)"; return 1; fi
  curl -sf -m 30 "$URL/api/leaderboard" | jq_py 't=d["totals"]; print("%d models, %d results, %d runs, %d scams" % (t["models"], t["results"], t["runs"], t["scams"]))'
}

s_present() {
  local bad="" n code
  for n in 1 2 3 4 5 6; do
    code=$(curl -s -o /dev/null -m 120 -w '%{http_code}' "$URL/present?slide=$n")
    [ "$code" = 200 ] || bad="$bad slide$n=$code"
  done
  [ -z "$bad" ] || { echo "not 200:$bad"; return 1; }
  echo "6/6 slides 200"
}

s_live() {
  local resp run sid st i
  resp=$(curl -s -m 30 -X POST "$URL/api/live" -H 'Content-Type: application/json' \
    -d "{\"model\":\"sim/gullible\",\"taskId\":\"airpods-pro-2\",\"paceMs\":$PACE_MS}")
  run=$(printf '%s' "$resp" | jq_py 'print(d.get("runId") or "")')
  [ -n "$run" ] || { echo "POST /api/live failed: ${resp:0:160}"; return 1; }
  for i in $(seq 1 180); do
    st=$(curl -s -m 30 "$URL/api/live/runs/$run" | jq_py 'print(d["run"]["status"], d.get("sessionId") or "-")')
    case "$st" in completed*|failed*) break ;; esac
    sleep 1
  done
  sid="${st#* }"
  case "$st" in completed*) ;; *) echo "live run $run ended as: ${st:-timeout}"; return 1 ;; esac
  for i in $(seq 1 20); do  # the graded result lands a moment after the process exits
    out=$(curl -s -m 30 "$URL/api/live/sessions/$sid" | jq_py 'r=d.get("result")
print("" if not r else "%s %s $%s %s" % ("scammed" if r.get("scammed") else "not-scammed", ",".join(r.get("trapTypes") or []), r.get("amount"), "integrity-ok" if d["integrity"]["valid"] else "integrity-BROKEN"))')
    [ -n "$out" ] && break
    sleep 1
  done
  echo "$sid: ${out:-no graded result}"
  case "$out" in scammed*prompt_injection*integrity-ok) return 0 ;; *) return 1 ;; esac
}

s_redteam() {
  local before after i resp running
  before=$(curl -s -m 30 "$URL/api/redteam" | jq_py 'print(len(d["scams"]))')
  resp=$(curl -s -m 30 -X POST "$URL/api/redteam" -H 'Content-Type: application/json' -d '{"rounds":1,"perRound":4}')
  printf '%s' "$resp" | grep -q '"started":true' || { echo "POST /api/redteam failed: ${resp:0:160}"; return 1; }
  sleep 2
  for i in $(seq 1 240); do
    running=$(curl -s -m 30 "$URL/api/redteam" | jq_py 'print(int(bool(d.get("running"))))')
    [ "$running" = 0 ] && break
    sleep 1
  done
  after=$(curl -s -m 30 "$URL/api/redteam" | jq_py 'print(len(d["scams"]))')
  [ -n "$before" ] && [ -n "$after" ] || { echo "could not read /api/redteam"; return 1; }
  echo "kept $((after - before)) new scam(s); $after total"
  [ $((after - before)) -ge 1 ]
}

s_mcp() {
  local out
  out=$(python3 "$ROOT/web/src/lib/mcp/e2e_client.py" "$URL/api/mcp" 2>&1); local rc=$?
  printf '%s\n' "$out" >>"$LOG"
  echo "$(printf '%s\n' "$out" | grep -c '^PASS') checks passed, $(printf '%s\n' "$out" | grep -c '^FAIL') failed"
  return $rc
}

s_integrity() {
  curl -s -m 60 "$URL/api/traces?limit=12" | jq_py 'print(" ".join(t["sessionId"] for t in d["traces"]))' >"$LOG.ids"
  local ids n=0 bad=0 v
  ids=$(cat "$LOG.ids"); rm -f "$LOG.ids"
  [ -n "$ids" ] || { echo "no traces"; return 1; }
  for s in $ids; do
    v=$(curl -s -m 60 "$URL/api/traces/$s" | jq_py 'i=d["integrity"]; print("ok" if i["valid"] else "broken@%s" % i.get("brokenAt"))')
    n=$((n + 1)); [ "$v" = ok ] || { bad=$((bad + 1)); echo "$s: $v" >>"$LOG"; }
  done
  echo "$((n - bad))/$n latest traces verify"
  [ $bad -eq 0 ]
}

echo "Bonded demo rehearsal against $URL  (log: $LOG)"
step "server reachable" s_server
if [ "${RESULTS[0]}" = FAIL ]; then echo "abort: server not reachable"; exit 1; fi
step "fresh seed with history" s_seed
step "/present slides 1-6 load" s_present
step "/live gullible × airpods-pro-2 is scammed" s_live
step "live red-team round keeps >= 1 scam" s_redteam
step "MCP bring-your-own-agent flow" s_mcp
step "latest traces pass integrity check" s_integrity

TOTAL=$(( $(date +%s) - T_ALL ))
FAILS=0
echo
echo "Checklist"
for i in "${!NAMES[@]}"; do
  printf '  [%s] %-46s %6ss\n' "${RESULTS[$i]}" "${NAMES[$i]}" "${TIMES[$i]}"
  [ "${RESULTS[$i]}" = PASS ] || FAILS=$((FAILS + 1))
done
echo "Total: ${TOTAL}s — $([ $FAILS -eq 0 ] && echo "ALL PASS" || echo "$FAILS FAILED (details in $LOG)")"
exit $([ $FAILS -eq 0 ] && echo 0 || echo 1)
