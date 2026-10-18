// Real-world listing checks: URL or pasted text -> NormalizedListing -> Bonded Shield verdict.
// Shared by POST /api/check, the /check page and the MCP tools vet_listing / send_listing. Never buys anything.
import { mutate, read, uid } from "@/lib/db";
import { publish } from "@/lib/events";
import type { SentListing } from "@/lib/types";
import type { NormalizedListing, ShieldVerdict, ShoppingIntent } from "../types";
import { analyze } from "./analyzer";
import {
  composeDescription, descriptionDocText, ebayDescriptionUrl, ExtractError, extractListing, mergeShopifyJson, shopifyProductJsonUrl, siteKey,
} from "./extract";
import { BlockedError, checkUrl, FetchError, safeFetch, siteOf } from "./fetch";
import { listingFromText, MAX_PASTE } from "./pasted";

export const CACHE_TTL_MS = 10 * 60 * 1000;

export interface CheckInput { url?: string; text?: string; intent?: ShoppingIntent }
export interface CheckFetched {
  status: number;            // upstream HTTP status (0 for pasted text)
  site: string;
  extractedWith?: string;
  blocked?: boolean;
  reason?: string;           // why it was blocked
  finalUrl?: string;
  ms: number;
  cached?: boolean;
}
export interface CheckResult {
  listing: NormalizedListing | null;
  verdict: ShieldVerdict | null;
  fetched: CheckFetched;
  /** Set when the page couldn't be read: the UI offers to paste the listing text instead. */
  fallback?: "paste";
  message?: string;
}

export class CheckError extends Error {
  constructor(public status: number, public code: string, message: string, public fallback?: "paste") { super(message); this.name = "CheckError"; }
}

// ---------------------------------------------------------------- cache (per process; keyed by URL + intent)
type Entry = { at: number; result: CheckResult };
const g = globalThis as unknown as { __bondedCheckCache?: Map<string, Entry>; __bondedCheckInflight?: Map<string, Promise<CheckResult>> };
const cache: Map<string, Entry> = g.__bondedCheckCache ?? (g.__bondedCheckCache = new Map());
const inflight: Map<string, Promise<CheckResult>> = g.__bondedCheckInflight ?? (g.__bondedCheckInflight = new Map());

function cacheGet(key: string): CheckResult | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  if (Date.now() - e.at > CACHE_TTL_MS) { cache.delete(key); return undefined; }
  return e.result;
}
function cacheSet(key: string, result: CheckResult) {
  if (cache.size >= 300) { const oldest = cache.keys().next().value; if (oldest) cache.delete(oldest); }
  cache.set(key, { at: Date.now(), result });
}
/** Test hook. */
export function clearCheckCache() { cache.clear(); inflight.clear(); }

const intentKey = (i?: ShoppingIntent) => (i && (i.request || i.budget) ? `|${(i.request ?? "").trim().toLowerCase()}|${i.budget ?? ""}` : "");

/** Validate and normalise a request body. Returns an error string on bad input. */
export function parseCheckInput(b: unknown): CheckInput | string {
  if (!b || typeof b !== "object") return "Send JSON: {url} or {text}.";
  const o = b as Record<string, unknown>;
  const url = typeof o.url === "string" && o.url.trim() ? o.url.trim() : undefined;
  const text = typeof o.text === "string" && o.text.trim() ? o.text : undefined;
  if (!url && !text) return "Paste a listing link (url) or the listing text (text).";
  if (url && url.length > 2048) return "That link is too long.";
  if (text && text.length > MAX_PASTE) return `The pasted text is too long (max ${MAX_PASTE.toLocaleString()} characters).`;
  let intent: ShoppingIntent | undefined;
  const i = (o.intent && typeof o.intent === "object" ? o.intent : {}) as Record<string, unknown>;
  const request = typeof i.request === "string" ? i.request.trim().slice(0, 500) : typeof o.request === "string" ? o.request.trim().slice(0, 500) : "";
  const budgetRaw = i.budget ?? o.budget;
  const budget = budgetRaw == null || budgetRaw === "" ? undefined : Number(budgetRaw);
  if (budget !== undefined && !(Number.isFinite(budget) && budget > 0 && budget < 1e7)) return "Budget must be a positive number.";
  if (request || budget) intent = { ...(request ? { request } : {}), ...(budget ? { budget } : {}) };
  return { url, text, intent };
}

// ---------------------------------------------------------------- pipeline
async function fromUrl(url: string, intent?: ShoppingIntent): Promise<CheckResult> {
  const t0 = Date.now();
  const u = (() => { try { return checkUrl(url); } catch (e) { throw toCheckError(e); } })();
  const site = siteOf(u);
  let page;
  try { page = await safeFetch(u.href); }
  catch (e) {
    if (e instanceof BlockedError) {
      return {
        listing: null, verdict: null, fallback: "paste",
        fetched: { status: e.status, site, blocked: true, reason: e.reason, ms: Date.now() - t0 },
        message: `${site} doesn't let automated checkers read its pages. Paste the listing text instead and Shield will check that.`,
      };
    }
    throw toCheckError(e);
  }
  let listing: NormalizedListing;
  try { listing = extractListing(page.body, page.url); }
  catch (e) { throw toCheckError(e); }

  // eBay keeps the seller's description in an iframe on another host: fetch it through the same safe fetcher.
  if (siteKey(siteOf(page.url)) === "ebay") {
    const d = ebayDescriptionUrl(page.body, page.url);
    if (d) {
      try {
        const doc = await safeFetch(d, { timeoutMs: 5000, maxBytes: 1024 * 1024, headers: { Referer: page.url } });
        const t = descriptionDocText(doc.body);
        if (t.visible || t.hidden.length) listing = { ...listing, description: composeDescription(t.visible, t.hidden, t.comments) };
      } catch { /* the main page is enough */ }
    }
  }
  // Shopify stores often leave the price out of the HTML; their public product JSON has it.
  if (listing.price == null) {
    const j = shopifyProductJsonUrl(page.body, page.url);
    if (j) {
      try { listing = mergeShopifyJson(listing, (await safeFetch(j, { timeoutMs: 4000, maxBytes: 512 * 1024, extraTypes: /^(text|application)\/javascript\b/ })).body); }
      catch { /* keep what we have */ }
    }
  }
  const verdict = await analyze(listing, intent);
  return {
    listing, verdict,
    fetched: { status: page.status, site: siteOf(page.url) || site, extractedWith: listing.extractedWith, finalUrl: page.url !== u.href ? page.url : undefined, ms: Date.now() - t0 },
  };
}

async function fromText(text: string, url: string | undefined, intent?: ShoppingIntent): Promise<CheckResult> {
  const t0 = Date.now();
  let hint: string | undefined;
  if (url) { try { hint = checkUrl(url).href; } catch { hint = undefined; } }
  const listing = await listingFromText(text, hint);
  const verdict = await analyze(listing, intent);
  return { listing, verdict, fetched: { status: 0, site: listing.site ?? "pasted", extractedWith: listing.extractedWith, ms: Date.now() - t0 } };
}

function toCheckError(e: unknown): CheckError {
  if (e instanceof CheckError) return e;
  if (e instanceof ExtractError) return new CheckError(422, "not_a_listing", `${e.message} Paste the listing text instead.`, "paste");
  if (e instanceof FetchError) {
    switch (e.code) {
      case "bad_url": return new CheckError(400, e.code, e.message);
      case "blocked_host": return new CheckError(400, e.code, "That link points to a private or internal address, so it can't be checked.");
      case "dns": return new CheckError(400, e.code, e.message);
      case "content_type": return new CheckError(422, e.code, `${e.message} Link to a product page instead.`);
      case "too_large": return new CheckError(422, e.code, `${e.message} Paste the listing text instead.`, "paste");
      case "timeout": return new CheckError(504, e.code, "The site took too long to answer. Paste the listing text instead.", "paste");
      case "http": return new CheckError(502, e.code, `${e.message} The listing may have ended or moved.`, "paste");
      default: return new CheckError(502, e.code, `${e.message}`, "paste");
    }
  }
  console.error("[check]", e);
  return new CheckError(500, "internal", "Something went wrong checking that listing.");
}

/** Check a listing by URL or pasted text. Results for URLs are cached for 10 minutes. */
export async function checkListing(input: CheckInput): Promise<CheckResult> {
  if (input.text) {
    try { return await fromText(input.text, input.url, input.intent); } catch (e) { throw toCheckError(e); }
  }
  if (!input.url) throw new CheckError(400, "bad_request", "Paste a listing link or the listing text.");
  let key: string;
  try { key = checkUrl(input.url).href + intentKey(input.intent); } catch (e) { throw toCheckError(e); }
  const hit = cacheGet(key);
  if (hit) return { ...hit, fetched: { ...hit.fetched, cached: true } };
  const running = inflight.get(key);
  if (running) return running;
  const p = fromUrl(input.url, input.intent).then((r) => { cacheSet(key, r); return r; }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ---------------------------------------------------------------- send to user (MCP send_listing)
export function sentListing(id: string): SentListing | undefined {
  return (read().sentListings ?? []).find((x) => x.id === id);
}

/** Record that an agent sent a vetted listing to its user instead of buying it, and announce it on the live feed. */
export async function sendListing(input: { url: string; note?: string; agent?: string; intent?: ShoppingIntent }): Promise<SentListing> {
  const r = await checkListing({ url: input.url, intent: input.intent });
  if (!r.listing || !r.verdict) {
    throw new CheckError(422, "blocked", `${r.fetched.site} blocked the check, so there is no vetted listing to send. Call vet_listing with the listing text (text) first, or send the link to the user unvetted.`);
  }
  const listing: Omit<NormalizedListing, "description"> & { description?: string } = { ...r.listing };
  delete listing.description;
  const rec: SentListing = {
    id: uid("sl"),
    url: r.listing.url ?? input.url,
    site: r.listing.site,
    ...(input.note ? { note: input.note.slice(0, 500) } : {}),
    ...(input.agent ? { agent: input.agent.slice(0, 60) } : {}),
    listing,
    verdict: r.verdict,
    createdAt: new Date().toISOString(),
  };
  mutate((d) => {
    const arr = (d.sentListings ??= []);
    arr.push(rec);
    if (arr.length > 500) arr.splice(0, arr.length - 500);
  });
  publish("listing", {
    id: rec.id, url: rec.url, site: rec.site, title: listing.title, price: listing.price, currency: listing.currency,
    decision: r.verdict.decision, headline: r.verdict.headline, agent: rec.agent, note: rec.note, createdAt: rec.createdAt,
  });
  return rec;
}
