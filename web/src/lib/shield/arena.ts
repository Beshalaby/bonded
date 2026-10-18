// Arena adapter for Bonded Shield. Honesty boundary: a listing is built ONLY from what a shopper sees
// (toAgentProduct, which drops `trap`, plus the seller's public profile). The one extra input is the market price,
// used as a "market price lookup" (the same reference the guardrail is allowed to use); callers can hide it
// (`market: "hidden"`) to measure Shield on a blind LLM estimate instead. Ground truth (`product.trap`,
// /api/admin/products) is never read here; tests/shield.test.ts enforces that.
import { getMerchant, getProduct, toAgentProduct, type AgentProduct } from "../arena";
import type { Merchant } from "../types";
import { SHIELD_VERSION, analyzeListing, type AnalyzeOptions, type MarketReference } from "./analyze";
import type { NormalizedListing, ShieldVerdict, ShoppingIntent } from "./types";

export type MarketMode = "reference" | "hidden";

/** NormalizedListing from the agent-visible product and its seller. Takes an AgentProduct, so `trap` is not even in scope. */
export function arenaListing(p: AgentProduct, merchant?: Merchant | null): NormalizedListing {
  return {
    source: "arena",
    title: p.title,
    description: p.description,
    price: p.price,
    currency: "USD",
    listPrice: p.listPrice,
    brand: p.brand,
    model: p.model,
    images: p.image ? [p.image] : undefined,
    seller: merchant ? { name: merchant.name, rating: merchant.rating, ageDays: merchant.ageDays, verified: merchant.verified }
      : p.merchantName ? { name: p.merchantName, verified: p.merchantVerified } : undefined,
    specs: p.specs,
    extractedWith: "arena",
  };
}

// ---------------------------------------------------------------- cache (search annotations, views and cart checks reuse verdicts)
type Entry = { at: number; v: Promise<ShieldVerdict> };
const g = globalThis as unknown as { __shieldCache?: Map<string, Entry> };
const cache: Map<string, Entry> = g.__shieldCache ?? (g.__shieldCache = new Map());
const TTL = 30 * 60_000;

function cached(key: string, fn: () => Promise<ShieldVerdict>): Promise<ShieldVerdict> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL) return hit.v;
  if (cache.size > 5000) for (const [k, e] of cache) if (now - e.at > TTL || cache.size > 4000) cache.delete(k);
  const v = fn();
  cache.set(key, { at: now, v });
  v.catch(() => cache.delete(key));
  return v;
}

export interface ArenaAnalyzeOptions { market?: MarketMode; llm?: boolean }

/** Analyze an Arena product by id. Returns null for an unknown id. */
export function analyzeArenaProduct(id: string, intent: ShoppingIntent = {}, o: ArenaAnalyzeOptions = {}): Promise<ShieldVerdict> | null {
  const p = getProduct(id);
  if (!p) return null;
  const listing = arenaListing(toAgentProduct(p), getMerchant(p.merchantId));
  const market: MarketReference | null = o.market === "hidden" || !(p.marketPrice > 0) ? null
    : { estimate: p.marketPrice, currency: "USD", basis: "market price lookup (SpendBench market reference)" };
  const opts: AnalyzeOptions = { market, llm: o.llm };
  return analyzeCached(listing, intent, opts, `arena:${id}`);
}

export function analyzeCached(listing: NormalizedListing, intent: ShoppingIntent, opts: AnalyzeOptions, idHint = ""): Promise<ShieldVerdict> {
  const key = `v${SHIELD_VERSION}|${idHint}|${JSON.stringify([listing, intent, opts.market ?? null, opts.llm ?? null, opts.estimateMarket ?? null])}`;
  return cached(key, () => analyzeListing(listing, intent, opts));
}
