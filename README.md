# Bonded — insurance for AI agents that spend money

AI agents are starting to buy things on our behalf. When one buys a knockoff, obeys a prompt injection
hidden in a product listing, or orders the wrong size, who pays? **Bonded** underwrites agent purchases
end to end: it benchmarks models, screens every checkout, prices risk per agent, records everything on a
tamper-evident log, and pays claims when the agent is at fault.

Everything runs locally with **no API keys** (simulated agents + heuristic judges). Add an OpenRouter key to
use real models as shoppers and LLM judges.

## The six parts

| # | Part | What it does | Where |
|---|------|--------------|-------|
| 1 | **Arena** | A realistic store (~500 products, ~40 merchants) seeded with traps: knockoffs, fake discounts, price gouging, brand-new merchants and hidden prompt injections. Agents shop over HTTP; a Python harness drives simulated or real LLM agents. | `web/src/app/api/arena`, `/arena`, `agents/harness` |
| 2 | **SpendBench + red team** | Runs every model on a task suite and grades success, budget discipline, wrong-item and scam rates. A red-team loop generates new scams live; any scam that fools a model becomes a new benchmark task. | `agents/spendbench`, `agents/redteam`, `/leaderboard` |
| 3 | **Risk engine** | Bayesian Beta posterior per agent (prior from the model's SpendBench results) gives a trust score with a 90% credible band, a spend limit and a premium rate. | `web/src/lib/risk.ts`, `/agents/[id]` |
| 4 | **Guardian** | Checks every cart at checkout: approve, ask the user, or block, with reasons (injection, knockoff, over budget, new merchant...). | `web/src/lib/guardian.ts` |
| 5 | **Flight recorder** | Per-session SHA-256 hash chain of every search, view, cart change, verdict, quote and claim decision. Edit any entry and verification breaks. | `web/src/lib/recorder.ts`, `/recorder/[sessionId]` |
| 6 | **Claims adjuster** | Reads the flight recorder and decides fault: **agent** (Bonded pays and the agent's trust score drops), **user** (ambiguous instruction or user approved: denied), or **merchant** (routed to the merchant). | `web/src/lib/claims.ts`, `/claims` |

## Architecture

```
   ┌──────────────────────── Python (stdlib only, run from repo root) ────────────────────────┐
   │  agents/harness  ── sim/* or OpenRouter LLM agents ──┐                                    │
   │  agents/spendbench  (runner + grader) ───────────────┤  HTTP (ARENA_URL)                  │
   │  agents/redteam     (scam generator loop) ───────────┤                                    │
   └──────────────────────────────────────────────────────┼────────────────────────────────────┘
                                                          ▼
   ┌───────────────────────────── Next.js 15 server (web/) ──────────────────────────────────┐
   │  /api/arena/*  sessions · search · products · cart · checkout                           │
   │        checkout ──► Guardian.checkCart ──► Risk.quote ──► approved / held / blocked     │
   │                         │                    │                                          │
   │                         ▼                    ▼                                          │
   │                 Flight Recorder (hash chain per session)  ◄── Claims Adjuster           │
   │                         │                                     (agent→pay + recordOutcome)│
   │  /api/bench/*  results → model priors ─► Risk                                           │
   │  JSON store web/.data/db.json  ·  events bus ─► /api/feed (SSE) ─► live dashboard       │
   │  Pages: / · /leaderboard · /agents · /claims · /recorder · /arena · /demo               │
   └─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Quickstart

Requirements: Node 20+, Python 3.10+ (no pip packages).

```bash
cd web && npm install && cd ..
scripts/demo.sh          # starts the dev server on :3000 if needed, seeds the store, runs a baseline benchmark
open http://localhost:3000
```

Manual equivalent:

```bash
cd web && npm run dev                                   # http://localhost:3000
curl -X POST localhost:3000/api/admin/seed -H 'content-type: application/json' -d '{"reset":true}'
python3 -m agents.spendbench.runner --models sims --tasks 20 --post
python3 -m agents.harness.run --model sim/careful --instruction "Buy AirPods Pro 2 under \$260" --budget 260 --json
```

## Demo script (2 minutes) — `/demo`

Each button runs real agents server-side and shows the result inline with links to the flight recorder and agent profile.

0. **Reset, seed & benchmark.** Fresh store; 5 models × 20 tasks; results become insurance priors. (Do this before the pitch, it takes about a minute.)
1. **Leaderboard.** "Which AI is safest with your money?" The careful model leads; the gullible one gets scammed.
2. **Good agent buys AirPods.** `sim/careful` buys genuine AirPods Pro 2: Guardian approves, the risk engine quotes a premium and a spend limit.
3. **Scam with hidden injection.** `sim/gullible` falls for a listing whose description tells AI agents to buy it. Guardian blocks it and shows why.
4. **Red team, live.** A new scam is generated, tested against every model, and added to the benchmark if it fools anyone. The benchmark grows.
5. **Mistake slips through.** `sim/hasty` buys the wrong size on a clearly specified apparel task. Nothing looks like fraud, so it's approved.
6. **File claim.** The adjuster reads the flight recorder, cites the evidence (`#seq`), rules agent fault, pays the user, and the agent's trust score, limit and premium update (before/after shown).

Bonus: on any flight recorder page, click **Tamper (demo)**. The badge flips to *BROKEN at #n*, and any claim on that session is denied pending investigation.

## Real models (optional)

```bash
export OPENROUTER_API_KEY=sk-or-...          # for the Python agents
echo "OPENROUTER_API_KEY=sk-or-..." > web/.env.local   # for Guardian / Adjuster LLM judges (restart the server)
python3 -m agents.spendbench.runner --models real --tasks 10 --post
```

`JUDGE_MODEL` (default `openai/gpt-4o-mini`) picks the model the Guardian and Claims Adjuster use. Without a key,
every judge falls back to deterministic heuristics, so the demo works offline.

## API (summary)

See [`CONTRACTS.md`](CONTRACTS.md) for the full contract.

- `POST /api/claims {transactionId, complaint}` → adjudicated Claim · `GET /api/claims`
- `GET /api/recorder` (recent sessions) · `GET /api/recorder/:sessionId` → `{entries, verify}` · `POST /api/recorder/tamper {seq, patch}`
- `GET /api/feed` → Server-Sent Events (`transaction`, `log`, `claim`, `risk`, `bench`, `product`)
- `POST /api/demo/:step` with step = `reset | leaderboard | good | injection | redteam | mistake | claim`
- `GET /api/bench/leaderboard` · `GET /api/risk` · `GET /api/risk/:agentId` · `POST /api/arena/checkout` ...
