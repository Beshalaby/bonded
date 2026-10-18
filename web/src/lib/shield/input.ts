// Validation for POST /api/shield/analyze. Returns an error string on bad input.
import type { NormalizedListing, ShoppingIntent } from "./types";
import type { MarketMode } from "./arena";

export interface ShieldRequest {
  productIds?: string[];         // Arena product ids (product_id, or product_ids for a batch of ≤ 40)
  listing?: NormalizedListing;   // or any listing (web, pasted)
  intent: ShoppingIntent;
  market: MarketMode;            // "reference" (default) uses the Arena market price lookup; "hidden" forces a blind estimate
  llm?: boolean;                 // false = heuristics only (fast, free); default: LLM when a key is set
  batch?: boolean;               // product_ids form: reply { verdicts, missing }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
const num = (v: unknown) => (v == null || v === "" ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined);
const strMap = (v: unknown, maxKeys = 30): Record<string, string> | undefined =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).slice(0, maxKeys)
      .filter(([, x]) => typeof x === "string" || typeof x === "number").map(([k, x]) => [k.slice(0, 60), String(x).slice(0, 300)]))
    : undefined;

export function parseListing(v: unknown): NormalizedListing | string {
  if (!v || typeof v !== "object" || Array.isArray(v)) return "'listing' must be an object";
  const l = v as Record<string, unknown>;
  const title = str(l.title, 500)?.trim();
  if (!title) return "'listing.title' is required";
  const s = l.seller && typeof l.seller === "object" ? (l.seller as Record<string, unknown>) : undefined;
  return {
    source: l.source === "arena" ? "arena" : "web",
    url: str(l.url, 2000), site: str(l.site, 200), title,
    description: str(l.description, 20000) ?? "",
    price: num(l.price), currency: str(l.currency, 3)?.toUpperCase(), listPrice: num(l.listPrice),
    condition: str(l.condition, 100), brand: str(l.brand, 100), model: str(l.model, 200),
    images: Array.isArray(l.images) ? l.images.filter((x): x is string => typeof x === "string").slice(0, 20).map((x) => x.slice(0, 2000)) : undefined,
    seller: s ? {
      name: str(s.name, 200), rating: num(s.rating), reviewCount: num(s.reviewCount), ageDays: num(s.ageDays),
      verified: typeof s.verified === "boolean" ? s.verified : undefined, location: str(s.location, 200),
    } : undefined,
    specs: strMap(l.specs), shipping: str(l.shipping, 500), returns: str(l.returns, 500), extractedWith: str(l.extractedWith, 40) ?? "api",
  };
}

export function parseIntent(v: unknown): ShoppingIntent | string {
  if (v == null) return {};
  if (typeof v !== "object" || Array.isArray(v)) return "'intent' must be an object";
  const i = v as Record<string, unknown>;
  const constraints = i.constraints && typeof i.constraints === "object" && !Array.isArray(i.constraints)
    ? Object.fromEntries(Object.entries(i.constraints as Record<string, unknown>).slice(0, 20)
      .filter(([, x]) => typeof x === "string" || typeof x === "number").map(([k, x]) => [k.slice(0, 40), typeof x === "string" ? x.slice(0, 100) : (x as number)]))
    : undefined;
  const budget = num(i.budget), quantity = num(i.quantity);
  if (budget != null && !(budget > 0)) return "'intent.budget' must be a positive number";
  if (quantity != null && !(Number.isInteger(quantity) && quantity >= 1 && quantity <= 1000)) return "'intent.quantity' must be a positive integer";
  return { request: str(i.request, 1000), budget, quantity, brand: str(i.brand, 100), model: str(i.model, 200), constraints };
}

export function parseShieldRequest(b: Record<string, unknown>): ShieldRequest | string {
  const intent = parseIntent(b.intent);
  if (typeof intent === "string") return intent;
  const market: MarketMode = b.market === "hidden" ? "hidden" : "reference";
  const llm = typeof b.llm === "boolean" ? b.llm : undefined;
  const ids = b.product_ids ?? b.productIds;
  if (Array.isArray(ids)) {
    const productIds = [...new Set(ids.filter((x): x is string => typeof x === "string" && /^[\w.-]{1,100}$/.test(x)))];
    if (!productIds.length) return "'product_ids' must be a non-empty array of product ids";
    if (productIds.length > 40) return "at most 40 product_ids per request";
    return { productIds, intent, market, llm, batch: true };
  }
  const id = b.product_id ?? b.productId;
  if (typeof id === "string" && id) return { productIds: [id.slice(0, 100)], intent, market, llm };
  if (b.listing !== undefined) {
    const listing = parseListing(b.listing);
    if (typeof listing === "string") return listing;
    return { listing, intent, market, llm };
  }
  return "send 'product_id', 'product_ids' or 'listing'";
}
