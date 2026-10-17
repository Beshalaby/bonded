"""OpenRouter chat client: tool calling, JSON mode, retries with backoff and cost tracking (stdlib only).

Env:
  OPENROUTER_API_KEY    enables real models (no key -> only sim/* agents)
  OPENROUTER_BASE_URL   default https://openrouter.ai/api/v1 (point it at scripts/mock_openrouter.py to test offline)
  OPENROUTER_TIMEOUT    per-request timeout in seconds (default 90)
  OPENROUTER_RETRIES    retries on 429 / 5xx / timeouts / network errors (default 4)

chat() always returns a *normalized* assistant message:
  {"role": "assistant", "content": str (never None), "tool_calls": [ {id, type, function: {name, arguments: str}} ],
   "reasoning": str | None}
Use parse_args() to turn a tool call's `arguments` into a dict; it never raises.
"""
import json
import os
import random
import re
import time
import urllib.error
import urllib.request
from agents.common.tls import ssl_context

DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
BASE_URL = (os.environ.get("OPENROUTER_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
OPENROUTER_URL = BASE_URL + "/chat/completions"
API_KEY = os.environ.get("OPENROUTER_API_KEY", "").strip()
HAS_LLM = bool(API_KEY)


def _env_num(name, default, cast=float):
    try:
        return cast(os.environ.get(name) or default)
    except ValueError:
        return default


DEFAULT_TIMEOUT = _env_num("OPENROUTER_TIMEOUT", 90.0)
DEFAULT_RETRIES = _env_num("OPENROUTER_RETRIES", 4, int)

# USD per 1M tokens (input, output). APPROXIMATE: OpenRouter list prices as of Oct 2026
# (https://openrouter.ai/api/v1/models). Used only when the response carries no usage.cost.
PRICES = {
    # current defaults (agents/harness/models.py REAL_MODELS)
    "openai/gpt-5-mini": (0.25, 2.00),
    "anthropic/claude-haiku-4.5": (1.00, 5.00),
    "google/gemini-2.5-flash": (0.30, 2.50),
    "meta-llama/llama-4-maverick": (0.19, 0.65),
    "deepseek/deepseek-v3.2": (0.28, 0.42),
    "qwen/qwen3-235b-a22b-2507": (0.09, 0.55),
    # other common choices
    "openai/gpt-4o-mini": (0.15, 0.60),
    "openai/gpt-4o": (2.50, 10.00),
    "openai/gpt-4.1-mini": (0.40, 1.60),
    "openai/gpt-5-nano": (0.05, 0.40),
    "openai/gpt-5": (1.25, 10.00),
    "openai/gpt-oss-120b": (0.15, 0.60),
    "openai/gpt-6-luna": (0.10, 0.50),
    "anthropic/claude-haiku-5.5": (0.10, 0.50),
    "anthropic/claude-sonnet-4.5": (3.00, 15.00),
    "anthropic/claude-sonnet-5": (2.00, 10.00),
    "google/gemini-2.5-flash-lite": (0.10, 0.40),
    "google/gemini-2.5-pro": (1.25, 10.00),
    "meta-llama/llama-4-scout": (0.10, 0.30),
    "meta-llama/llama-3.3-70b-instruct": (0.10, 0.32),
    "mistralai/mistral-small-3.2-24b-instruct": (0.09, 0.25),
    "mistralai/mistral-small-3.1-24b-instruct": (0.35, 0.56),
    "mistralai/mistral-medium-3.1": (0.40, 2.00),
    "deepseek/deepseek-chat-v3.1": (0.25, 0.95),
    "qwen/qwen3-30b-a3b-instruct-2507": (0.10, 0.30),
    "x-ai/grok-4.3": (1.25, 2.50),
}
DEFAULT_PRICE = (1.00, 3.00)  # unknown model: deliberately on the high side so estimates don't undershoot


def price_of(model):
    base = (model or "").split(":", 1)[0]  # "openai/gpt-5-mini:nitro" -> table entry
    return PRICES.get(model) or PRICES.get(base) or DEFAULT_PRICE


def cost_usd(model, prompt_tokens, completion_tokens):
    pin, pout = price_of(model)
    return (prompt_tokens * pin + completion_tokens * pout) / 1_000_000


class LLMError(RuntimeError):
    def __init__(self, message, status=None, retryable=False, retry_after=0.0):
        super().__init__(message)
        self.status = status
        self.retryable = retryable
        self.retry_after = retry_after


# ----------------------------------------------------------------------------- response normalization
def _text(content):
    """content may be None, a string, or a list of parts ([{type:"text", text}, ...])."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        out = []
        for p in content:
            if isinstance(p, str):
                out.append(p)
            elif isinstance(p, dict) and isinstance(p.get("text"), str):
                out.append(p["text"])
        return "".join(out)
    return str(content)


def _norm_tool_calls(raw, turn_id):
    out = []
    if isinstance(raw, dict):
        raw = [raw]
    if not isinstance(raw, list):
        return out
    seen = set()
    for i, tc in enumerate(raw):
        if not isinstance(tc, dict):
            continue
        fn = tc.get("function") if isinstance(tc.get("function"), dict) else {}
        name = fn.get("name") or tc.get("name") or ""
        args = fn.get("arguments", tc.get("arguments"))
        if args is None or args == "":
            args = "{}"
        elif not isinstance(args, str):  # some providers send an object
            args = json.dumps(args)
        cid = str(tc.get("id") or "").strip()
        if not cid or cid in seen:  # missing / duplicate ids break the tool-result pairing
            cid = f"call_{turn_id}_{i}"
        seen.add(cid)
        out.append({"id": cid, "type": "function", "function": {"name": str(name), "arguments": args}})
    return out


_PY_CALLS = re.compile(r"\[\s*[A-Za-z_]\w*\s*\(.*?\)\s*(?:,\s*[A-Za-z_]\w*\s*\(.*?\)\s*)*\]", re.S)
_FN_TAG = re.compile(r"<function=([A-Za-z_]\w*)>\s*(\{.*?\})\s*</function>", re.S)
_JSON_CALL = re.compile(r"\{\s*\"(?:name|function)\"\s*:\s*\"([A-Za-z_]\w*)\"\s*,\s*\"(?:parameters|arguments)\"\s*:\s*(\{.*?\})\s*\}", re.S)


def _text_tool_calls(content, allowed):
    """Some providers (e.g. Llama served without native tool support) write tool calls as text instead of
    `tool_calls`: Llama's pythonic `[search(query="x", max_price=260)]`, `<function=name>{...}</function>`, or a bare
    `{"name": ..., "parameters": {...}}`. Recover them so the episode isn't scored as a model that gave up.

    Conservative on purpose (a model *quoting* an injected listing must not be executed as acting on it): only
    names from the tools actually offered, and only a block that ends the message (after optional prose).
    Returns (calls as [(name, args_dict)], content_without_the_calls)."""
    import ast
    content = (content or "").rstrip()
    if not allowed:
        return [], content
    trailing = lambda m: m.end() == len(content)
    for m in _PY_CALLS.finditer(content):
        if not trailing(m):
            continue
        try:
            node = ast.parse(m.group(0), mode="eval").body
        except SyntaxError:
            continue
        calls = []
        for c in getattr(node, "elts", []):
            if not (isinstance(c, ast.Call) and isinstance(c.func, ast.Name) and not c.args):
                calls = []
                break
            try:
                calls.append((c.func.id, {k.arg: ast.literal_eval(k.value) for k in c.keywords}))
            except ValueError:
                calls = []
                break
        if any(n not in allowed for n, _ in calls):
            calls = []
        if calls:
            return calls, (content[:m.start()] + content[m.end():]).strip()
    for rx in (_FN_TAG, _JSON_CALL):
        found = []
        for m in rx.finditer(content):
            try:
                found.append((m.group(1), json.loads(m.group(2)), m.span()))
            except ValueError:
                pass
        # every recovered call must be an offered tool, and the block of calls must end the message
        if found and all(n in allowed for n, _, _ in found) and found[-1][2][1] == len(content):
            rest = content
            for _, _, (a, b) in reversed(found):
                rest = rest[:a] + rest[b:]
            return [(n, a) for n, a, _ in found], rest.strip()
    return [], content


def normalize_message(msg, turn_id="0", tool_names=None):
    msg = msg if isinstance(msg, dict) else {}
    reasoning = msg.get("reasoning")
    if not isinstance(reasoning, str):
        reasoning = None
    content = _text(msg.get("content"))
    tool_calls = _norm_tool_calls(msg.get("tool_calls"), turn_id)
    if not tool_calls and content:
        calls, rest = _text_tool_calls(content, set(tool_names or ()))
        if calls:
            tool_calls = _norm_tool_calls([{"name": n, "arguments": a} for n, a in calls], turn_id)
            content = rest
    return {"role": "assistant", "content": content, "tool_calls": tool_calls, "reasoning": reasoning}


def assistant_history_entry(msg):
    """The assistant message to append to the conversation. Empty content is sent as null when there are tool
    calls (some providers reject empty text blocks)."""
    entry = {"role": "assistant", "content": msg.get("content") or (None if msg.get("tool_calls") else "")}
    if msg.get("tool_calls"):
        entry["tool_calls"] = msg["tool_calls"]
    return entry


_FENCE = re.compile(r"^\s*```(?:json|JSON)?\s*([\s\S]*?)\s*```\s*$")


def parse_json_loose(s):
    """json.loads that tolerates code fences, leading prose, trailing commas and an unclosed final brace.
    Returns the parsed value or raises ValueError."""
    if isinstance(s, (dict, list)):
        return s
    s = (s or "").strip()
    if not s:
        raise ValueError("empty")
    m = _FENCE.match(s)
    if m:
        s = m.group(1)
    try:
        return json.loads(s)
    except ValueError:
        pass
    start = min([i for i in (s.find("{"), s.find("[")) if i >= 0], default=-1)
    if start < 0:
        raise ValueError(f"no JSON object in {s[:80]!r}")
    t = s[start:]
    end = max(t.rfind("}"), t.rfind("]"))
    cands = [t[:end + 1]] if end >= 0 else []
    cands.append(t)
    for c in cands:
        for fix in (c, re.sub(r",\s*([}\]])", r"\1", c)):
            try:
                return json.loads(fix)
            except ValueError:
                pass
            opens = fix.count("{") - fix.count("}")
            if 0 < opens <= 3:
                try:
                    return json.loads(fix + "}" * opens)
                except ValueError:
                    pass
    raise ValueError(f"unparseable JSON: {s[:120]!r}")


def parse_args(arguments):
    """Tool-call arguments -> (dict, error_or_None). Never raises."""
    if arguments is None or arguments == "":
        return {}, None
    try:
        v = parse_json_loose(arguments)
    except ValueError as e:
        return {}, f"arguments are not valid JSON ({e})"
    if v is None:
        return {}, None
    if not isinstance(v, dict):
        return {}, f"arguments must be a JSON object, got {type(v).__name__}"
    return v, None


# ----------------------------------------------------------------------------- transport
def _retry_after(headers):
    try:
        v = float((headers or {}).get("Retry-After") or 0)
        return min(max(v, 0), 30)
    except (TypeError, ValueError):
        return 0


def _backoff(attempt, hint=0.0):
    return max(hint, min(20.0, 1.0 * 2 ** attempt)) * random.uniform(0.8, 1.2)


def _post(body, timeout):
    req = urllib.request.Request(OPENROUTER_URL, data=json.dumps(body).encode(), method="POST", headers={
        "Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json",
        "HTTP-Referer": "https://bonded.local", "X-Title": "Bonded SpendBench",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ssl_context()) as r:
            raw = r.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        text = e.read().decode(errors="replace")[:400]
        code = e.code
        raise LLMError(f"OpenRouter HTTP {code}: {text}", code,
                       retryable=code in (408, 409, 425, 429) or code >= 500,
                       retry_after=_retry_after(e.headers)) from None
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:  # incl. socket.timeout
        raise LLMError(f"OpenRouter network error: {type(e).__name__}: {e}", None, retryable=True) from None
    try:
        j = json.loads(raw)
    except ValueError:
        raise LLMError(f"OpenRouter returned non-JSON: {raw[:200]!r}", None, retryable=True) from None
    if isinstance(j, dict) and j.get("error") and not j.get("choices"):
        # OpenRouter can answer 200 with an error object (e.g. upstream provider failure)
        err = j["error"] if isinstance(j["error"], dict) else {"message": str(j["error"])}
        code = err.get("code")
        code = int(code) if isinstance(code, (int, float)) or (isinstance(code, str) and code.isdigit()) else None
        raise LLMError(f"OpenRouter error {code}: {str(err.get('message'))[:300]}", code,
                       retryable=code is None or code == 429 or code >= 500)
    if not isinstance(j, dict) or not isinstance(j.get("choices"), list) or not j["choices"]:
        raise LLMError(f"OpenRouter response has no choices: {raw[:200]!r}", None, retryable=True)
    return j


def chat(model, messages, tools=None, temperature=0.2, timeout=None, retries=None, response_format=None,
         max_tokens=None):
    """One chat completion. Returns (message, usage).

    message: normalized (see module doc). usage: {prompt_tokens, completion_tokens, costUsd, latencyMs, attempts,
    finish_reason}. Retries 429 / 5xx / timeouts / network errors with exponential backoff (+Retry-After)."""
    if not HAS_LLM:
        raise LLMError("OPENROUTER_API_KEY not set; use a sim/* model")
    timeout = DEFAULT_TIMEOUT if timeout is None else timeout
    retries = DEFAULT_RETRIES if retries is None else retries
    body = {"model": model, "messages": messages, "temperature": temperature, "usage": {"include": True}}
    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"
        # Only route to providers that actually support `tools` (otherwise some serve the model without native
        # tool calling and it writes calls as text).
        body["provider"] = {"require_parameters": True}
    if response_format:
        body["response_format"] = response_format
    if max_tokens:
        body["max_tokens"] = max_tokens
    t_start = time.time()
    last = None
    for attempt in range(retries + 1):
        t0 = time.time()
        try:
            j = _post(body, timeout)
        except LLMError as e:
            last = e
            if not e.retryable or attempt == retries:
                break
            time.sleep(_backoff(attempt, e.retry_after))
            continue
        choice = j["choices"][0] if isinstance(j["choices"][0], dict) else {}
        u = j.get("usage") or {}
        pt, ct = int(u.get("prompt_tokens") or 0), int(u.get("completion_tokens") or 0)
        cost = u.get("cost")
        usage = {"prompt_tokens": pt, "completion_tokens": ct,
                 "costUsd": float(cost) if isinstance(cost, (int, float)) and not isinstance(cost, bool) else cost_usd(model, pt, ct),
                 "latencyMs": int((time.time() - t0) * 1000), "wallMs": int((time.time() - t_start) * 1000),
                 "attempts": attempt + 1, "finish_reason": choice.get("finish_reason")}
        names = [t.get("function", {}).get("name") for t in (tools or []) if isinstance(t, dict)]
        return normalize_message(choice.get("message"), turn_id=f"{int(t0 * 1000) % 100000}", tool_names=names), usage
    raise last or LLMError("OpenRouter request failed")


def chat_json(model, system, user, temperature=0.0, timeout=60, retries=None):
    """JSON-mode completion. Returns (parsed_dict, usage). Raises LLMError if the reply is not a JSON object."""
    msg, usage = chat(model, [{"role": "system", "content": system}, {"role": "user", "content": user}],
                      temperature=temperature, timeout=timeout, retries=retries,
                      response_format={"type": "json_object"})
    try:
        v = parse_json_loose(msg["content"])
    except ValueError as e:
        raise LLMError(f"judge reply is not JSON: {e}") from None
    if not isinstance(v, dict):
        raise LLMError("judge reply is not a JSON object")
    return v, usage
