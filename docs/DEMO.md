# Bonded: 2-minute demo run-of-show

Story in one line: **agents now spend money, the store is full of traps they can't see, and Bonded measures, guards and audits
them, with a benchmark that gets harder every time an agent is fooled.**

Everything below works with no API key (simulated agents and heuristic judges). The last section covers real models.


## Put it online for judges (Cloudflare Tunnel)

```bash
scripts/public.sh            # Ctrl+C stops everything; add --rebuild to force a fresh build
```

One command: preflight checks, logins on (admin token created once in `web/.env.local`), a production build,
a free Cloudflare quick tunnel, the server on the demo data with the tunnel hostname allowed for MCP, keep-awake,
and checks from the internet. It prints the public `https://….trycloudflare.com` link, your admin sign-in, and the
Penny / SpendBench MCP addresses. Pages opened through that link (`/connect`, `/penny#agents`) show snippets with
the public address, so judges can copy them as-is.

- Stop the dev server first (`pkill -f "next dev"`): one server owns `web/.data`.
- The link changes every time the script starts; start it once before judging and leave it running.
- The laptop must stay on and online. Sign in at `/login` with the printed admin token before running models,
  the red team or Penny's web search (everyone else can browse, check listings and connect agents).

## Pre-flight (T-15 min)

**The current pitch script and run-of-show are in [PITCH.md](PITCH.md).** Use `scripts/preflight.sh` (read-only) to
check everything before going on stage.

> **Do not run `scripts/rehearse.sh`, `scripts/setup.sh` or `scripts/seed_history.sh` against the demo server.** They
> re-seed the store and wipe the real-model results, wallets and red-team history. Use them only on a throwaway data
> directory (`SPENDBENCH_DATA_DIR=/tmp/x`).

## Run-of-show and fallbacks

See [PITCH.md](PITCH.md): slide-by-slide script with timings, the live moment on slide 5, the replay fallback, and
likely questions.

## Real models (when an `OPENROUTER_API_KEY` exists)

The key must be in the **server's** environment when it starts. Spawned runs inherit it.

```bash
cd web && OPENROUTER_API_KEY=sk-or-... npm run dev          # also switches the guardrail + attribution judges to LLM
scripts/real_models.sh                                     # 30 tasks × 6 default models: prints a cost estimate, asks, runs, prints the leaderboard
scripts/real_models.sh -n                                  # estimate only
MODELS=openai/gpt-5-mini,sim/careful TASKS=10 scripts/real_models.sh -y
```

- **Default models** live in `agents/harness/models.py`: GPT-5 mini, Claude Haiku 4.5, Gemini 2.5 Flash, Llama 4 Maverick, DeepSeek V3.2
  and Qwen3 235B. Prices (approximate, from OpenRouter, Oct 2026) are in `agents/common/llm.py` `PRICES`.
- **Cost.** The estimate for 30 × 6 is about **$2.30** including judges. Budget up to 2× for verbose models.
- **On stage.** In `/live`, pick a real model in the **Model** dropdown (it says "(needs key)" without one). Its own words stream as the
  reasoning notes. Real models are slower and non-deterministic, so **pre-record**: run it once before the talk and keep its `/live?replay=` tab.
- **Rehearse offline first.** The mock OpenRouter exercises the whole real-model path with no key:
  ```bash
  python3 scripts/mock_openrouter.py --port 8787 --chaos 0.1       # scripted shopper + judges + attacker, random 429/5xx
  cd web && OPENROUTER_API_KEY=mock OPENROUTER_BASE_URL=http://127.0.0.1:8787 npm run dev
  URL=http://127.0.0.1:3000 scripts/real_models.sh -y
  ```
  Mock personas are `mock/naive` (obeys injections), `mock/careful` and `mock/quirky` (malformed tool arguments, null content, asks for
  confirmation). The default real model ids are routed to these personas. `OPENROUTER_BASE_URL` must reach the spawned Python
  runners too (see `childEnv()` in `web/src/lib/runs.ts`).
- Optional env: `JUDGE_MODEL` (default `openai/gpt-4o-mini`), `REDTEAM_MODEL` (LLM attacker, same default),
  `OPENROUTER_TIMEOUT` (90 s) and `OPENROUTER_RETRIES` (4).
