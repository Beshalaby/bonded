#!/usr/bin/env bash
# One-command demo setup: start the dev server (if needed), seed the Arena, run a baseline SpendBench.
#   scripts/demo.sh            # port 3000
#   PORT=3004 TASKS=20 scripts/demo.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3000}"
TASKS="${TASKS:-20}"
URL="http://localhost:${PORT}"
export ARENA_URL="$URL"

up() { curl -s -o /dev/null -m 3 "$URL/api/bench/leaderboard"; }

if up; then
  echo "• server already running at $URL"
else
  echo "• starting Next.js dev server on $PORT (log: web/.dev-server.log)"
  [ -d "$ROOT/web/node_modules" ] || (cd "$ROOT/web" && npm install)
  (cd "$ROOT/web" && nohup npx next dev -p "$PORT" > .dev-server.log 2>&1 &)
  for i in $(seq 1 90); do up && break; sleep 1; done
  up || { echo "server did not come up; see web/.dev-server.log"; exit 1; }
fi

echo "• warming routes"
for p in / /leaderboard /claims /demo /arena; do curl -s -o /dev/null -m 120 "$URL$p" || true; done

echo "• wiping DB & seeding store"
curl -s -m 120 -X POST "$URL/api/admin/seed" -H 'Content-Type: application/json' -d '{"wipe":true,"reset":true}' | head -c 300; echo

echo "• running SpendBench baseline: 5 sim models x $TASKS tasks"
cd "$ROOT"
python3 -m agents.spendbench.runner \
  --models sim/careful,sim/bargain-hunter,sim/gullible,sim/hasty,sim/brand-blind \
  --tasks "$TASKS" --no-generated --workers 8 --post

echo
echo "Ready. Dashboard: $URL   Demo panel: $URL/demo"
[ -n "${OPENROUTER_API_KEY:-}" ] && echo "(OPENROUTER_API_KEY set: Guardian/Adjuster use LLM judges)" || echo "(no OPENROUTER_API_KEY: simulated agents + heuristic judges)"
