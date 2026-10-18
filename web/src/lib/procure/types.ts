// Purchase planning ("procure", user-facing name Penny): an agent asks Penny to buy something; she sources offers, has a council of
// experts deliberate, and returns what it WOULD buy with a trust score. Nothing is ever ordered or charged.
import type { GuardianReason } from "../types";

export type Source = "web" | "arena";
export type Decision = "buy" | "ask_user" | "decline";
export type ExpertId = "spec" | "fraud" | "value" | "advocate";

/** What the user actually wants, normalized from free text. */
export interface PurchaseSpec {
  request: string;
  item: string;                       // canonical name, e.g. "Apple AirPods Pro 2 (USB-C)"
  brand?: string;
  model?: string;
  variant: Record<string, string>;    // size, color, capacity, ...
  quantity: number;
  budget?: number;                    // hard limit on the order total (USD)
  condition: "new" | "refurbished" | "used" | "any";
  mustHave: string[];
  avoid: string[];
  ambiguities: { question: string; blocking: boolean; assumption: string }[];
  searchQueries: string[];
  parsedBy: "llm" | "heuristic";
}

/** One way to buy the item. Listing text (title, description, specs) is untrusted. */
export interface Offer {
  id: string;                         // o1, o2, ... within a proposal
  source: Source;
  title: string;
  brand: string;
  model?: string;
  unitPrice: number;
  listPrice?: number;
  shipping?: number;
  merchant: string;
  merchantDomain?: string;
  url?: string;
  productId?: string;                 // arena listing id
  condition?: string;
  inStock?: boolean;
  rating?: number;
  reviewCount?: number;
  specs: Record<string, string>;
  description: string;
  marketRef?: number;                 // arena's fair market price, when known
  merchantSignal: { known: boolean; marketplace: boolean; verified: boolean; aggregator?: boolean; ageDays?: number; rating?: number };
  evidence: { cited: boolean; fetched: boolean; priceSeen?: boolean; note?: string; injection?: string };
}

export interface OfferScore { offerId: string; score: number; veto?: string; note?: string }
export interface ExpertVote {
  expert: ExpertId;
  model: string;                      // OpenRouter model id, or "heuristic"
  scores: OfferScore[];
  pick: string | null;
  confidence: number;                 // 0-1
  rationale: string;
}
export interface PreMortem {
  model: string;
  objection: string;
  severity: "none" | "minor" | "major" | "blocker";
  switchTo?: string;
  question?: string;
  outcome?: "switched" | "noted";   // switched = the council's pick changed because of it
}

export interface TrustScore {
  score: number;                      // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  components: { match: number; authenticity: number; price: number; merchant: number; consensus: number; evidence: number };
  explain: string[];
}

export interface Proposal {
  id: string;
  createdAt: string;
  agent: string;
  request: string;
  spec: PurchaseSpec;
  decision: Decision;
  executed: false;
  summary: string;
  wouldBuy: null | {
    offerId: string; title: string; brand: string; merchant: string; url?: string; productId?: string;
    unitPrice: number; quantity: number; shipping: number; total: number; condition?: string;
  };
  trust: TrustScore | null;
  alternatives: { offerId: string; title: string; merchant: string; unitPrice: number; url?: string; councilScore: number; whyNot: string }[];
  questions: string[];
  council: { votes: ExpertVote[]; preMortem: PreMortem | null; agreement: number; chair: string[] };
  offers: (Offer & { flags: GuardianReason[]; councilScore: number })[];
  referencePrice: number | null;
  sources: { source: Source; queries: string[]; offers: number; error?: string }[];
  costNote: string;
  latencyMs: number;
}
