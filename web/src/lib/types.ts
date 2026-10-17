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
  type: "log" | "transaction" | "result" | "run" | "scam" | "product";
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
}
