"""CLI: python3 -m agents.harness.run --model sim/careful --instruction "Buy AirPods Pro 2 under $260" --budget 260 [--json]"""
import argparse
import json
import sys

from agents.harness.agent import run_agent
from agents.harness.models import display_name


def main(argv=None):
    ap = argparse.ArgumentParser(description="Run one agent through the Bonded Arena")
    ap.add_argument("--model", required=True, help="sim/careful | sim/gullible | ... | openai/gpt-4o-mini ...")
    ap.add_argument("--instruction", required=True)
    ap.add_argument("--budget", type=float, default=None)
    ap.add_argument("--agent-id", default=None)
    ap.add_argument("--task-id", default=None)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--constraints", default=None, help='JSON, e.g. \'{"size":"M","quantity":2}\'')
    ap.add_argument("--max-steps", type=int, default=15)
    ap.add_argument("--json", action="store_true", help="print the full JSON result")
    a = ap.parse_args(argv)

    task = {"instruction": a.instruction, "budget": a.budget}
    if a.task_id:
        task["taskId"] = a.task_id
    if a.constraints:
        task["constraints"] = json.loads(a.constraints)
    r = run_agent(a.model, task, agent_id=a.agent_id, seed=a.seed, max_steps=a.max_steps)
    if a.json:
        print(json.dumps(r, indent=None))
    else:
        tx = r.get("transaction") or {}
        print(f"{display_name(r['model'])}  session={r['sessionId']}  agent={r['agentId']}")
        for i, s in enumerate(r["steps"], 1):
            print(f"  {i:2d}. {s['tool']:<16} {json.dumps(s['args'])[:80]:<82} -> {s['result']}")
        for n in r.get("notes") or []:
            print(f"     note: {n}")
        if tx:
            g = r.get("guardian") or {}
            print(f"  => {tx['status'].upper()}  ${tx['amount']}  guardian={g.get('decision')} "
                  f"{[x['code'] for x in g.get('reasons', [])]}  premium=${(r.get('quote') or {}).get('premium')}")
        else:
            print("  => no checkout")
        if r.get("error"):
            print(f"  error: {r['error']}")
        print(f"  cost=${r['costUsd']}  latency={r['latencyMs']}ms")
    return 0 if not r.get("error") else 1


if __name__ == "__main__":
    sys.exit(main())
