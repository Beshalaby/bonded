"""Scripted end-to-end MCP client for SpendBench's /api/mcp (JSON-RPC 2.0 over Streamable HTTP, stdlib only).

  python3 web/src/lib/mcp/e2e_client.py http://127.0.0.1:3000/api/mcp [task_id] [--greedy]

Plays a careful shopper (or, with --greedy, takes the cheapest match) and prints every exchange.
"""
import json
import sys
import urllib.error
import urllib.request

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000/api/mcp"
TASK = next((a for a in sys.argv[2:] if not a.startswith("--")), "airpods-pro-2")
GREEDY = "--greedy" in sys.argv
sid, n = None, 0


def rpc(method, params=None, notify=False, raw=None, headers=None):
    global sid, n
    n += 1
    msg = raw if raw is not None else {"jsonrpc": "2.0", "method": method, **({} if notify else {"id": n}), **({"params": params} if params is not None else {})}
    h = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18"}
    if sid:
        h["Mcp-Session-Id"] = sid
    h.update(headers or {})
    req = urllib.request.Request(URL, data=json.dumps(msg).encode(), headers=h, method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            sid = r.headers.get("Mcp-Session-Id") or sid
            body = r.read().decode()
            return r.status, (json.loads(body) if body else None)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "null")


def tool(name, args=None):
    st, d = rpc("tools/call", {"name": name, "arguments": args or {}})
    r = d["result"]
    text = r["content"][0]["text"]
    out = text if r.get("isError") else json.loads(text)
    print(f"  tools/call {name}({json.dumps(args or {})[:80]}) -> {'ERROR ' + text if r.get('isError') else json.dumps(out)[:160]}")
    return out, r.get("isError")


def check(label, cond):
    print(f"{'PASS' if cond else 'FAIL'}  {label}")
    if not cond:
        global failures
        failures += 1


failures = 0
st, d = rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "scripted-e2e", "version": "1.0"}})
check(f"initialize -> {st}, protocol {d['result']['protocolVersion']}, session {sid}", st == 200 and sid and d["result"]["capabilities"]["tools"])
st, _ = rpc("notifications/initialized", notify=True)
check(f"notifications/initialized -> {st}", st == 202)
st, d = rpc("ping")
check("ping -> {}", d.get("result") == {})
st, d = rpc("tools/list")
names = [t["name"] for t in d["result"]["tools"]]
check(f"tools/list -> {names}", {"list_tasks", "start_task", "search_products", "view_product", "add_to_cart", "remove_from_cart", "view_cart", "checkout"} <= set(names))
st, d = rpc("nope/method")
check(f"unknown method -> error {d['error']['code']}", d["error"]["code"] == -32601)
st, d = rpc(None, raw=[{"jsonrpc": "2.0", "id": "b1", "method": "ping"}, {"jsonrpc": "2.0", "method": "notifications/initialized"}])
check(f"batch -> {len(d)} reply", isinstance(d, list) and len(d) == 1 and d[0]["id"] == "b1")
st, d = rpc("ping", headers={"MCP-Protocol-Version": "1999-01-01"})
check(f"bad protocol header -> {st}", st == 400)
st, d = rpc("ping", headers={"Origin": "http://evil.example"})
check(f"foreign Origin -> {st}", st == 403)
_, err = tool("add_to_cart", {"product_id": "p_0001", "quantity": 1})
check("cart before start_task is a tool error (isError)", err)
_, err = tool("start_task", {"task_id": "airpods"})
check("unknown task suggests ids", err)

tasks, _ = tool("list_tasks", {"limit": 3})
check(f"list_tasks -> {tasks['count']} tasks, no tags leaked", "tags" not in tasks["tasks"][0])
start, _ = tool("start_task", {"task_id": TASK})
check(f"start_task -> {start['evaluated_as']}", start["session_id"].startswith("ses_"))
res, _ = tool("search_products", {"query": start["request"].split(",")[0].replace("Buy ", "")})
leak = any("trap" in p or "marketPrice" in p for p in res["products"])
check(f"search -> {res['count']} listings, no trap/marketPrice", res["count"] > 0 and not leak)
budget = start["budget_usd"]
cands = [p for p in res["products"] if p["price"] <= budget]
if GREEDY:
    pick = min(cands, key=lambda p: p["price"])
else:
    cands = [p for p in cands if p.get("merchantVerified") and p["price"] >= 0.6 * p["listPrice"]]
    pick = max(cands, key=lambda p: (p["reviewCount"], p["rating"]))
v, _ = tool("view_product", {"product_id": pick["id"]})
check("view_product hides trap/marketPrice", "trap" not in v["product"] and "marketPrice" not in v["product"])
tool("add_to_cart", {"product_id": pick["id"], "quantity": 1})
cart, _ = tool("view_cart")
out, _ = tool("checkout", {"reasoning": f"{pick['title']} from {pick.get('merchantName')} at ${pick['price']} is within ${budget}."})
g = out["grade"]
check(f"checkout graded: {g['verdict']} ({g['outcome']}) amount ${g['amount']}, reasons {g['reasons']}", g["verdict"] in ("PASS", "FAIL"))
_, err = tool("view_cart")
check("tools after checkout -> 'task finished' error", err)
print("trace:", out["links"]["trace"])
print("replay:", out["links"]["replay"])
req = urllib.request.Request(URL, method="DELETE", headers={"Mcp-Session-Id": sid})
with urllib.request.urlopen(req) as r:
    check(f"DELETE session -> {r.status}", r.status == 200)
print(f"\n{'ALL CHECKS PASSED' if not failures else f'{failures} FAILED'}")
sys.exit(1 if failures else 0)
