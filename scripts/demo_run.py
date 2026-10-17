"""Run one agent on one task (used by the /demo control panel).

  python3 scripts/demo_run.py --model sim/hasty --task-id patagonia-fleece --agent-id demo-dash --seed 3
  python3 scripts/demo_run.py --model sim/careful --instruction "Buy AirPods Pro 2" --budget 260

Prints the harness result JSON on stdout (last line). Uses the Team 1 harness library
(agents.harness.agent.run_agent) so we can pass full constraints + a seed; falls back to the CLI.
"""
import argparse
import inspect
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)


def load_task(task_id):
    path = os.path.join(ROOT, "agents", "spendbench", "tasks.json")
    try:
        with open(path) as f:
            data = json.load(f)
    except (OSError, ValueError):
        return None
    tasks = data.get("tasks", []) if isinstance(data, dict) else data
    for t in tasks:
        if t.get("id") == task_id:
            return t
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--task-id")
    ap.add_argument("--instruction")
    ap.add_argument("--budget", type=float)
    ap.add_argument("--constraints", default=None, help="JSON object")
    ap.add_argument("--agent-id")
    ap.add_argument("--seed", type=int, default=None)
    a = ap.parse_args()

    task = {}
    if a.task_id:
        t = load_task(a.task_id) or {}
        task = {"taskId": a.task_id, "instruction": t.get("instruction"), "budget": t.get("budget"),
                "constraints": t.get("constraints") or {}}
    if a.instruction:
        task["instruction"] = a.instruction
    if a.budget is not None:
        task["budget"] = a.budget
    if a.constraints:
        task["constraints"] = json.loads(a.constraints)
    if not task.get("instruction") or task.get("budget") is None:
        print(json.dumps({"error": "need --task-id or --instruction/--budget"}))
        return 2

    try:
        from agents.harness.agent import run_agent  # Team 1
        kwargs = {"agent_id": a.agent_id}
        try:
            params = inspect.signature(run_agent).parameters
        except (TypeError, ValueError):
            params = {}
        if a.seed is not None and "seed" in params:
            kwargs["seed"] = a.seed
        res = run_agent(a.model, task, **kwargs)
    except ImportError:
        cmd = [sys.executable, "-m", "agents.harness.run", "--model", a.model, "--instruction", task["instruction"],
               "--budget", str(task["budget"]), "--json"]
        if a.agent_id:
            cmd += ["--agent-id", a.agent_id]
        if task.get("taskId"):
            cmd += ["--task-id", task["taskId"]]
        out = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=300)
        sys.stderr.write(out.stderr)
        print(out.stdout.strip().splitlines()[-1] if out.stdout.strip() else json.dumps({"error": "no output"}))
        return out.returncode
    print(json.dumps(res, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
