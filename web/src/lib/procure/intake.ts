// Intake: turn a free-text purchase request into a PurchaseSpec. The single biggest accuracy lever is refusing
// to guess on details that change what gets bought (size, generation, capacity), so ambiguities are explicit:
// blocking ones send the proposal back to the user as questions instead of a purchase.
import { HAS_LLM, chatJSON } from "../llm";
import type { PurchaseSpec } from "./types";

export interface IntakeInput {
  request: string;
  budget?: number;
  quantity?: number;
  constraints?: Record<string, string | number>;
}

const NUMWORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, dozen: 12 };
const SIZED = /\b(shoes?|sneakers?|boots?|shirt|tee|t-shirt|hoodie|jacket|pants|jeans|shorts|socks|dress|sweater|leggings)\b/i;
const CAPACITY = /\b(iphone|ipad|macbook|galaxy s\d|pixel \d|ssd|sd card|flash drive|microsd)\b/i;

function heuristic(i: IntakeInput): PurchaseSpec {
  const r = i.request.trim();
  const low = r.toLowerCase();
  const c = i.constraints ?? {};
  const qtyM = low.match(/\b(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|dozen)\s+(?!gb|tb|mb|inch|in\b|oz|ml|mah|w\b|%)/);
  const quantity = i.quantity ?? (Number(c.quantity) || (qtyM ? Number(qtyM[1]) || NUMWORDS[qtyM[1]] || 1 : 1));
  const budgetM = low.match(/(?:under|below|less than|max(?:imum)?|budget(?: of)?|up to|within)\s*\$\s?(\d+(?:\.\d+)?)/) || low.match(/\$\s?(\d+(?:\.\d+)?)/);
  const budget = i.budget ?? (Number(c.budget) || (budgetM ? Number(budgetM[1]) : undefined));
  const variant: Record<string, string> = {};
  for (const k of ["size", "color", "colour", "capacity", "storage"]) if (c[k] !== undefined) variant[k === "colour" ? "color" : k] = String(c[k]);
  const sizeM = low.match(/\bsize\s*[:=]?\s*([a-z0-9.]+)/);
  if (sizeM && !variant.size) variant.size = sizeM[1];
  const capM = low.match(/\b(\d+\s?(?:gb|tb))\b/);
  if (capM && !variant.capacity) variant.capacity = capM[1].replace(/\s/g, "").toUpperCase();
  const ambiguities: PurchaseSpec["ambiguities"] = [];
  if (SIZED.test(r) && !variant.size) ambiguities.push({ question: "What size?", blocking: true, assumption: "none: size changes the item" });
  if (CAPACITY.test(r) && !variant.capacity) ambiguities.push({ question: "Which storage capacity?", blocking: false, assumption: "base capacity" });
  const item = r.replace(/\b(please|buy|get|order|purchase|me|i need|i want|find|for under|under|below|less than)\b/gi, " ")
    .replace(/\$\s?\d+(\.\d+)?/g, " ").replace(/\s+/g, " ").trim();
  return {
    request: r, item: item || r, variant, quantity, budget, condition: /refurb/i.test(r) ? "refurbished" : /\bused\b/i.test(r) ? "used" : "new",
    mustHave: [], avoid: [], ambiguities, searchQueries: [item || r], parsedBy: "heuristic",
    ...(c.brand ? { brand: String(c.brand) } : {}),
  };
}

const SYSTEM = `You turn a shopping request into a precise purchase spec for a buying agent. Be literal: never upgrade, downgrade or substitute what the user named.
Return JSON:
{"item": "canonical product name incl. brand/model/generation if implied",
 "brand": string|null, "model": string|null,
 "variant": {"size"?:..., "color"?:..., "capacity"?:..., ...only what the user stated},
 "quantity": integer, "budget": number|null (hard limit on the order total in USD),
 "condition": "new"|"refurbished"|"used"|"any",
 "mustHave": [short strings], "avoid": [short strings, e.g. "knockoffs", "accessories", "older generation"],
 "ambiguities": [{"question": "...", "blocking": boolean, "assumption": "what you'd assume if not blocking"}],
 "searchQueries": [2-3 diverse web search queries that would find this exact item for sale]}
An ambiguity is blocking only when a reasonable guess risks buying the wrong thing (shoe size, clothing size, which of several distinct products).
Generation/edition when the user said "latest" or named one is NOT ambiguous. Don't invent constraints.`;

export async function parseRequest(i: IntakeInput): Promise<PurchaseSpec> {
  const base = heuristic(i);
  if (!HAS_LLM) return base;
  const r = await chatJSON<Partial<PurchaseSpec> & { brand?: string | null; model?: string | null; budget?: number | null }>(
    SYSTEM,
    `Request: ${i.request}\n${i.budget != null ? `Budget (hard): $${i.budget}\n` : ""}${i.quantity != null ? `Quantity: ${i.quantity}\n` : ""}${i.constraints ? `Constraints: ${JSON.stringify(i.constraints)}\n` : ""}`,
    { deadlineMs: 20000 },
  );
  if (!r || typeof r.item !== "string") return base;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 8) : []);
  const variant = Object.fromEntries(Object.entries(r.variant && typeof r.variant === "object" ? r.variant : {})
    .filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)]));
  const ambiguities = (Array.isArray(r.ambiguities) ? r.ambiguities : [])
    .filter((a) => a && typeof a.question === "string")
    .map((a) => ({ question: a.question, blocking: !!a.blocking, assumption: String(a.assumption ?? "") }))
    .slice(0, 4);
  return {
    request: base.request,
    item: r.item,
    ...(r.brand ? { brand: r.brand } : base.brand ? { brand: base.brand } : {}),
    ...(r.model ? { model: r.model } : {}),
    variant: { ...variant, ...base.variant }, // caller-supplied constraints win
    quantity: i.quantity ?? (Number.isInteger(r.quantity) && r.quantity! > 0 ? r.quantity! : base.quantity),
    budget: i.budget ?? (typeof r.budget === "number" && r.budget > 0 ? r.budget : base.budget),
    condition: ["new", "refurbished", "used", "any"].includes(String(r.condition)) ? r.condition as PurchaseSpec["condition"] : base.condition,
    mustHave: strs(r.mustHave),
    avoid: strs(r.avoid),
    ambiguities: [
      ...ambiguities.filter((a) => !(a.blocking && Object.keys(base.variant).some((k) => a.question.toLowerCase().includes(k)))),
      // the deterministic size check stays even when the model misses it ("Air Force 1 in white" has no size)
      ...base.ambiguities.filter((h) => h.blocking && !variant.size && !ambiguities.some((a) => /size/i.test(a.question))),
    ],
    searchQueries: strs(r.searchQueries).length ? strs(r.searchQueries).slice(0, 3) : base.searchQueries,
    parsedBy: "llm",
  };
}
