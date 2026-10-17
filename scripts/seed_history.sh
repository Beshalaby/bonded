#!/usr/bin/env bash
# Rich demo data for the UI: baseline run (setup.sh) + 2 red-team rounds + a second run that includes the new
# adversarial tasks + a small guardrail-enforce run. Leaves several runs, red-team scams/tasks and attributed failures.
#
#   PORT=3011 scripts/seed_history.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3000}"
URL="http://127.0.0.1:${PORT}"
SIMS='["sim/careful","sim/bargain-hunter","sim/gullible","sim/hasty","sim/brand-blind"]'
source "$ROOT/scripts/lib.sh"

"$ROOT/scripts/setup.sh"

echo "• red team: 2 rounds × 6 scams (background job via POST /api/redteam)"
curl -sf -m 30 -X POST "$URL/api/redteam" -H 'Content-Type: application/json' -d '{"rounds":2,"perRound":6}'; echo
for _ in $(seq 1 600); do
  running=$(curl -sf -m 30 "$URL/api/redteam" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(int(d.get("running", False)), len(d["scams"]))')
  printf '\r  running=%s scams=%s   ' $running
  [ "${running%% *}" = "0" ] && break
  sleep 2
done
echo

start_run "{\"models\":$SIMS,\"taskCount\":20,\"includeAdversarial\":true,\"guardrail\":\"observe\",\"name\":\"Re-run with red-team tasks\"}"
start_run "{\"models\":[\"sim/careful\",\"sim/gullible\",\"sim/hasty\"],\"taskCount\":12,\"guardrail\":\"enforce\",\"name\":\"Guardrail enforce check\"}"

echo
curl -sf "$URL/api/leaderboard" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('totals:', d['totals'])
for r in d['rows']:
    rel = r['reliability']
    print('  %-30s score=%5.1f  P(success)=%.2f [%.2f, %.2f]  n=%d' % (r['displayName'], r['score'], rel['mean'], rel['lower'], rel['upper'], r['n']))
"
