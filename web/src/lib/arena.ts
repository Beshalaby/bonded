// OWNER: Team 1 (Arena). Sandbox store: seeding, search, carts, checkout orchestration.
import { NextResponse } from "next/server";
import { emptyDb, mutate, read, replace, uid } from "./db";
import { publish } from "./events";
import { append } from "./recorder";
import * as guardian from "./guardian";
import * as risk from "./risk";
import { CATEGORY_SYNONYMS, generateSeed } from "./seed";
import type { Cart, Merchant, Product, Session, TaskSpec, Transaction } from "./types";

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

export function createSession(b: { agentId?: string; model?: string; instruction?: string; budget?: number; constraints?: TaskSpec["constraints"]; taskId?: string }) {
  ensureSeeded();
  const model = b.model || "unknown";
  if (!b.instruction) throw new ArenaError(400, "instruction required");
  const budget = Number(b.budget);
  if (!Number.isFinite(budget) || budget <= 0) throw new ArenaError(400, "budget must be a positive number");
  const agentId = b.agentId || `agent-${slugModel(model)}`;
  const task: TaskSpec = { instruction: b.instruction, budget, ...(b.constraints ? { constraints: b.constraints } : {}), ...(b.taskId ? { taskId: b.taskId } : {}) };
  const session: Session = { id: uid("ses"), agentId, model, task, status: "active", createdAt: new Date().toISOString() };
  mutate((db) => {
    if (!db.agents.find((a) => a.id === agentId)) db.agents.push({ id: agentId, name: agentId, model, createdAt: session.createdAt });
    db.sessions.push(session);
    db.carts.push({ sessionId: session.id, items: [] });
  });
  append(session.id, "system", "session_start", { agentId, model, task });
  return { sessionId: session.id, agentId };
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
  if (s.status === "checked_out" || s.status === "held")
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
export async function checkout(sessionId: string, reasoning?: string) {
  const session = requireSession(sessionId);
  if (session.status === "checked_out" || session.status === "held")
    throw new ArenaError(409, `session already ${session.status}`);
  const db = read();
  const cart: Cart = JSON.parse(JSON.stringify(db.carts.find((c) => c.sessionId === sessionId) || { sessionId, items: [] }));
  if (!cart.items.length) throw new ArenaError(400, "cart is empty");
  const total = Math.round(cart.items.reduce((s, i) => s + i.qty * i.unitPrice, 0) * 100) / 100;
  append(sessionId, "agent", "checkout_requested", { reasoning: reasoning ?? null, items: cart.items, total });

  const products = cart.items.map((i) => db.products.find((p) => p.id === i.productId)).filter(Boolean) as Product[];
  const verdict = await guardian.checkCart(session, cart, products, db.merchants);
  append(sessionId, "guardian", "guardian_verdict", verdict);

  const quote = await risk.quote(session.agentId, session.model, total);
  append(sessionId, "risk", "risk_quote", quote);

  const status: Transaction["status"] =
    verdict.decision === "block" ? "blocked" : verdict.decision === "ask" || !quote.withinLimit ? "held" : "approved";
  const tx: Transaction = {
    id: uid("tx"), sessionId, agentId: session.agentId, model: session.model, amount: total,
    items: cart.items, guardian: verdict, quote, status, createdAt: new Date().toISOString(),
  };
  mutate((d) => {
    d.transactions.push(tx);
    const s = d.sessions.find((x) => x.id === sessionId);
    if (s) { s.transactionId = tx.id; s.status = status === "approved" ? "checked_out" : status === "held" ? "held" : "blocked"; }
  });
  if (status === "approved") await risk.recordOutcome(session.agentId, session.model, true, `tx ${tx.id} approved`);
  append(sessionId, "system", "checkout_result", {
    transactionId: tx.id, status, amount: total,
    reason: status === "blocked" ? "guardian blocked" : status === "held" ? (verdict.decision === "ask" ? "guardian asked user" : "over spend limit") : "approved",
  });
  publish("transaction", tx);
  return { transaction: tx, guardian: verdict, quote };
}

export async function confirmTransaction(id: string, approve: boolean) {
  const tx = read().transactions.find((t) => t.id === id);
  if (!tx) throw new ArenaError(404, `transaction ${id} not found`);
  if (tx.status !== "held") throw new ArenaError(409, `transaction is ${tx.status}, not held`);
  const status: Transaction["status"] = approve ? "approved" : "blocked";
  const updated = mutate((d) => {
    const t = d.transactions.find((x) => x.id === id)!;
    t.status = status;
    const s = d.sessions.find((x) => x.id === t.sessionId);
    if (s) s.status = approve ? "checked_out" : "abandoned";
    return JSON.parse(JSON.stringify(t)) as Transaction;
  });
  append(tx.sessionId, "user", "user_confirmation", { transactionId: id, approve });
  if (approve) await risk.recordOutcome(tx.agentId, tx.model, true, `tx ${id} approved by user`);
  append(tx.sessionId, "system", "checkout_result", { transactionId: id, status, amount: tx.amount, reason: approve ? "user approved" : "user declined" });
  publish("transaction", updated);
  return { transaction: updated };
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
      let merchantId = raw.merchantId || "m_shopzilla88";
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
