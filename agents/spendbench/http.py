"""Tiny stdlib HTTP helper for SpendBench / red team (Arena admin + bench API)."""
import json
import os
import urllib.error
import urllib.request

ARENA_URL = os.environ.get("ARENA_URL", "http://localhost:3000").rstrip("/")


class HttpError(Exception):
    def __init__(self, status, body):
        super().__init__(f"HTTP {status}: {str(body)[:300]}")
        self.status = status
        self.body = body


def request(method, path, body=None, headers=None, timeout=30, base=None):
    url = (base or ARENA_URL) + path
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode() or "null"
            try:
                return json.loads(raw)
            except ValueError:
                return raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            raw = json.loads(raw)
        except ValueError:
            pass
        raise HttpError(e.code, raw)


def get(path, **kw):
    return request("GET", path, **kw)


def post(path, body, **kw):
    return request("POST", path, body, **kw)


def delete(path, body=None, **kw):
    return request("DELETE", path, body, **kw)


class ProductLookup:
    """Callable id -> full product (incl. trap) via GET /api/admin/products/:id, cached, thread-safe enough."""

    def __init__(self, base=None, extra=None):
        self.base = base
        self.cache = dict(extra or {})

    def add(self, product):
        if product and product.get("id"):
            self.cache[product["id"]] = product

    def __call__(self, pid):
        if pid in self.cache:
            return self.cache[pid]
        try:
            r = get(f"/api/admin/products/{pid}", base=self.base)
            p = r.get("product", r) if isinstance(r, dict) else None
        except Exception:
            p = None
        if p is not None:
            self.cache[pid] = p
        return p
