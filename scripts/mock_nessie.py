#!/usr/bin/env python3
"""Mock Capital One Nessie API: a stdlib HTTP server with in-memory state, for testing Bonded's real HTTP
client path with no key and no network.

  python3 scripts/mock_nessie.py --port 8788 [--require-key]
  NESSIE_API_KEY=mock NESSIE_BASE_URL=http://127.0.0.1:8788 npx next dev   (in web/)

Endpoints (Nessie's REST shape; `?key=` is accepted and ignored unless --require-key):
  GET|POST /customers                    POST -> 201 {code, message, objectCreated: {_id, first_name, last_name, address}}
  GET      /customers/{id}
  GET|POST /customers/{id}/accounts      POST body {type, nickname, rewards, balance} -> objectCreated (+ account_number)
  GET      /accounts, /accounts/{id}     account incl. balance
  GET|POST /merchants                    POST body {name, category, address, geocode}
  GET      /merchants/{id}
  GET|POST /accounts/{id}/purchases      POST body {merchant_id, medium, purchase_date, amount, status, description}
  GET      /purchases/{id}
  GET|POST /accounts/{id}/deposits       POST body {medium, transaction_date, status, amount, description}
  Validation errors -> 400 {code: 400, message, culprit: [fields]}; unknown ids -> 404 {code: 404, message}.

Fault injection (testing retries / error handling):
  POST /_mock/fail {"codes": [500, 429, "error200"]}   the next requests fail with these (error200 = HTTP 200 + {code: 500})
  GET  /_mock/stats                                     request counters and object counts
  POST /_mock/reset                                     clear all state
"""
import argparse
import json
import random
import re
import secrets
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

LOCK = threading.Lock()
STATE = {}
FAULTS = []
STATS = {"requests": 0, "byRoute": {}, "faults": 0}
REQUIRE_KEY = False
STATES = {"AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
          "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD",
          "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"}


def reset():
    STATE.clear()
    STATE.update(customers={}, accounts={}, merchants={}, purchases={}, deposits={})
    FAULTS.clear()
    STATS.update(requests=0, byRoute={}, faults=0)


reset()


def oid():
    return secrets.token_hex(12)


def check_address(a, culprit, prefix="address"):
    if not isinstance(a, dict):
        culprit.append(prefix)
        return
    for k in ("street_number", "street_name", "city", "state", "zip"):
        if not isinstance(a.get(k), str) or not a.get(k):
            culprit.append(f"{prefix}.{k}")
    if isinstance(a.get("state"), str) and a["state"] not in STATES:
        culprit.append(f"{prefix}.state")
    if isinstance(a.get("zip"), str) and not re.fullmatch(r"\d{5}", a["zip"]):
        culprit.append(f"{prefix}.zip")


class Handler(BaseHTTPRequestHandler):
    server_version = "MockNessie/1.0"

    def log_message(self, fmt, *args):  # quiet; never echo query strings (they carry the key)
        pass

    # ------------------------------------------------------------ helpers
    def send(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def err(self, status, message, culprit=None):
        body = {"code": status, "message": message}
        if culprit:
            body["culprit"] = culprit
        self.send(status, body)

    def created(self, message, obj):
        self.send(201, {"code": 201, "message": message, "objectCreated": obj})

    def body(self):
        n = int(self.headers.get("content-length") or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return None

    def route(self, method):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        parts = [p for p in u.path.split("/") if p]
        with LOCK:
            STATS["requests"] += 1
            key = method + " /" + "/".join("{id}" if re.fullmatch(r"[0-9a-f]{24}", p) else p for p in parts)
            STATS["byRoute"][key] = STATS["byRoute"].get(key, 0) + 1
        if parts[:1] == ["_mock"]:
            return self.mock_admin(method, parts)
        if REQUIRE_KEY and not q.get("key", [""])[0]:
            return self.err(401, "Unauthorized: missing key")
        with LOCK:
            fault = FAULTS.pop(0) if FAULTS else None
            if fault is not None:
                STATS["faults"] += 1
        if fault == "error200":
            return self.send(200, {"code": 500, "message": "mock: injected error in body"})
        if isinstance(fault, int):
            return self.err(fault, f"mock: injected {fault}")
        with LOCK:
            return self.dispatch(method, parts)

    def mock_admin(self, method, parts):
        if parts == ["_mock", "fail"] and method == "POST":
            b = self.body() or {}
            with LOCK:
                FAULTS.extend(b.get("codes", []))
            return self.send(200, {"queued": len(FAULTS)})
        if parts == ["_mock", "reset"] and method == "POST":
            with LOCK:
                reset()
            return self.send(200, {"ok": True})
        if parts == ["_mock", "stats"]:
            with LOCK:
                return self.send(200, {**STATS, "counts": {k: len(v) for k, v in STATE.items()}})
        return self.err(404, "unknown mock route")

    # ------------------------------------------------------------ the API
    def dispatch(self, method, parts):
        S = STATE
        if method == "GET":
            if parts == ["customers"]:
                return self.send(200, list(S["customers"].values()))
            if len(parts) == 2 and parts[0] == "customers":
                c = S["customers"].get(parts[1])
                return self.send(200, c) if c else self.err(404, "Invalid customer id")
            if len(parts) == 3 and parts[0] == "customers" and parts[2] == "accounts":
                if parts[1] not in S["customers"]:
                    return self.err(404, "Invalid customer id")
                return self.send(200, [a for a in S["accounts"].values() if a["customer_id"] == parts[1]])
            if parts == ["accounts"]:
                return self.send(200, list(S["accounts"].values()))
            if len(parts) == 2 and parts[0] == "accounts":
                a = S["accounts"].get(parts[1])
                return self.send(200, a) if a else self.err(404, "Invalid account id")
            if parts == ["merchants"]:
                return self.send(200, list(S["merchants"].values()))
            if len(parts) == 2 and parts[0] == "merchants":
                m = S["merchants"].get(parts[1])
                return self.send(200, m) if m else self.err(404, "Invalid merchant id")
            if len(parts) == 3 and parts[0] == "accounts" and parts[2] in ("purchases", "deposits"):
                if parts[1] not in S["accounts"]:
                    return self.err(404, "Invalid account id")
                field = "payer_id" if parts[2] == "purchases" else "payee_id"
                return self.send(200, [x for x in S[parts[2]].values() if x[field] == parts[1]])
            if len(parts) == 2 and parts[0] in ("purchases", "deposits"):
                x = S[parts[0]].get(parts[1])
                return self.send(200, x) if x else self.err(404, "Invalid id")
            return self.err(404, "Not found")

        b = self.body()
        if b is None or not isinstance(b, dict):
            return self.err(400, "Invalid JSON body")
        culprit = []
        if parts == ["customers"]:
            for k in ("first_name", "last_name"):
                if not isinstance(b.get(k), str) or not b.get(k):
                    culprit.append(k)
            check_address(b.get("address"), culprit)
            if culprit:
                return self.err(400, "Customer creation failed", culprit)
            c = {"_id": oid(), "first_name": b["first_name"], "last_name": b["last_name"], "address": b["address"]}
            S["customers"][c["_id"]] = c
            return self.created("Created customer", c)
        if len(parts) == 3 and parts[0] == "customers" and parts[2] == "accounts":
            if parts[1] not in S["customers"]:
                return self.err(404, "Invalid customer id")
            if b.get("type") not in ("Credit Card", "Checking", "Savings"):
                culprit.append("type")
            if not isinstance(b.get("nickname"), str) or not b.get("nickname"):
                culprit.append("nickname")
            for k in ("rewards", "balance"):
                if not isinstance(b.get(k), int) or isinstance(b.get(k), bool):
                    culprit.append(k)
            if culprit:
                return self.err(400, "Account creation failed", culprit)
            a = {"_id": oid(), "type": b["type"], "nickname": b["nickname"], "rewards": b["rewards"], "balance": b["balance"],
                 "account_number": b.get("account_number") or "".join(random.choice("0123456789") for _ in range(16)),
                 "customer_id": parts[1]}
            S["accounts"][a["_id"]] = a
            return self.created("Account created", a)
        if parts == ["merchants"]:
            if not isinstance(b.get("name"), str) or not b.get("name"):
                culprit.append("name")
            if "address" in b:
                check_address(b["address"], culprit)
            g = b.get("geocode")
            if not isinstance(g, dict) or not all(isinstance(g.get(k), (int, float)) for k in ("lat", "lng")):
                culprit.append("geocode")
            if culprit:
                return self.err(400, "Merchant creation failed", culprit)
            cat = b.get("category", [])
            m = {"_id": oid(), "name": b["name"], "category": cat if isinstance(cat, list) else [cat],
                 "address": b.get("address"), "geocode": b["geocode"], "creation_date": "2026-01-01"}
            S["merchants"][m["_id"]] = m
            return self.created("Created merchant", m)
        if len(parts) == 3 and parts[0] == "accounts" and parts[2] in ("purchases", "deposits"):
            acct = S["accounts"].get(parts[1])
            if not acct:
                return self.err(404, "Invalid account id")
            if b.get("medium") not in ("balance", "rewards"):
                culprit.append("medium")
            amt = b.get("amount")
            if not isinstance(amt, (int, float)) or isinstance(amt, bool) or amt <= 0:
                culprit.append("amount")
            date_key = "purchase_date" if parts[2] == "purchases" else "transaction_date"
            if date_key in b and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(b[date_key])):
                culprit.append(date_key)
            if parts[2] == "purchases":
                if b.get("merchant_id") not in S["merchants"]:
                    if not culprit:
                        return self.err(404, "Invalid merchant id")
                    culprit.append("merchant_id")
            if culprit:
                return self.err(400, "Transaction creation failed", culprit)
            x = {"_id": oid(), "type": "merchant" if parts[2] == "purchases" else "deposit", "medium": b["medium"],
                 "amount": amt, "status": b.get("status", "pending"), "description": b.get("description", "")}
            if parts[2] == "purchases":
                x.update(merchant_id=b["merchant_id"], purchase_date=b.get("purchase_date"), payer_id=parts[1])
                acct["balance"] = round(acct["balance"] - amt, 2)
                msg = "Created purchase and added it to the account"
            else:
                x.update(transaction_date=b.get("transaction_date"), payee_id=parts[1])
                acct["balance"] = round(acct["balance"] + amt, 2)
                msg = "Created deposit and added it to the account"
            S[parts[2]][x["_id"]] = x
            return self.created(msg, x)
        return self.err(404, "Not found")

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")


def main():
    global REQUIRE_KEY
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8788)
    ap.add_argument("--require-key", action="store_true", help="reject requests without ?key=")
    a = ap.parse_args()
    REQUIRE_KEY = a.require_key
    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    print(f"mock nessie on http://{a.host}:{srv.server_address[1]}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    sys.exit(0)


if __name__ == "__main__":
    main()
