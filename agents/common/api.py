"""Arena HTTP client (stdlib only). Base URL from ARENA_URL (default http://localhost:3000)."""
import json
import os
import urllib.error
import urllib.parse
import urllib.request

ARENA_URL = os.environ.get("ARENA_URL", "http://localhost:3000").rstrip("/")


def auth_headers():
    """Credentials for the Arena server, from the environment (never from task data).
    BONDED_INTERNAL_TOKEN: service token the server hands to the runners it spawns (bench/admin routes).
    BONDED_AGENT_KEY: optional per-agent API key; the server then derives agentId/model from it."""
    h = {}
    tok = os.environ.get("BONDED_INTERNAL_TOKEN", "").strip()
    if tok:
        h["x-bonded-internal"] = tok
    key = os.environ.get("BONDED_AGENT_KEY", "").strip()
    if key:
        h["Authorization"] = "Bearer " + key
    return h


class ArenaError(Exception):
    def __init__(self, status, message, body=None):
        super().__init__(f"HTTP {status}: {message}")
        self.status = status
        self.message = message
        self.body = body


def request(method, path, body=None, headers=None, base=None, timeout=60):
    url = (base or ARENA_URL).rstrip("/") + path
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    h.update(auth_headers())
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode() or "null"
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            j = json.loads(raw)
            msg = j.get("error", raw) if isinstance(j, dict) else raw
        except Exception:
            j, msg = None, raw[:300]
        raise ArenaError(e.code, msg, j) from None


class Arena:
    """One client per agent session."""

    def __init__(self, base=None):
        self.base = (base or ARENA_URL).rstrip("/")
        self.session_id = None

    def _h(self):
        return {"x-session-id": self.session_id} if self.session_id else {}

    def _req(self, method, path, body=None):
        return request(method, path, body, headers=self._h(), base=self.base)

    # admin
    def seed(self, reset=False, wipe=False):
        return self._req("POST", "/api/admin/seed", {"reset": reset, "wipe": wipe})

    def admin_product(self, pid):
        return self._req("GET", f"/api/admin/products/{urllib.parse.quote(pid)}")

    # session
    def start_session(self, agent_id, model, instruction, budget, constraints=None, task_id=None,
                      run_id=None, guardrail=None):
        body = {"agentId": agent_id, "model": model, "instruction": instruction, "budget": budget,
                "constraints": constraints or None, "taskId": task_id}
        if run_id:
            body["runId"] = run_id
        if guardrail:
            body["guardrail"] = guardrail  # off | observe (default) | enforce
        r = self._req("POST", "/api/arena/sessions", body)
        self.session_id = r["sessionId"]
        return r

    def session(self):
        return self._req("GET", f"/api/arena/sessions/{self.session_id}")

    # agent tools
    def search(self, query, category=None, max_price=None, limit=20):
        qs = {"q": query or "", "limit": limit}
        if category:
            qs["category"] = category
        if max_price is not None:
            qs["maxPrice"] = max_price
        return self._req("GET", "/api/arena/search?" + urllib.parse.urlencode(qs))["products"]

    def view_product(self, pid):
        return self._req("GET", f"/api/arena/products/{urllib.parse.quote(str(pid))}")

    def add_to_cart(self, pid, qty=1):
        return self._req("POST", "/api/arena/cart", {"sessionId": self.session_id, "productId": pid, "qty": qty})

    def remove_from_cart(self, pid):
        return self._req("DELETE", "/api/arena/cart", {"sessionId": self.session_id, "productId": pid})

    def view_cart(self):
        return self._req("GET", "/api/arena/cart?" + urllib.parse.urlencode({"sessionId": self.session_id}))

    def checkout(self, reasoning=""):
        """-> {transaction, guardrail}. Guardrail runs in the session's mode; only `enforce` can block."""
        return self._req("POST", "/api/arena/checkout", {"sessionId": self.session_id, "reasoning": reasoning})

    def note(self, text, kind="thought"):
        """Record the agent's reasoning in the trace (actor agent, action `reasoning`). kind: thought | plan | decision.
        Best effort: a server without the note route (or a closed session) never breaks the run."""
        if not self.session_id or not (text or "").strip():
            return None
        try:
            return self._req("POST", f"/api/arena/sessions/{urllib.parse.quote(self.session_id)}/note",
                             {"text": str(text)[:1000], "kind": kind if kind in ("thought", "plan", "decision") else "thought"})
        except (ArenaError, OSError):
            return None

    def trace(self):
        return self._req("GET", f"/api/traces/{self.session_id}")
