# Shared helpers for setup.sh / seed_history.sh (sourced; expects URL).
up() { curl -s -o /dev/null -m 5 -w '%{http_code}' "$URL/api/leaderboard" 2>/dev/null | grep -q 200; }

json_get() { python3 -c 'import json,sys; d=json.load(sys.stdin); 
for k in sys.argv[1].split("."): d=d[k]
print(d)' "$1"; }

# start_run '<json body>' — POST /api/runs then poll until the run completes (exits non-zero if it fails).
start_run() {
  local body="$1" resp id status
  resp=$(curl -sf -m 60 -X POST "$URL/api/runs" -H 'Content-Type: application/json' -d "$body") || { echo "POST /api/runs failed"; exit 1; }
  id=$(echo "$resp" | json_get run.id)
  echo "• run $id started: $(echo "$resp" | json_get run.name)"
  while :; do
    sleep 2
    status=$(curl -sf -m 30 "$URL/api/runs/$id" | python3 -c 'import json,sys; r=json.load(sys.stdin)["run"]; print(r["status"], "%d/%d" % (r["progress"]["done"], r["progress"]["total"]), r.get("error") or "")')
    printf '\r  %s        ' "$status"
    case "$status" in
      completed*) echo; break ;;
      failed*) echo; echo "run $id failed"; exit 1 ;;
    esac
  done
  LAST_RUN_ID="$id"
}
