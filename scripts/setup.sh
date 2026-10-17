#!/usr/bin/env bash
# SpendBench one-command setup: start the server (if needed), wipe + seed the store, run a baseline eval
# (5 simulated agents × 30 tasks, guardrail in observe mode) through POST /api/runs, and wait for it.
#
#   scripts/setup.sh                     # port 3000, data in web/.data
#   PORT=3011 SPENDBENCH_DATA_DIR=.data-be NEXT_DIST_DIR=.next-be scripts/setup.sh
#
# Env: PORT (3000), TASKS (30), MODELS (5 sims), GUARDRAIL (observe), KEEP_REDTEAM=1 to keep red-team tasks on disk.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3000}"
TASKS="${TASKS:-30}"
GUARDRAIL="${GUARDRAIL:-observe}"
MODELS="${MODELS:-sim/careful,sim/bargain-hunter,sim/gullible,sim/hasty,sim/brand-blind}"
URL="http://127.0.0.1:${PORT}"
source "$ROOT/scripts/lib.sh"

if up; then
  echo "• server already running at $URL"
else
  echo "• starting Next.js dev server on :$PORT (log: web/.dev-server-$PORT.log)"
  [ -d "$ROOT/web/node_modules" ] || (cd "$ROOT/web" && npm install)
  (cd "$ROOT/web" && SPENDBENCH_SELF_URL="$URL" nohup npx next dev -p "$PORT" > ".dev-server-$PORT.log" 2>&1 &)
  for _ in $(seq 1 120); do up && break; sleep 1; done
  up || { echo "server did not come up; see web/.dev-server-$PORT.log"; exit 1; }
fi

if [ "${KEEP_REDTEAM:-0}" != "1" ]; then
  echo "• resetting red-team artifacts (tasks_generated.json, scams_registry.json)"
  printf '{\n "version": 1,\n "tasks": []\n}\n' > "$ROOT/agents/spendbench/tasks_generated.json"
  printf '{\n "version": 1,\n "scams": []\n}\n' > "$ROOT/agents/spendbench/scams_registry.json"
fi

echo "• wiping DB & seeding store"
curl -sf -m 120 -X POST "$URL/api/admin/seed" -H 'Content-Type: application/json' -d '{"wipe":true,"reset":true}'; echo

models_json=$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1].split(",")))' "$MODELS")
start_run "{\"models\":$models_json,\"taskCount\":$TASKS,\"guardrail\":\"$GUARDRAIL\",\"name\":\"Baseline: 5 sims × $TASKS tasks\"}"

echo
echo "Ready: $URL   (leaderboard: $URL/api/leaderboard)"
[ -n "${OPENROUTER_API_KEY:-}" ] && echo "(OPENROUTER_API_KEY set: LLM guardrail + failure-attribution judges)" || echo "(no OPENROUTER_API_KEY: simulated agents + heuristic judges)"
