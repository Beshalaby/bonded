// Arena: the sandbox store agents shop in. Seeding, search, carts, checkout (+ guardrail in the session's mode).
import { NextResponse } from "next/server";
import { emptyDb, mutate, read, replace, uid } from "./db";
import { publish } from "./events";
import { append } from "./recorder";
import { agentKeyFrom, isInternalRequest } from "./auth-node";
import * as guardian from "./guardian";
import { onCheckout, onSessionStart } from "./nessie";
import { CATEGORY_SYNONYMS, generateSeed } from "./seed";
import type { Cart, GuardianVerdict, GuardrailMode, Merchant, Product, Session, TaskSpec, Transaction } from "./types";

export { CATEGORIES, CATEGORY_LABELS, DEMO_IDS } from "./seed";

/** What agents see. Never includes trap / marketPrice / source. */
export type AgentProduct = Omit<Product, "trap" | "marketPrice" | "source"> & {
  merchantName?: string;
  merchantVerified?: boolean;
};

export class ArenaError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Route helper: run fn, map ArenaError → JSON error response. */
export async function handle(fn: () => unknown | Promise<unknown>) {
  try {
    return NextResponse.json(await fn());
  } catch (e) {
    if (e instanceof ArenaError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[arena]", e);
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}

// ---------------------------------------------------------------- seeding
export function seedArena(opts: { reset?: boolean; wipe?: boolean; seed?: number } = {}) {
  const db = read();
  if (opts.wipe) {
    const fresh = emptyDb();
    const g = generateSeed(opts.seed ?? 42);
    fresh.merchants = g.merchants; fresh.products = g.products; fresh.meta.seededAt = new Date().toISOString();
    replace(fresh);
  } else if (opts.reset || db.products.length === 0) {
    const g = generateSeed(opts.seed ?? 42);
    mutate((d) => { d.merchants = g.merchants; d.products = g.products; d.meta.seededAt = new Date().toISOString(); });
  }
  const after = read();
  const traps: Record<string, number> = {};
  after.products.forEach((p) => p.trap && (traps[p.trap.type] = (traps[p.trap.type] || 0) + 1));
  return { products: after.products.length, merchants: after.merchants.length, traps, seededAt: after.meta.seededAt };
}

export function ensureSeeded() {
  if (read().products.length === 0) seedArena();
}

// ---------------------------------------------------------------- products
export function getMerchant(id: string): Merchant | undefined {
  return read().merchants.find((m) => m.id === id);
}

export function getProduct(id: string): Product | undefined {
  ensureSeeded();
  return read().products.find((p) => p.id === id);
}

export function toAgentProduct(p: Product): AgentProduct {
  const { trap: _t, marketPrice: _m, source: _s, ...rest } = p;
  void _t; void _m; void _s;
  const m = getMerchant(p.merchantId);
  return { ...rest, merchantName: m?.name, merchantVerified: m?.verified };
}

const STOP = new Set(["the", "a", "an", "for", "with", "and", "of", "to", "me", "my", "i", "buy", "get", "want", "need", "please", "under", "in", "on", "some", "new"]);
export function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9.]+/g, " ").split(" ")
    .map((t) => t.replace(/^\.+|\.+$/g, "").replace(/^cancell/, "cancel").replace(/^colour/, "color").replace(/^tee$/, "shirt")).filter((t) => t && (t.length > 1 || /\d/.test(t)) && !STOP.has(t));
}

function tokMatch(q: string, docTokens: string[]): boolean {
  return docTokens.some((d) => d === q || d.startsWith(q) || (q.length >= 4 && d.length >= 3 && q.startsWith(d) && q.length - d.length <= 2));
}

export function search(opts: { q?: string; category?: string; maxPrice?: number; limit?: number; includeTraps?: boolean }): Product[] {
  ensureSeeded();
  const db = read();
  const qt = tokenize(opts.q || "");
  const mById = new Map(db.merchants.map((m) => [m.id, m]));
  const scored: { p: Product; score: number }[] = [];
  for (const p of db.products) {
    if (opts.category && p.category !== opts.category) continue;
    if (opts.maxPrice != null && !Number.isNaN(opts.maxPrice) && p.price > opts.maxPrice) continue;
    let score = 0;
    if (qt.length) {
      const fields: [string[], number][] = [
        [tokenize(p.model || ""), 5], [tokenize(p.brand), 4], [tokenize(p.title), 3],
        [tokenize(`${p.category} ${CATEGORY_SYNONYMS[p.category] || ""}`), 2],
        [tokenize(Object.values(p.specs || {}).join(" ")), 1.5], [tokenize(p.description), 0.4],
      ];
      let matched = 0, strong = false;
      for (const q of qt) {
        let best = 0;
        for (const [toks, w] of fields) if (w > best && tokMatch(q, toks)) best = w;
        if (best > 0) matched++;
        if (best >= 2) strong = true;
        score += best;
      }
      const coverage = matched / qt.length;
      if (!strong || coverage < (qt.length <= 3 ? 1 : 0.7)) continue;
      score *= coverage * coverage * coverage;
    }
    const m = mById.get(p.merchantId);
    const pop = (p.rating / 5) * Math.log10(p.reviewCount + 1) * 0.35 + (m && m.ageDays > 30 ? 0.1 : 0);
    scored.push({ p, score: score + pop });
  }
  scored.sort((a, b) => b.score - a.score || a.p.price - b.p.price);
  return scored.slice(0, Math.min(Math.max(opts.limit ?? 20, 1), 200)).map((s) => s.p);
}

// ---------------------------------------------------------------- sessions
export function getSession(id: string | null | undefined): Session | undefined {
  if (!id) return undefined;
  return read().sessions.find((s) => s.id === id);
}

export function requireSession(id: string | null | undefined): Session {
  if (!id) throw new ArenaError(400, "sessionId required (body.sessionId or x-session-id header)");
  const s = getSession(id);
  if (!s) throw new ArenaError(404, `unknown session ${id}`);
  return s;
}

export function slugModel(model: string) {
  return model.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const GUARDRAIL_MODES: GuardrailMode[] = ["off", "observe", "enforce"];
export function parseGuardrail(v: unknown, fallback: GuardrailMode = "observe"): GuardrailMode {
  if (v == null || v === "") return fallback;
  if (!GUARDRAIL_MODES.includes(v as GuardrailMode)) throw new ArenaError(400, `guardrail must be one of ${GUARDRAIL_MODES.join(", ")}`);
  return v as GuardrailMode;
}

export function createSession(b: { agentId?: string; model?: string; instruction?: string; budget?: number; constraints?: TaskSpec["constraints"]; taskId?: string; runId?: string; guardrail?: GuardrailMode },
  auth?: { keyId?: string; internal?: boolean }) {
  ensureSeeded();
  const model = b.model || "unknown";
  if (!b.instruction) throw new ArenaError(400, "instruction required");
  const budget = Number(b.budget);
  if (!Number.isFinite(budget) || budget <= 0) throw new ArenaError(400, "budget must be a positive number");
  const guardrail = parseGuardrail(b.guardrail);
  const runId = typeof b.runId === "string" && b.runId ? b.runId.slice(0, 120) : undefined;
  const agentId = b.agentId || `agent-${slugModel(model)}`;
  const task: TaskSpec = { instruction: b.instruction, budget, ...(b.constraints ? { constraints: b.constraints } : {}), ...(b.taskId ? { taskId: b.taskId } : {}) };
  const session: Session = { id: uid("ses"), agentId, model, task, status: "active", createdAt: new Date().toISOString(), guardrail, ...(runId ? { runId } : {}), ...(auth?.keyId ? { agentKeyId: auth.keyId } : !auth?.internal ? { unverified: true } : {}) };
  mutate((db) => {
    if (!db.agents.find((a) => a.id === agentId)) db.agents.push({ id: agentId, name: agentId, model, createdAt: session.createdAt });
    db.sessions.push(session);
    db.carts.push({ sessionId: session.id, items: [] });
  });
  // Identity: an agent key (server-derived agentId/model) or the server's own runner; anything else is self-asserted.
  const ident = auth?.keyId ? { agentKeyId: auth.keyId } : auth?.internal ? {} : { unverified: true };
  append(session.id, "system", "session_start", { agentId, model, task, runId: runId ?? null, guardrail, ...ident });
  onSessionStart(session); // Capital One (Nessie) wallet + budget deposit, in the background; never throws
  return { sessionId: session.id, agentId, runId: runId ?? null, guardrail };
}

/**
 * A session created with an agent key belongs to that key: every later call on it must present the same
 * `Authorization: Bearer` key (or come from the server's own runner). Unkeyed sessions stay open, as before.
 */
export function assertSessionAccess(req: Request, sessionId: string | null | undefined) {
  if (!sessionId) return;
  const s = read().sessions.find((x) => x.id === sessionId);
  if (!s?.agentKeyId || isInternalRequest(req)) return;
  let keyId: string | null = null;
  try { keyId = agentKeyFrom(req)?.id ?? null; } catch { keyId = null; }
  if (!keyId) throw new ArenaError(401, "this session belongs to an agent key; send Authorization: Bearer <agent key>");
  if (keyId !== s.agentKeyId) throw new ArenaError(403, "agent key does not own this session");
}

// ---------------------------------------------------------------- logging helpers for read calls
export function logSearch(sessionId: string | null, q: { q?: string; category?: string; maxPrice?: number }, results: Product[]) {
  if (!sessionId) return;
  requireSession(sessionId);
  append(sessionId, "agent", "search", {
    query: q.q ?? "", category: q.category ?? null, maxPrice: q.maxPrice ?? null, count: results.length,
    results: results.map((p) => ({ id: p.id, title: p.title, brand: p.brand, price: p.price, merchantId: p.merchantId })),
  });
}

export function viewProduct(id: string, sessionId: string | null) {
  const p = getProduct(id);
  if (sessionId) requireSession(sessionId);
  if (!p) throw new ArenaError(404, `product ${id} not found`);
  const merchant = getMerchant(p.merchantId);
  const product = toAgentProduct(p);
  if (sessionId) append(sessionId, "agent", "view", { productId: p.id, title: p.title, brand: p.brand, price: p.price, listPrice: p.listPrice, merchantId: p.merchantId, description: p.description });
  return { product, merchant };
}

// ---------------------------------------------------------------- cart
export function cartView(sessionId: string) {
  const cart = read().carts.find((c) => c.sessionId === sessionId) || { sessionId, items: [] };
  const total = Math.round(cart.items.reduce((s, i) => s + i.qty * i.unitPrice, 0) * 100) / 100;
  const db = read();
  const items = cart.items.map((i) => {
    const p = db.products.find((x) => x.id === i.productId);
    return { ...i, title: p?.title, brand: p?.brand, merchantId: p?.merchantId };
  });
  return { cart: { sessionId, items }, total };
}

function assertMutable(s: Session) {
  if (s.status === "checked_out")
    throw new ArenaError(409, `session is ${s.status}; cart can no longer be changed`);
}

export function addToCart(sessionId: string, productId: string, qtyIn: unknown) {
  const s = requireSession(sessionId);
  assertMutable(s);
  const qty = Math.floor(Number(qtyIn ?? 1));
  if (!Number.isFinite(qty) || qty < 1) throw new ArenaError(400, "qty must be a positive integer");
  const p = getProduct(productId);
  if (!p) throw new ArenaError(404, `product ${productId} not found`);
  mutate((db) => {
    let cart = db.carts.find((c) => c.sessionId === sessionId);
    if (!cart) { cart = { sessionId, items: [] }; db.carts.push(cart); }
    const existing = cart.items.find((i) => i.productId === productId);
    const newQty = (existing?.qty ?? 0) + qty;
    if (newQty > p.stock) throw new ArenaError(400, `only ${p.stock} in stock`);
    if (existing) existing.qty = newQty;
    else cart.items.push({ productId, qty, unitPrice: p.price });
  });
  const view = cartView(sessionId);
  append(sessionId, "agent", "add_to_cart", { productId, qty, unitPrice: p.price, title: p.title, cartTotal: view.total });
  return view;
}

export function removeFromCart(sessionId: string, productId: string) {
  const s = requireSession(sessionId);
  assertMutable(s);
  mutate((db) => {
    const cart = db.carts.find((c) => c.sessionId === sessionId);
    if (cart) cart.items = cart.items.filter((i) => i.productId !== productId);
  });
  const view = cartView(sessionId);
  append(sessionId, "agent", "remove_from_cart", { productId, cartTotal: view.total });
  return view;
}

// ---------------------------------------------------------------- checkout
/**
 * Checkout runs the guardrail in the session's mode:
 *   off      → not run; always completes
 *   observe  → verdict recorded (trace + transaction), always completes   [default; what evals measure]
 *   enforce  → a "block" verdict stops the purchase (agent may fix the cart and retry)
 */
const g = globalThis as unknown as { __bondedCheckouts?: Set<string> };
const inflight: Set<string> = g.__bondedCheckouts ?? (g.__bondedCheckouts = new Set());

export async function checkout(sessionId: string, reasoning?: string) {
  const session = requireSession(sessionId);
  if (session.status === "checked_out") throw new ArenaError(409, "session already checked_out");
  // Concurrent checkouts for one session would both pass the status check before either awaits the
  // guardrail/bank, double-charging the card. Check-and-set synchronously, release when done.
  if (inflight.has(sessionId)) throw new ArenaError(409, "checkout already in progress for this session");
  inflight.add(sessionId);
  try {
    return await checkoutLocked(session, sessionId, reasoning);
  } finally {
    inflight.delete(sessionId);
  }
}

async function checkoutLocked(session: Session, sessionId: string, reasoning?: string) {
  const mode: GuardrailMode = session.guardrail ?? "observe";
  const db = read();
  const cart: Cart = JSON.parse(JSON.stringify(db.carts.find((c) => c.sessionId === sessionId) || { sessionId, items: [] }));
  if (!cart.items.length) throw new ArenaError(400, "cart is empty");
  const total = Math.round(cart.items.reduce((s, i) => s + i.qty * i.unitPrice, 0) * 100) / 100;
  append(sessionId, "agent", "checkout_requested", { reasoning: reasoning ?? null, items: cart.items, total });

  let verdict: GuardianVerdict;
  if (mode === "off") {
    verdict = { decision: "approve", reasons: [], judge: { used: "heuristic", summary: "Guardrail off for this session." } };
  } else {
    const products = cart.items.map((i) => db.products.find((p) => p.id === i.productId)).filter(Boolean) as Product[];
    verdict = await guardian.checkCart(session, cart, products, db.merchants);
    append(sessionId, "guardrail", "guardrail_verdict", { mode, ...verdict });
  }

  const status: Transaction["status"] = mode === "enforce" && verdict.decision === "block" ? "blocked" : "completed";
  const tx: Transaction = {
    id: uid("tx"), sessionId, agentId: session.agentId, model: session.model, ...(session.runId ? { runId: session.runId } : {}),
    amount: total, items: cart.items, guardrail: { ...verdict, mode }, status, createdAt: new Date().toISOString(),
  };
  mutate((d) => {
    d.transactions.push(tx);
    const s = d.sessions.find((x) => x.id === sessionId);
    if (s) { s.transactionId = tx.id; s.status = status === "completed" ? "checked_out" : "blocked"; }
  });
  append(sessionId, "system", "checkout_result", {
    transactionId: tx.id, status, amount: total, guardrailMode: mode, guardrailDecision: verdict.decision,
    reason: status === "blocked" ? `guardrail blocked (${verdict.reasons.filter((r) => r.severity === "critical").map((r) => r.code).join(", ")})`
      : mode === "observe" && verdict.decision !== "approve" ? `completed; guardrail would have ${verdict.decision === "block" ? "blocked" : "asked"} (observe mode)` : "completed",
  });
  publish("transaction", tx);
  // Bank: one Nessie purchase per merchant (or a logged decline). Never throws; a failure is a `bank_error` entry.
  const bank = await onCheckout({
    session, status, items: cart.items, total, merchants: db.merchants,
    products: cart.items.map((i) => db.products.find((p) => p.id === i.productId)).filter(Boolean) as Product[],
    reason: status === "blocked" ? "guardrail block" : undefined,
  });
  return { transaction: tx, guardrail: tx.guardrail, bank };
}

// ---------------------------------------------------------------- admin
export function injectProducts(list: Partial<Product>[], merchants: Partial<Merchant>[] = []) {
  ensureSeeded();
  const now = new Date().toISOString();
  const created: Product[] = [];
  mutate((db) => {
    for (const m of merchants) {
      if (!m.id || db.merchants.find((x) => x.id === m.id)) continue;
      db.merchants.push({ id: m.id, name: m.name || m.id, ageDays: m.ageDays ?? 3, verified: m.verified ?? false, rating: m.rating ?? 4.5 });
    }
    for (const raw of list) {
      if (!raw || !raw.title) continue;
      let id = raw.id && !db.products.find((p) => p.id === raw.id) ? raw.id : uid("p_rt");
      if (!/^[A-Za-z0-9_\-]+$/.test(id)) id = uid("p_rt");
      const price = Number(raw.price ?? 0);
      const merchantId = raw.merchantId || "m_shopzilla88";
      if (!db.merchants.find((m) => m.id === merchantId)) {
        db.merchants.push({ id: merchantId, name: merchantId.replace(/^m_/, ""), ageDays: 2, verified: false, rating: 4.8 });
      }
      const p: Product = {
        id, title: raw.title, brand: raw.brand || "Generic", category: raw.category || "audio", model: raw.model,
        price, listPrice: Number(raw.listPrice ?? price), marketPrice: Number(raw.marketPrice ?? price), merchantId,
        rating: Number(raw.rating ?? 4.6), reviewCount: Number(raw.reviewCount ?? 120), description: raw.description || "",
        specs: raw.specs || {}, stock: Number(raw.stock ?? 50), image: raw.image, trap: raw.trap,
        source: raw.source === "seed" ? "seed" : "redteam", createdAt: raw.createdAt || now,
      };
      db.products.push(p);
      created.push(p);
    }
  });
  publish("product", { action: "inject", count: created.length, ids: created.map((p) => p.id) });
  return { products: created };
}

export function deleteProducts(opts: { source?: string | null; id?: string | null }) {
  if (!opts.source && !opts.id) throw new ArenaError(400, "pass ?source=redteam or ?id=");
  const n = mutate((db) => {
    const before = db.products.length;
    db.products = db.products.filter((p) => !((opts.id && p.id === opts.id) || (opts.source && p.source === opts.source)));
    return before - db.products.length;
  });
  publish("product", { action: "delete", count: n, ...opts });
  return { deleted: n };
}
