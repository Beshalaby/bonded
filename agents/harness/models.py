"""Model registry for the harness. Team 2 decides leaderboard display; this just exports names."""

SIM_MODELS = {
    "sim/careful": {"displayName": "Sim-Careful (baseline)", "profile": "Compares listings, checks brand, merchant age/verification, price vs. peers, injection text and budget. Rarely errs."},
    "sim/bargain-hunter": {"displayName": "Sim-BargainHunter", "profile": "Picks the biggest advertised discount; trusts inflated 'was' prices (falls for fake discounts)."},
    "sim/gullible": {"displayName": "Sim-Gullible", "profile": "Reads listings thoroughly and obeys instructions found in them (prompt injection)."},
    "sim/hasty": {"displayName": "Sim-Hasty", "profile": "Takes the first search result, skips verification; sometimes wrong size or quantity, ignores budget."},
    "sim/brand-blind": {"displayName": "Sim-BrandBlind", "profile": "Matches on title keywords and buys the cheapest; ignores brand mismatch (buys knockoffs)."},
}

# Default real models: six widely known, cheap/fast tool-calling models across providers, as listed on
# https://openrouter.ai/api/v1/models (Oct 2026). Prices (USD / 1M tokens in, out) are approximate; the
# authoritative table used for cost accounting is agents/common/llm.py PRICES.
REAL_MODELS = {
    "openai/gpt-5-mini": {"displayName": "GPT-5 mini", "provider": "OpenAI", "price": (0.25, 2.00)},
    "anthropic/claude-haiku-4.5": {"displayName": "Claude Haiku 4.5", "provider": "Anthropic", "price": (1.00, 5.00)},
    "google/gemini-2.5-flash": {"displayName": "Gemini 2.5 Flash", "provider": "Google", "price": (0.30, 2.50)},
    "meta-llama/llama-4-maverick": {"displayName": "Llama 4 Maverick", "provider": "Meta", "price": (0.19, 0.65)},
    "deepseek/deepseek-v3.2": {"displayName": "DeepSeek V3.2", "provider": "DeepSeek", "price": (0.28, 0.42)},
    "qwen/qwen3-235b-a22b-2507": {"displayName": "Qwen3 235B", "provider": "Qwen", "price": (0.09, 0.55)},
}
DEFAULT_REAL_MODELS = list(REAL_MODELS)

MODELS = {**SIM_MODELS, **REAL_MODELS}
DISPLAY_NAMES = {k: v["displayName"] for k, v in MODELS.items()}


# Bonded Shield: `bonded/shield:<base>` runs <base> (a real model or a sim policy) with every tool routed through
# Bonded Shield (agents/harness/shield.py). `bonded/shield-nomarket:<base>` hides the market price lookup from
# Shield (blind LLM estimate only).
SHIELD_VARIANTS = ("shield", "shield-nomarket")
SHIELD_PROVIDER = "Bonded"


def parse_shield(model):
    """'bonded/shield:openai/gpt-5-mini' -> ('shield', 'openai/gpt-5-mini'); anything else -> None."""
    m = model or ""
    if not m.startswith("bonded/") or ":" not in m:
        return None
    variant, base = m[len("bonded/"):].split(":", 1)
    return (variant, base) if variant in SHIELD_VARIANTS and base else None


def base_model(model):
    """The model that actually does the shopping (strips the Bonded Shield wrapper)."""
    s = parse_shield(model)
    return s[1] if s else model


def display_name(model):
    s = parse_shield(model)
    if s:
        base = display_name(s[1]).replace(" (baseline)", "").replace(" (sim)", "")
        return f"Bonded Shield ({base})" if s[0] == "shield" else f"Bonded Shield ({base}, no market data)"
    return DISPLAY_NAMES.get(model, model)


def provider(model):
    if parse_shield(model):
        return SHIELD_PROVIDER
    if model in MODELS and MODELS[model].get("provider"):
        return MODELS[model]["provider"]
    return "Simulated" if is_sim(model) else (model.split("/", 1)[0] if "/" in model else "Unknown")


def is_sim(model):
    """Simulated policy (no LLM), including Shield driving a sim base (bonded/shield:sim/careful)."""
    return base_model(model or "").startswith("sim/")
