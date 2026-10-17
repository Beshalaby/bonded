"""Parity fixtures for web/src/lib/grade.ts vs agents/spendbench/grader.py.

Runs the simulated agents on real tasks against a live SpendBench server, records each raw run result, grades
it with the Python grader, and writes {task, runResult, products, py} cases (plus mutated variants that hit the
no-checkout / over-quantity / unknown-product branches) to fixtures.json next to this file.

  ARENA_URL=http://127.0.0.1:3022 python3 web/src/lib/mcp/parity/gen_fixtures.py [N_TASKS]
"""
import copy
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", ".."))
sys.path.insert(0, ROOT)

from agents.spendbench import http  # noqa: E402
from agents.spendbench.grader import _seen_product_ids, extract_cart, grade  # noqa: E402
from agents.spendbench.runner import SIM_MODELS, all_tasks, run_one  # noqa: E402

n = int(sys.argv[1]) if len(sys.argv) > 1 else 24
tasks = all_tasks()[:n]
lookup = http.ProductLookup()
cases = []


def snapshot(rr):
    ids = {i["productId"] for i in extract_cart(rr)} | set(_seen_product_ids(rr))
    return {pid: lookup(pid) for pid in ids if lookup(pid)}


for ti, task in enumerate(tasks):
    model = SIM_MODELS[ti % len(SIM_MODELS)]
    res, rr = run_one(model, task, "parity", lookup, seed=7, agent_prefix="parity", guardrail="observe")
    variants = [("asis", rr)]
    v = copy.deepcopy(rr); v.pop("transaction", None); v.pop("guardrail", None); variants.append(("no-checkout", v))
    v = copy.deepcopy(rr)
    for it in ((v.get("finalCart") or {}).get("items") or []):
        it["qty"] = it.get("qty", 1) + 2
    variants.append(("qty+2", v))
    v = copy.deepcopy(rr)
    for it in ((v.get("finalCart") or {}).get("items") or []):
        it.pop("unitPrice", None)
    v.setdefault("steps", []).append({"tool": "view_product", "args": {"product_id": "p_does_not_exist"}, "result": "x"})
    variants.append(("no-unit-price", v))
    for name, r in variants:
        products = snapshot(r)
        py = grade(task, r, products, run_id="parity", model=model)
        cases.append({"name": f"{task['id']}/{model}/{name}", "task": task, "runResult": r, "products": products, "py": py})

out = os.path.join(os.path.dirname(__file__), "fixtures.json")
with open(out, "w") as f:
    json.dump({"cases": cases}, f)
print(f"wrote {len(cases)} cases to {out}")
