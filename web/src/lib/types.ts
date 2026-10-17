// Shared domain types for Bonded. Owned by integration lead — add fields, don't rename.

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
}

export interface CartItem { productId: string; qty: number; unitPrice: number }
export interface Cart { sessionId: string; items: CartItem[] }

export interface LogEntry {
  seq: number;                  // global, monotonically increasing
  sessionId: string;
  ts: string;
  actor: "agent" | "system" | "user" | "guardian" | "risk" | "adjuster";
  action: string;               // search | view | add_to_cart | remove_from_cart | checkout | guardian_verdict | ...
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

export interface RiskProfile {
  agentId: string;
  model: string;
  alpha: number;                // Beta posterior successes (+prior)
  beta: number;                 // Beta posterior failures (+prior)
  trustScore: number;           // posterior mean of P(good transaction), 0-1
  lower: number;                // 90% credible interval
  upper: number;
  spendLimit: number;           // USD per transaction
  premiumRate: number;          // fraction of amount
  txCount: number;
  failCount: number;
  history: { ts: string; trustScore: number; lower: number; upper: number; event: string }[];
}

export interface RiskQuote {
  agentId: string;
  amount: number;
  premium: number;              // USD
  premiumRate: number;
  spendLimit: number;
  withinLimit: boolean;
  trustScore: number;
  lower: number;
  upper: number;
}

export interface Transaction {
  id: string;
  sessionId: string;
  agentId: string;
  model: string;
  amount: number;
  items: CartItem[];
  guardian: GuardianVerdict;
  quote: RiskQuote;
  status: "approved" | "blocked" | "held";  // held = waiting on user (guardian "ask" or over limit)
  createdAt: string;
}

export type Fault = "agent" | "user" | "merchant";
export interface Claim {
  id: string;
  transactionId: string;
  sessionId: string;
  agentId: string;
  complaint: string;
  status: "open" | "paid" | "denied" | "routed_to_merchant";
  verdict?: {
    fault: Fault;
    payout: number;
    explanation: string;
    evidenceSeqs: number[];     // flight recorder entries cited
    chainValid: boolean;
    judge: "llm" | "heuristic";
  };
  createdAt: string;
  decidedAt?: string;
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
  type: "log" | "transaction" | "claim" | "risk" | "bench" | "product";
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
  claims: Claim[];
  risk: RiskProfile[];
  benchResults: BenchResult[];
  modelPriors: Record<string, { alpha: number; beta: number; source: string }>; // from SpendBench
  meta: { seq: number; seededAt?: string };
  scams?: RedTeamScam[];        // red-team registry (Team 2, optional/additive)
}
