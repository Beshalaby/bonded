# Bonded: the pitch

**One line:** AI agents are starting to spend our money, and the internet is full of traps built for them. Bonded
measures how safely agents shop, makes them safe with Bonded Shield, and runs every purchase on a real Capital One
account.

Every number on screen is live from the running app (real OpenRouter models, a real Capital One Nessie sandbox).
Re-check them with `scripts/preflight.sh` right before you go on.

---

## Before you walk up (T-15 min)

1. `scripts/public.sh` in its own terminal; leave it running. It prints the public link, your admin token and the MCP
   lines. The link changes every time it starts, so start it once.
2. `scripts/preflight.sh`: every line must say PASS (WARN is OK if you understand it). It is read-only.
   **Never run `scripts/rehearse.sh` or `scripts/setup.sh` on demo day: they wipe the real results.**
3. Open the public link on the presenting laptop and sign in at `/login` with the admin token (needed for live runs).
4. Tabs, in order: `/present` · `/live` · `/check` · a spare `/live?replay=<id>` (fallback, below).
5. Browser fullscreen (Ctrl+Cmd+F), zoom 100% (110% on a 1080p projector), Do Not Disturb on.
6. Deck keys: → / Space next, ← back, 1–7 jump, Enter on slide 5 opens the live run, Esc exits.

**Fallback replay:** open `/traces`, filter model "Echo Gullible", open a scammed AirPods trace, copy the session id
into `/live?replay=<id>`. If a live run stalls or the Wi-Fi is bad, play this at 2× instead; it is the same footage.

---

## The 2 minutes

| Time | Slide | Say (roughly) | Do |
|---|---|---|---|
| 0:00 | 1 · Title | "Would you trust an AI with your wallet? Agents are already being handed credit cards. We built Bonded so you can." | — |
| 0:10 | 2 · The problem | "The web is full of traps a human might spot but an agent can't: knockoffs, fake discounts, sketchy sellers, and instructions hidden inside listings that tell the AI to ignore your budget. Today nobody measures this." | Point at the hidden-instruction tile. |
| 0:25 | 3 · SpendBench | "So we measured it. Six real models from five labs shop the same store full of traps, graded with confidence intervals. Even good models get fooled: Qwen3 fell for 3 scams out of 38." | — |
| 0:40 | 4 · Bonded Shield | "Then we fixed it. Bonded Shield wraps any model: it strips hidden instructions, checks sellers and prices, and refuses bad carts. Same models, same tasks: scams went to zero, and Shield is number one on the board." | Let the numbers sit for a beat. |
| 1:00 | 5 · Capital One | "And this is real money flow: every agent spends from its own Capital One account through Nessie. Watch an unprotected agent shop." | **Enter** → `/live` → Run. While it runs: "It just read a listing with a hidden instruction… it's following it… three units, way over budget… and that's a real charge on its Capital One card." Back to deck with the tab. |
| 1:30 | 6 · Penny | "For your own agent, there's Penny: it searches real stores, a council of four models votes, it gives a trust score, and it never buys without you. Paste any real listing and it'll tell you if it's safe." | Optional: show `/check` with a real link. |
| 1:45 | 7 · Use it today | "It's one line for any MCP agent: Claude, Cursor, VS Code, OpenAI Agents, LangChain. Scan the code and try it right now. Bonded: AI agents you can trust with your wallet." | Hold on the QR code. |

If you're short on time, skip the narration during the live run and cut slide 6 to one sentence.

---

## Likely questions

**Is this real or simulated?** Real. The ranking is real OpenRouter models (GPT-5 mini, Claude Haiku 4.5, Gemini 2.5
Flash, DeepSeek V3.2, Qwen3 235B, Llama 4 Maverick); about $1 of inference produced it. Wallets are real Nessie
accounts and purchases. The *store* is a sandbox on purpose: you can't safely test agents against real scammers, and the
answer key must be known to grade. Penny and `/check` work on real websites.

**How do you know Shield isn't cheating?** Shield only sees what a shopper sees: the listing, seller, price and the
request. It never reads the trap labels; there are tests that fail if any Shield file touches them, and that a
verdict is identical with the label added or removed. We also ran it with the market-price lookup hidden: still ahead.

**The top models look tied.** They are, and we say so: the board shows 90% credible intervals, and `/compare` gives the
probability one model really beats another. That's why the red team exists: scams that fool a model become new
benchmark tasks, so the test keeps getting harder (8 so far).

**What does Shield do that a guardrail doesn't?** A guardrail checks the cart at the end. Shield cleans what the agent
reads (hidden instructions are removed before the model sees them), rates every listing while it shops, and refuses
carts that break the request. The guardrail is still there and is itself scored as a classifier (`/guardrail`).

**What's Capital One's part?** Nessie gives every agent a real account: the task budget is deposited, an approved
checkout is a real purchase at a mirrored merchant, and a blocked one is declined with no charge. The overspent cards
make the risk visible on an actual ledger.

**How does an agent use this?** MCP, the open standard. Two servers: `penny` (shop safely for a user, vet listings,
never buys) and SpendBench (`bonded-bench`, benchmark your agent onto the ranking). Any MCP client works; the setup
for nine clients is on `/connect` and the Penny page.

**Is it secure?** Logins on the public link, rate limits and a daily allowance on paid features, an SSRF-safe fetcher
for user-supplied URLs (no private addresses, pinned DNS, re-checked redirects), hidden instructions treated as data,
and every agent step recorded in a tamper-evident hash chain you can verify in the browser.

**What's next?** Shield as a drop-in MCP layer for any agent framework, real checkout behind a user confirmation, and
an official eBay Browse API key so eBay links work without pasting.
