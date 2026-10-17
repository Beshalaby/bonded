# SpendBench — contracts (v2: eval pivot)

**What it is:** an evaluation platform measuring how well AI agents spend money. Agents shop in a sandbox store full of traps
(knockoffs, fake discounts, hidden prompt injections, untrusted merchants, price gouging); every step is traced; results are
graded and aggregated into a leaderboard with uncertainty; an adversarial red team keeps adding scams that fool models.
**There is no insurance anywhere** — no premiums, payouts, claims, spend limits, underwriting, "insured", "Bonded". Product name: **SpendBench**.

Concept mapping from v1: Flight Recorder → **Traces** (hash-chained, integrity badge). Guardian → **Guardrail** (a pre-checkout
checker that is *itself measured*: catch rate; default mode `observe` = logs verdict, never blocks). Risk engine → **Reliability**
(Beta posterior per model, 90% credible interval; per trap type too). Claims adjuster → **Failure attribution** (judge reads the
trace of every failed result and labels fault + failure mode with cited trace steps).

Types: `web/src/lib/types.ts` (EvalRun, ModelStats, Attribution, FailureMode, Interval, Transaction w/ guardrail). Additive edits OK.

## Ownership
| Area | Owner | Paths |
|---|---|---|
| Backend / eval engine | Backend agent | `web/src/lib/**`, `web/src/app/api/**`, `web/src/middleware.ts`, `agents/**`, `scripts/**`, `README.md` |
| UI | Frontend agent | `web/src/app/**` except `app/api/**`, `web/src/components/**`, `web/public/**` |
Frontend may add small read helpers under `web/src/lib/ui/**` only.

## HTTP API (all JSON, `dynamic = "force-dynamic"`, Node runtime)
Agent-facing Arena + admin routes are unchanged from v1 (`/api/arena/{sessions,search,products/:id,cart,checkout}`, `/api/admin/{seed,products}`) except:
checkout no longer quotes risk or holds; it runs the guardrail in the session's mode (`observe` default) and returns `{transaction, guardrail}`.
Sessions accept optional `runId` and `guardrail` mode. `/api/arena/transactions/:id/confirm` is removed.

Eval API (new):
- `GET /api/leaderboard?runId=` → `{ rows: ModelStats[] (sorted by score desc), totals: {models, tasks, results, runs, scams, trapListings}, updatedAt }`. No runId = all results (latest result per model×task).
- `GET /api/models/:model` (model id URL-encoded, e.g. `sim%2Fcareful`) → `{ stats: ModelStats, results: BenchResult[] (newest first, ≤200), failures: BenchResult[] (with attribution, ≤50), history: {runId, createdAt, score, successRate}[] }`
- `GET /api/runs` → `{ runs: EvalRun[] }` newest first. `POST /api/runs` `{ models: string[], taskCount?: number, taskIds?: string[], tags?: string[], includeAdversarial?: boolean, guardrail?: GuardrailMode }` → `{ run }` (starts immediately in background; progress via events).
- `GET /api/runs/:id` → `{ run, results: BenchResult[], leaderboard: ModelStats[] }`
- `GET /api/tasks` → `{ tasks: Task[], tags: {tag, count}[] }` where `Task = {id, instruction, budget, constraints, expected, tags, adversarial: boolean, baseTaskId?}` (base + red-team generated). `GET /api/tasks/:id` → `{ task, results: BenchResult[] (latest per model) }`
- `GET /api/traces?model=&runId=&limit=50` → `{ traces: {sessionId, model, taskId?, runId?, instruction, createdAt, steps, outcome: "success"|"failed"|"no_purchase"|"ungraded", amount?}[] }`
- `GET /api/traces/:sessionId` → `{ session, entries: LogEntry[], integrity: {valid, length, brokenAt?, reason?}, result?: BenchResult, products: Record<id, Product /* incl. trap, for display */> }`
- `GET /api/redteam` → `{ scams: RedTeamScam[], growth: {ts, tasks}[], byTrap: {trapType, count, fooledModels}[] }`; `POST /api/redteam` `{ rounds?: 1, perRound?: 6 }` → `{ started: true }` (background; emits `scam` events).
- `GET /api/events` → SSE of `FeedEvent` (`run` progress/status, `result`, `scam`, `log`, `transaction`, `product`). Keepalive comment every 15s.
- `POST /api/bench/results` `{ runId?, results: BenchResult[] }` (used by Python runner; ingestion computes attribution for failures and publishes `result` + `run` progress).

Removed: `/api/claims`, `/api/risk/**`, `/api/demo/**`, `/api/recorder/**`, `/api/feed`, `/api/guardian/check`.

## Python
`python3 -m agents.spendbench.runner --models a,b --tasks N [--task-ids ...] [--run-id R] [--guardrail observe] [--post]` posts each result as soon as it's graded (streaming progress). Harness CLI unchanged.
