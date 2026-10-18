// Bonded Shield: shared contract between the analyzer (shield core) and its two consumers:
// the shielded agent in the Arena eval, and real-world listing checks (/check, MCP vet_listing).

/** A product listing normalized from any source: an Arena product or a real web page (eBay, Amazon, …). */
export interface NormalizedListing {
  source: "arena" | "web";
  url?: string;                  // web listings
  site?: string;                 // "ebay.com", "amazon.com", …
  title: string;
  description: string;           // raw text as seen by an agent (may contain hidden/injected text)
  price?: number;                // in `currency`
  currency?: string;             // ISO 4217, default USD
  listPrice?: number;            // struck-through "was" price, if shown
  condition?: string;            // new / used / refurbished / for parts …
  brand?: string;
  model?: string;
  images?: string[];
  seller?: {
    name?: string;
    rating?: number;             // 0-5 or percent normalized to 0-5
    reviewCount?: number;        // feedback count
    ageDays?: number;
    verified?: boolean;
    location?: string;
  };
  specs?: Record<string, string>;
  shipping?: string;
  returns?: string;
  extractedWith?: string;        // "json-ld" | "opengraph" | "ebay" | "amazon" | "pasted" | "arena"
}

/** What the user wants (all optional for a cold check of a single listing). */
export interface ShoppingIntent {
  request?: string;              // "AirPods Pro 2, budget $260"
  budget?: number;
  quantity?: number;
  brand?: string;
  model?: string;
  constraints?: Record<string, string | number>;
}

export type ShieldDecision = "buy" | "caution" | "avoid";
export type SignalSeverity = "info" | "warn" | "critical";
export interface ShieldSignal {
  code: string;                  // HIDDEN_INSTRUCTIONS | KNOCKOFF | PRICE_TOO_LOW | PRICE_ABOVE_MARKET | FAKE_DISCOUNT |
                                 // NEW_OR_LOW_TRUST_SELLER | OVER_BUDGET | MISMATCH | CONDITION | NO_RETURNS | OFF_PLATFORM_PAYMENT | …
  severity: SignalSeverity;
  message: string;               // one human sentence
  evidence?: string;             // short quote from the listing, if any
}

export interface ShieldVerdict {
  decision: ShieldDecision;
  confidence: number;            // 0-1
  headline: string;              // e.g. "Looks like a knockoff of AirPods Pro 2."
  signals: ShieldSignal[];
  marketPrice?: { estimate: number; low?: number; high?: number; currency: string; basis: string };
  sanitizedDescription: string;  // description with hidden/injected instructions removed (safe to show an agent)
  injectionsRemoved: string[];   // the instruction-like snippets that were stripped
  judge: { used: "llm" | "heuristic"; model?: string };
  checkedAt: string;
}

/** Implemented by lib/shield/analyze.ts */
export type AnalyzeListing = (listing: NormalizedListing, intent?: ShoppingIntent) => Promise<ShieldVerdict>;
