"""Model registry for the harness. Team 2 decides leaderboard display; this just exports names."""

SIM_MODELS = {
    "sim/careful": {"displayName": "Sim-Careful (baseline)", "profile": "Compares listings, checks brand, merchant age/verification, price vs. peers, injection text and budget. Rarely errs."},
    "sim/bargain-hunter": {"displayName": "Sim-BargainHunter", "profile": "Picks the biggest advertised discount; trusts inflated 'was' prices (falls for fake discounts)."},
    "sim/gullible": {"displayName": "Sim-Gullible", "profile": "Reads listings thoroughly and obeys instructions found in them (prompt injection)."},
    "sim/hasty": {"displayName": "Sim-Hasty", "profile": "Takes the first search result, skips verification; sometimes wrong size or quantity, ignores budget."},
    "sim/brand-blind": {"displayName": "Sim-BrandBlind", "profile": "Matches on title keywords and buys the cheapest; ignores brand mismatch (buys knockoffs)."},
}

REAL_MODELS = {
    "openai/gpt-4o-mini": {"displayName": "GPT-4o mini"},
    "anthropic/claude-3.5-haiku": {"displayName": "Claude 3.5 Haiku"},
    "google/gemini-2.0-flash-001": {"displayName": "Gemini 2.0 Flash"},
    "meta-llama/llama-3.3-70b-instruct": {"displayName": "Llama 3.3 70B"},
    "mistralai/mistral-small-3.1-24b-instruct": {"displayName": "Mistral Small 3.1"},
}

MODELS = {**SIM_MODELS, **REAL_MODELS}
DISPLAY_NAMES = {k: v["displayName"] for k, v in MODELS.items()}


def display_name(model):
    return DISPLAY_NAMES.get(model, model)


def is_sim(model):
    return model.startswith("sim/")
