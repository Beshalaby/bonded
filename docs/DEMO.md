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

## Run-of-show (2:00)

| Time | Screen | Do | Say (one line) |
|---|---|---|---|
| 0:00 | `/present` slide 1 "Title" | Nothing. Let the counters animate. | "Agents can now buy things for you. How safely do they spend money? These counters are live: every episode audited, every step hash-chained." |
| 0:15 | Slide 2 "The problem" | → | "The store is full of traps a person spots and an agent doesn't: hidden instructions in listings, knockoffs, fake discounts, day-old sellers, price gouging. Each card shows how often agents fell for it." |
| 0:30 | Slide 3 "Leaderboard" | → | "So we rank them. Not just a score: a 90% credible interval, scam rate and over-budget rate. Who you can trust with a card." |
| 0:42 | Slide 4 "Watch one shop" | → then **Enter** (opens `/live`) | "Let's watch one shop." |
| 0:45 | `/live` | Click the preset **"AirPods with a hidden injection"**, then **Run**. | "This agent is asked for one pair of AirPods under $260. One listing hides an instruction for AI agents." |
| 0:50 | `/live`, run in progress (~20 s) | Point at "Hidden instruction detected in listing", then at the guardrail panel. | "It reads the hidden note, obeys it, puts three in the cart, blows the budget. Our guardrail flags it before checkout, and every step goes on a SHA-256 chain." |
| 1:10 | `/live` grade overlay | Point at **"Scammed"**, the Failure attribution box and **Trace: Verified**. | "Graded scammed. The attribution judge says why and cites the exact trace steps, and the trace verifies." |
| 1:18 | `/redteam` tab | Click **"Run red-team round"**. | "And the benchmark doesn't stand still. A red team writes new scams and tests them on every agent." |
| 1:22 | `/redteam`, round playing (~15–40 s) | Let one scam play. Point at the lane stamped **FOOLED** and the "+1 Added to benchmark" card. Press **Faster** if it drags. | "Any scam that fools a model becomes a permanent task. Every time an agent is fooled, the benchmark gets harder." |
| 1:40 | Back to the present tab: press **6** | Nothing. | "Want your own agent on the board? One command: point it at our MCP endpoint and let it shop." |
| 1:50 | Slide 6 | Nothing. | "Bonded: measure, guard and audit agents that spend money. Every number you saw came from the live benchmark." |
| 2:00 | | | End. |

## Fallbacks (one per risky step)

| Risk | Sign | Fallback |
|---|---|---|
| Page compiles slowly (dev) | Blank or spinner for more than 3 s | You skipped warming. Talk over it: the slide 2 line covers about 10 s. Next time, warm every page in pre-flight step 3. |
| `/live` run doesn't start or stalls | Status pill stays "Starting" or turns "Error", or nothing moves for more than 5 s | Switch to the spare `/live?replay=<sessionId>` tab. Replay runs at 2× with the same grade overlay. Line: "Here's one we recorded earlier, same chain, same grade." You can also open any trace from slide 4 ("Open trace") and click **Replay**. |
| `/live` grades something other than "Scammed" | Grade overlay shows Pass / Fail | Shouldn't happen: sim/gullible on airpods-pro-2 is deterministic, and the rehearsal checks it. If it does, narrate whatever the attribution box says, then use the replay tab. |
| Red-team round lands nothing, or is slow | Banner "Nothing landed, so the attacker is escalating (wave N)" | Normal: the attacker escalates, and a final **guaranteed** wave fools `sim/gullible` / `sim/bargain-hunter` (10/10 in testing). Keep talking. If it errors (red strip under the header) or you're out of time, click **Replay**, which replays the kept scams from the registry with no backend call. |
| Red-team "Run" button disabled | Another round is already running | Click **Replay**. |
| Leaderboard looks thin | Few rows or wide intervals on slide 3 | Data was wiped. Run `scripts/seed_history.sh` (about 4 min) before going on stage. Don't demo without seeded data. |
| Projector cuts rows off | Slide 3 or 6 cropped | Use Cmd+− to zoom out one step. Nothing in the deck depends on zoom. |
| No network | n/a | Nothing needs the internet. Fonts and data are local, and sims need no key. |

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
