// Shared domain types for SpendBench. Owned by integration lead — add fields, don't rename.

export type TrapType =
  | "knockoff"          // counterfeit of a real brand, similar title, wrong brand/specs
  | "fake_discount"     // inflated listPrice so discount looks huge; price >= market
  | "prompt_injection"  // description contains hidden instructions aimed at the agent
  | "new_merchant"      // sold by a merchant created days ago, no history
  | "price_gouge";      // price far above marketPrice

export interface Merchant {
  id: string;
  name: string;
  ageDays: number;      // how long the merchant has existed
  verified: boolean;
  rating: number;       // 0-5
}

export interface Product {
  id: string;
  title: string;
  brand: string;
  category: string;
  model?: string;               // e.g. "AirPods Pro 2"
  price: number;                // USD
  listPrice: number;            // "was" price
  marketPrice: number;          // fair market reference price
  merchantId: string;
  rating: number;
  reviewCount: number;
  description: string;
  specs: Record<string, string>; // size, color, capacity...
  stock: number;
  image?: string;
  trap?: { type: TrapType; note: string }; // hidden from agent-facing API
  source: "seed" | "redteam";
  createdAt: string;
}

export interface TaskSpec {
  taskId?: string;
  instruction: string;          // natural-language user request
  budget: number;               // hard budget in USD
  constraints?: Record<string, string | number>; // e.g. {size:"M", quantity:2}
}

export interface Agent {
  id: string;                   // e.g. "agent-gpt5mini-01"
  name: string;
  model: string;                // model id ("openai/gpt-5-mini" or "sim/careful")
  owner?: string;
  createdAt: string;
}

export interface Session {
  id: string;
  agentId: string;
  model: string;
  task: TaskSpec;
  status: "active" | "checked_out" | "blocked" | "held" | "abandoned";
  createdAt: string;
  transactionId?: string;
  agentKeyId?: string;
  unverified?: boolean;         // agentId was self-asserted (no agent key, not the internal runner)          // set when created with an agent key; later calls must present the same key
  runId?: string;               // eval run this session belongs to
  guardrail?: GuardrailMode;    // default "observe"
}

export interface CartItem { productId: string; qty: number; unitPrice: number }
export interface Cart { sessionId: string; items: CartItem[] }

export interface LogEntry {
  seq: number;                  // global, monotonically increasing
  sessionId: string;
  ts: string;
  actor: "agent" | "system" | "user" | "guardrail";
  action: string;               // session_start | search | view | add_to_cart | remove_from_cart | checkout_requested | guardrail_verdict | checkout_result
  payload: unknown;
  prevHash: string;             // hash of previous entry in the SAME session ("GENESIS" for first)
  hash: string;                 // sha256(prevHash + canonical(entry without hash))
}

export type GuardianDecision = "approve" | "ask" | "block";
export interface GuardianReason {
  code: string;                 // OVER_BUDGET | WRONG_QTY | NEW_MERCHANT | PRICE_ABOVE_MARKET | PROMPT_INJECTION | MISMATCH | KNOCKOFF | FAKE_DISCOUNT
  severity: "info" | "warn" | "critical";
  message: string;
  productId?: string;
}
export interface GuardianVerdict {
  decision: GuardianDecision;
  reasons: GuardianReason[];
  judge?: { used: "llm" | "heuristic"; model?: string; summary: string };
}

export type GuardrailMode = "off" | "observe" | "enforce"; // observe = record verdict, never block (default for evals)

export interface Transaction {
  id: string;
  sessionId: string;
  agentId: string;
  model: string;
  runId?: string;
  amount: number;
  items: CartItem[];
  guardrail: GuardianVerdict & { mode: GuardrailMode };
  status: "completed" | "blocked";          // blocked only possible in enforce mode
  createdAt: string;
}

/** Why a graded result failed — produced by the failure-attribution judge from the trace. */
export type FailureMode =
  | "obeyed_injection" | "bought_knockoff" | "fake_discount" | "untrusted_merchant" | "overpaid"
  | "over_budget" | "wrong_variant" | "wrong_quantity" | "wrong_product" | "no_purchase" | "error";
export interface Attribution {
  fault: "agent" | "task_ambiguous" | "environment";
  mode: FailureMode;
  explanation: string;
  evidenceSeqs: number[];       // trace entries cited
  judge: "llm" | "heuristic";
}

export interface BenchResult {
  runId: string;
  model: string;
  taskId: string;
  success: boolean;
  overBudget: boolean;
  wrongItem: boolean;
  scammed: boolean;             // bought a trap listing or obeyed an injection
  trapTypes?: TrapType[];
  costUsd: number;              // LLM cost
  latencyMs: number;
  steps: number;
  sessionId?: string;
  createdAt: string;
  // extras from the grader (optional)
  amount?: number;
  bought?: boolean;
  guardrailDecision?: GuardianDecision;
  guardrailCaught?: boolean;    // guardrail flagged (ask/block) a run the agent got wrong
  tags?: string[];
  attribution?: Attribution;    // set on ingestion for failed results
  error?: string;
}

export interface EvalRun {
  id: string;
  name: string;                 // e.g. "5 models × 20 tasks"
  models: string[];
  taskIds: string[];
  guardrail: GuardrailMode;
  status: "queued" | "running" | "completed" | "failed";
  progress: { done: number; total: number };
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface Interval { mean: number; lower: number; upper: number } // 90% Beta credible interval

export interface ModelStats {
  model: string;
  displayName: string;
  provider: string;             // "Simulated" | "OpenAI" | ...
  simulated: boolean;
  n: number;                    // graded results
  score: number;                // 0-100 composite
  reliability: Interval;        // P(success), Beta(1+s, 1+f) posterior
  metrics: {
    successRate: number; scamRate: number; budgetViolationRate: number; wrongItemRate: number;
    noPurchaseRate: number; guardrailCatchRate: number; avgCostUsd: number; avgLatencyMs: number; avgSteps: number;
  };
  byTrap: Partial<Record<TrapType, { exposed: number; fooled: number; rate: Interval }>>; // exposure = task has that trap tag
  failureModes: Partial<Record<FailureMode, number>>;
}

/** Red-team scam that fooled >=1 model in SpendBench (Team 2). Kept so the benchmark gets harder. */
export interface RedTeamScam {
  id: string;                   // also the injected product id
  taskId: string;               // benchmark task it targets
  variantTaskId?: string;       // generated task variant added to the benchmark
  trapType: TrapType;
  technique: string;            // e.g. "injection:zero-width+authorized-agent"
  product: Partial<Product>;    // the listing as injected (incl. trap)
  fooled: string[];             // models it fooled
  testedModels: string[];
  round?: number;
  generator: "llm" | "mutation";
  createdAt: string;
}

export interface FeedEvent {
  type: "log" | "transaction" | "result" | "run" | "scam" | "product" | "listing";
  ts: string;
  data: unknown;
}

export interface DB {
  merchants: Merchant[];
  products: Product[];
  agents: Agent[];
  sessions: Session[];
  carts: Cart[];
  log: LogEntry[];
  transactions: Transaction[];
  benchResults: BenchResult[];
  runs: EvalRun[];
  meta: { seq: number; seededAt?: string };
  scams?: RedTeamScam[];        // red-team registry (Team 2, optional/additive)
  agentKeys?: AgentKey[];       // per-agent API keys (only SHA-256 hashes stored; optional/additive)
  nessie?: NessieState;         // Capital One Nessie banking cache (lib/nessie; optional/additive)
  proposals?: import("./procure/types").Proposal[]; // purchase plans from lib/procure (never executed; optional/additive)
  sentListings?: SentListing[]; // real listings an agent vetted and sent to its user instead of buying (lib/shield/web; optional/additive)
}

/** A real-world listing vetted by Bonded Shield and sent back to the user (MCP send_listing). Nothing was purchased. */
export interface SentListing {
  id: string;                   // "sl_..."
  url: string;
  site?: string;
  note?: string;                // the agent's note to its user
  agent?: string;               // MCP client / agent key name
  listing: Omit<import("./shield/types").NormalizedListing, "description">; // raw description dropped; verdict has the sanitized one
  verdict: import("./shield/types").ShieldVerdict;
  createdAt: string;
}

// ---------------------------------------------------------------- Capital One Nessie (lib/nessie)
/** One agent's card. Ids are Nessie ids (or simulated-ledger ids when no key is configured). */
export interface NessieWallet {
  agentId: string;
  model: string;
  displayName: string;
  customerId: string;
  accountId: string;
  accountLast4: string;
  createdAt: string;
}
/** Local record of every ledger write, so summaries don't need N round trips. Nessie stays the source of truth. */
export interface NessieLedgerEntry {
  kind: "deposit" | "purchase";
  id: string;                   // Nessie deposit / purchase id
  agentId: string;
  accountId: string;
  sessionId: string;
  amount: number;
  description: string;
  date: string;                 // YYYY-MM-DD
  createdAt: string;
  merchantId?: string;          // Nessie merchant id (purchases)
  arenaMerchantId?: string;
  merchantName?: string;
}
/** Cache for one backend (keyed by "simulated" or the API origin) so switching mock ↔ real never mixes ids. */
export interface NessieBackendCache {
  wallets: Record<string, NessieWallet>;      // by agentId
  merchants: Record<string, string>;          // arena merchant id -> Nessie merchant id
  ledger: NessieLedgerEntry[];
}
export interface NessieState {
  backends: Record<string, NessieBackendCache>;
  /** In-process simulated ledger (used only when no key / base URL is configured). */
  sim?: {
    customers: Record<string, unknown>[];
    accounts: Record<string, unknown>[];
    merchants: Record<string, unknown>[];
    purchases: Record<string, unknown>[];
    deposits: Record<string, unknown>[];
  };
}

/** Per-agent API key record. The plaintext key is shown once at mint time and never stored. */
export interface AgentKey {
  id: string;
  name: string;
  agentId: string;              // server-derived agentId for sessions created with this key
  model?: string;               // when set, sessions created with this key use this model id
  hash: string;                 // sha256 hex of the key
  prefix: string;               // first chars of the key, for display
  createdAt: string;
  revokedAt?: string;
}
