"""OpenRouter chat client with tool calling + rough cost tracking (stdlib only)."""
import json
import os
import time
import urllib.error
import urllib.request

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
HAS_LLM = bool(API_KEY)

# USD per 1M tokens (input, output) — rough, for leaderboard cost columns.
PRICES = {
    "openai/gpt-4o-mini": (0.15, 0.60),
    "openai/gpt-4o": (2.50, 10.00),
    "openai/gpt-4.1-mini": (0.40, 1.60),
    "openai/gpt-5-mini": (0.25, 2.00),
    "anthropic/claude-3.5-haiku": (0.80, 4.00),
    "anthropic/claude-3.5-sonnet": (3.00, 15.00),
    "anthropic/claude-sonnet-4": (3.00, 15.00),
    "google/gemini-2.0-flash-001": (0.10, 0.40),
    "google/gemini-2.5-flash": (0.30, 2.50),
    "meta-llama/llama-3.3-70b-instruct": (0.13, 0.40),
    "mistralai/mistral-small-3.1-24b-instruct": (0.10, 0.30),
}
DEFAULT_PRICE = (1.00, 3.00)


def cost_usd(model, prompt_tokens, completion_tokens):
    pin, pout = PRICES.get(model, DEFAULT_PRICE)
    return (prompt_tokens * pin + completion_tokens * pout) / 1_000_000


def chat(model, messages, tools=None, temperature=0.2, timeout=90, retries=2):
    """Returns (message_dict, usage_dict). usage has prompt_tokens, completion_tokens, costUsd, latencyMs."""
    if not HAS_LLM:
        raise RuntimeError("OPENROUTER_API_KEY not set; use a sim/* model")
    body = {"model": model, "messages": messages, "temperature": temperature, "usage": {"include": True}}
    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"
    data = json.dumps(body).encode()
    last = None
    for attempt in range(retries + 1):
        t0 = time.time()
        req = urllib.request.Request(OPENROUTER_URL, data=data, method="POST", headers={
            "Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json",
            "HTTP-Referer": "https://bonded.local", "X-Title": "Bonded Arena",
        })
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                j = json.loads(r.read().decode())
            if "choices" not in j:
                raise RuntimeError(f"bad response: {str(j)[:300]}")
            u = j.get("usage") or {}
            pt, ct = int(u.get("prompt_tokens") or 0), int(u.get("completion_tokens") or 0)
            cost = u.get("cost")
            usage = {"prompt_tokens": pt, "completion_tokens": ct,
                     "costUsd": float(cost) if isinstance(cost, (int, float)) else cost_usd(model, pt, ct),
                     "latencyMs": int((time.time() - t0) * 1000)}
            return j["choices"][0]["message"], usage
        except urllib.error.HTTPError as e:
            last = RuntimeError(f"OpenRouter {e.code}: {e.read().decode(errors='replace')[:300]}")
            if e.code < 500 and e.code != 429:
                break
        except Exception as e:  # network / parse
            last = e
        time.sleep(1.5 * (attempt + 1))
    raise last
