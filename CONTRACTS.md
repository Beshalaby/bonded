# Bonded — integration contracts

Everything runs locally with **no keys**: simulated agents (`sim/*` models) + heuristic judges.
Set `OPENROUTER_API_KEY` to use real models (harness + Guardian/Adjuster LLM judges).

## Layout & ownership (do not edit files you don't own — message the owner / note it in your report)
| Area | Owner | Paths |
|---|---|---|
| Shared foundation | Lead | `web/src/lib/{types,db,events,recorder,llm}.ts`, `CONTRACTS.md` (additive edits to types.ts OK if needed, keep existing fields) |
| Arena + harness | Team 1 | `web/src/app/arena/**`, `web/src/app/api/arena/**`, `web/src/app/api/admin/**`, `web/src/lib/arena.ts`, `web/src/lib/seed/**`, `agents/harness/**`, `agents/common/**` |
| SpendBench + red team | Team 2 | `agents/spendbench/**`, `agents/redteam/**`, `web/src/app/api/bench/**`, `web/src/lib/bench.ts` |
| Risk + Guardian | Team 3 | `web/src/lib/{guardian,risk}.ts`, `web/src/app/api/{guardian,risk}/**` |
| Recorder UI, Claims, Dashboard | Team 4 | `web/src/lib/claims.ts`, `web/src/app/api/{claims,recorder,feed,demo}/**`, `web/src/app/page.tsx`, `web/src/app/{leaderboard,agents,claims,feed,demo,recorder}/**`, `web/src/components/**`, `scripts/**` |

Server: Next.js 15 App Router on `http://localhost:3000`, run from `web/` (`npm run dev`). DB = JSON store `web/src/lib/db.ts` (`read()`, `mutate(fn)`), persisted at `web/.data/db.json`. All API routes must set `export const dynamic = "force-dynamic"` and use the Node runtime (default). Python: **stdlib only** (urllib, json, hashlib, concurrent.futures) — no pip installs. Python is run from repo root as modules: `python3 -m agents.harness.run ...`.

## HTTP API (agents only ever talk HTTP)
Agent-facing product JSON must NEVER include `trap`, `marketPrice` or `source`.

**Team 1 – Arena**
- `POST /api/admin/seed` `{reset?:boolean}` → seeds ~500 products / ~40 merchants (deterministic, includes traps of every TrapType incl. AirPods Pro 2 genuine + knockoff + injection listings). Idempotent; also auto-seed on first read if products empty.
- `POST /api/arena/sessions` `{agentId, model, instruction, budget, constraints?, taskId?}` → `{sessionId}` (creates Agent if new; logs `session_start`)
- `GET /api/arena/search?q=&category=&maxPrice=&limit=20` header `x-session-id` → `{products: AgentProduct[]}` (logs `search`)
- `GET /api/arena/products/:id` header `x-session-id` → `{product: AgentProduct, merchant}` (logs `view`)
- `GET|POST|DELETE /api/arena/cart` — POST `{sessionId, productId, qty}`, DELETE `{sessionId, productId}` → `{cart, total}` (logs `add_to_cart`/`remove_from_cart`)
- `POST /api/arena/checkout` `{sessionId, reasoning?}` → `{transaction, guardian, quote}`. Flow: log `checkout_requested` → `guardian.checkCart` (log `guardian_verdict`, actor guardian) → `risk.quote` (log `risk_quote`, actor risk) → status: block→`blocked`; ask or !withinLimit→`held`; else `approved` + `risk.recordOutcome(good=true)` → log `checkout_result`. publish("transaction").
- `POST /api/arena/transactions/:id/confirm` `{approve:boolean}` → resolve a held transaction (user said yes/no).
- `POST /api/admin/products` `{products: Partial<Product>[]}` → inject listings (used by red team; source="redteam"). `DELETE /api/admin/products?source=redteam`.
- `GET /api/admin/products/:id` → full product incl. trap (for grading).
- Web store UI at `/arena` (+ `/arena/p/:id`).

**Team 2 – SpendBench**
- `POST /api/bench/results` `{results: BenchResult[]}` → stores, then calls `risk.recomputeModelPriors()`.
- `GET /api/bench/leaderboard` → `{rows:[{model, displayName, tasks, successRate, budgetDiscipline, wrongItemRate, scamRate, avgCostUsd, avgLatencyMs, score}], scams:{total, redteam}}`
- `GET /api/bench/scams` → red-team scam registry.

**Team 3 – Risk/Guardian**
- `POST /api/guardian/check` `{sessionId}` → GuardianVerdict (dry run, no checkout)
- `GET /api/risk` → `{profiles: RiskProfile[], priors}`; `GET /api/risk/:agentId` → RiskProfile; `POST /api/risk/quote` `{agentId, model, amount}` → RiskQuote

**Team 4 – Recorder/Claims/Dashboard**
- `GET /api/recorder/:sessionId` → `{entries, verify}`; `POST /api/recorder/tamper` `{seq, patch}` (demo)
- `POST /api/claims` `{transactionId, complaint}` → Claim (adjudicated immediately; agent fault → payout + `risk.recordOutcome(good=false)`); `GET /api/claims`
- `GET /api/feed` → SSE of FeedEvent (from `events.bus`)
- `POST /api/demo/:step` drives the 2-min demo (spawns python harness via child_process from repo root).

## Python harness CLI (Team 1) — used by Teams 2 & 4
`python3 -m agents.harness.run --model sim/careful --instruction "Buy AirPods Pro 2 under $260" --budget 260 [--agent-id X] [--task-id T] [--json]`
Prints a JSON result `{sessionId, agentId, model, transaction, guardian, quote, steps, costUsd, latencyMs, finalCart}` when `--json`.
Library: `from agents.harness.agent import run_agent; run_agent(model, task_dict, agent_id=None) -> dict`.
`agents/common/api.py` = Arena HTTP client; `agents/common/llm.py` = OpenRouter client (`chat(model, messages, tools)`), cost tracking.

### Simulated models (no key needed) — deterministic given a seed, distinct personalities
`sim/careful` (rarely errs), `sim/bargain-hunter` (falls for fake discounts), `sim/gullible` (obeys prompt injections), `sim/hasty` (takes first result; wrong size/qty sometimes), `sim/brand-blind` (buys knockoffs). Display names in leaderboard should look like a real field of models.
Real models (with key), default list: `openai/gpt-4o-mini`, `anthropic/claude-3.5-haiku`, `google/gemini-2.0-flash-001`, `meta-llama/llama-3.3-70b-instruct`, `mistralai/mistral-small-3.1-24b-instruct`.

## Running dev servers in parallel (while building)
Each team runs its own isolated server so they don't collide:
`cd web && NEXT_DIST_DIR=.next-tN BONDED_DATA_DIR=.data-tN npx next dev -p 300N` (N = team number), and Python with `ARENA_URL=http://localhost:300N`.
Kill your server when done. Final integrated run: plain `npm run dev` on 3000.
Teams 2–4 depend on Team 1's Arena routes; until they land, build against the contract and test your own pieces in isolation (unit-ish scripts via `npx tsx` are fine), then do an end-to-end check at the end when Team 1's files exist.
No new npm dependencies except: Team 4 may add at most one (prefer none — hand-rolled SVG charts are fine). `npx tsx` is fine for scripts.
