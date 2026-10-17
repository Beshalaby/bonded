// Bonded's banking layer. Every agent gets a Capital One (Nessie) customer + Credit Card account; each task's
// budget is deposited when its session starts, and each completed checkout becomes one Nessie purchase per
// merchant in the cart. Works with the real HTTP backend (or a mock) and the in-process simulated ledger alike.
//
// Ids are cached in the store under db.nessie.backends[<backend key>] so wallets and merchants are created
// once per backend. Concurrent callers share one in-flight creation (no duplicate customers under load).
//
// Banking NEVER breaks checkout or grading: session/checkout hooks catch everything, log a redacted
// `bank_error` trace entry and carry on.
import crypto from "node:crypto";
import { mutate, read } from "../db";
import { append, getChain } from "../recorder";
import { displayName } from "../bench";
import type { CartItem, Merchant as ArenaMerchant, NessieBackendCache, NessieLedgerEntry, NessieWallet, Product, Session } from "../types";
import { NessieClient, backendConfig, redact, type NessieApi } from "./client";
import { SimulatedNessie } from "./simulated";

export type Provider = "capital_one_nessie" | "simulated_ledger";

// ---------------------------------------------------------------- backend selection
type G = {
  __nessieApi?: { sig: string; api: NessieApi };
  __nessieOverride?: NessieApi | null;
  __nessieInflight?: Map<string, Promise<unknown>>;
  __nessieFunding?: Map<string, Promise<NessieWallet | null>>;
};
const g = globalThis as unknown as G;
const inflight: Map<string, Promise<unknown>> = (g.__nessieInflight ??= new Map());
const funding: Map<string, Promise<NessieWallet | null>> = (g.__nessieFunding ??= new Map());

/** The active backend. Re-reads env on each call (cheap) so a config change never mixes backends. */
export function backend(): NessieApi {
  if (g.__nessieOverride) return g.__nessieOverride;
  const cfg = backendConfig();
  const sig = cfg.kind === "http" ? `http|${cfg.baseUrl}|${cfg.apiKey ? "k" : ""}` : "sim";
  if (g.__nessieApi?.sig !== sig) {
    g.__nessieApi = { sig, api: cfg.kind === "http" ? new NessieClient({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey }) : new SimulatedNessie() };
  }
  return g.__nessieApi.api;
}

/** Tests only: force a backend (null restores env-based selection). */
export function setBackendForTests(api: NessieApi | null) { g.__nessieOverride = api; }

export function providerInfo(api = backend()) {
  return {
    provider: api.label as Provider,
    simulated: api.simulated,
    /** true only against the real api.nessieisreal.com host (false for a mock or the simulated ledger). */
    live: api instanceof NessieClient ? api.isLive : false,
  };
}

function cacheOf(api: NessieApi): NessieBackendCache {
  return read().nessie?.backends?.[api.cacheKey] ?? { wallets: {}, merchants: {}, ledger: [] };
}
function writeCache<T>(api: NessieApi, fn: (c: NessieBackendCache) => T): T {
  return mutate((db) => {
    db.nessie ??= { backends: {} };
    db.nessie.backends ??= {};
    const c = (db.nessie.backends[api.cacheKey] ??= { wallets: {}, merchants: {}, ledger: [] });
    return fn(c);
  });
}

/** Run `fn` once per key at a time; concurrent callers await the same promise. */
function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const cur = inflight.get(key) as Promise<T> | undefined;
  if (cur) return cur;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ---------------------------------------------------------------- helpers
const today = () => new Date().toISOString().slice(0, 10);
const money = (x: number) => Math.round(x * 100) / 100;
const hashInt = (s: string) => crypto.createHash("sha256").update(s).digest().readUInt32BE(0);
const clean = (s: string, max = 40) => s.replace(/\s*\(sim\)\s*$/i, "").replace(/[^A-Za-z0-9 .\-']/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || "Agent";

/** Last four digits for display: the account number when Nessie gives one, else four digits derived from the id. */
export function last4(accountNumber: string | undefined, accountId: string): string {
  const d = (accountNumber ?? "").replace(/\D/g, "");
  if (d.length >= 4) return d.slice(-4);
  return String(hashInt(accountId) % 10000).padStart(4, "0");
}

const STREETS = ["Market St", "Tysons Blvd", "Capital Way", "Pennsylvania Ave", "Commerce Dr", "Harbor Pl", "Union Sq", "Elm St"];
const CITIES: [string, string, string, number, number][] = [
  ["McLean", "VA", "22102", 38.9339, -77.1773], ["Richmond", "VA", "23219", 37.5407, -77.436], ["Plano", "TX", "75024", 33.0198, -96.6989],
  ["Wilmington", "DE", "19801", 39.7447, -75.5484], ["New York", "NY", "10001", 40.7506, -73.9972], ["San Francisco", "CA", "94105", 37.7898, -122.3942],
  ["Chicago", "IL", "60601", 41.8853, -87.6229], ["College Park", "MD", "20742", 38.9869, -76.9426],
];
/** A plausible, deterministic address for a name. */
export function addressFor(seed: string) {
  const h = hashInt(seed);
  const [city, state, zip, lat, lng] = CITIES[h % CITIES.length];
  return {
    address: { street_number: String(100 + (h % 8900)), street_name: STREETS[(h >>> 8) % STREETS.length], city, state, zip },
    geocode: { lat: Math.round((lat + ((h >>> 4) % 100) / 5000) * 1e5) / 1e5, lng: Math.round((lng - ((h >>> 12) % 100) / 5000) * 1e5) / 1e5 },
  };
}

// ---------------------------------------------------------------- the banking API
/** Customer + Credit Card account for an agent, created once per agentId (per backend) and cached. */
export async function ensureAgentWallet(agentId: string, model: string): Promise<NessieWallet> {
  const api = backend();
  const hit = cacheOf(api).wallets[agentId];
  if (hit) return hit;
  return once(`wallet|${api.cacheKey}|${agentId}`, async () => {
    const again = cacheOf(api).wallets[agentId];
    if (again) return again;
    const name = clean(displayName(model || agentId));
    const customerId = await api.createCustomer({ first_name: "Agent", last_name: name, address: addressFor(agentId).address });
    const accountId = await api.createAccount(customerId, { type: "Credit Card", nickname: clean(`Bonded ${name}`, 60), rewards: 0, balance: 0 });
    let accountNumber: string | undefined;
    try { accountNumber = (await api.getAccount(accountId)).accountNumber; } catch { /* display digits fall back to the id */ }
    const w: NessieWallet = { agentId, model, displayName: displayName(model || agentId), customerId, accountId, accountLast4: last4(accountNumber, accountId), createdAt: new Date().toISOString() };
    writeCache(api, (c) => { c.wallets[agentId] = w; });
    return w;
  });
}

/** Mirror an Arena merchant to Nessie once; returns the Nessie merchant id. */
export async function ensureMerchant(m: Pick<ArenaMerchant, "id" | "name">): Promise<string> {
  const api = backend();
  const hit = cacheOf(api).merchants[m.id];
  if (hit) return hit;
  return once(`merchant|${api.cacheKey}|${m.id}`, async () => {
    const again = cacheOf(api).merchants[m.id];
    if (again) return again;
    const { address, geocode } = addressFor(`merchant:${m.id}`);
    const id = await api.createMerchant({ name: clean(m.name || m.id, 60), category: "Shopping", address, geocode });
    writeCache(api, (c) => { c.merchants[m.id] = id; });
    return id;
  });
}

function record(api: NessieApi, e: NessieLedgerEntry) {
  writeCache(api, (c) => { c.ledger.push(e); });
}

/** Deposit a task's budget into the agent's account. */
export async function fundForTask(wallet: NessieWallet, budget: number, sessionId: string): Promise<{ depositId: string; amount: number }> {
  const api = backend();
  const amount = money(budget);
  const description = `Bonded task budget ${sessionId}`;
  const depositId = await api.createDeposit(wallet.accountId, { medium: "balance", transaction_date: today(), status: "completed", amount, description });
  record(api, { kind: "deposit", id: depositId, agentId: wallet.agentId, accountId: wallet.accountId, sessionId, amount, description, date: today(), createdAt: new Date().toISOString() });
  return { depositId, amount };
}

/** One Nessie purchase. `merchant` is the Arena merchant; it is mirrored to Nessie on first use. */
export async function chargePurchase(o: { wallet: NessieWallet; merchant: Pick<ArenaMerchant, "id" | "name">; amount: number; description: string; sessionId: string }): Promise<{ purchaseId: string; merchantId: string; amount: number }> {
  const api = backend();
  const merchantId = await ensureMerchant(o.merchant);
  const amount = money(o.amount);
  const description = o.description.includes(o.sessionId) ? o.description : `Bonded ${o.sessionId} · ${o.description}`;
  const desc = description.slice(0, 140);
  const purchaseId = await api.createPurchase(o.wallet.accountId, { merchant_id: merchantId, medium: "balance", purchase_date: today(), amount, status: "completed", description: desc });
  record(api, {
    kind: "purchase", id: purchaseId, agentId: o.wallet.agentId, accountId: o.wallet.accountId, sessionId: o.sessionId, amount, description: desc,
    date: today(), createdAt: new Date().toISOString(), merchantId, arenaMerchantId: o.merchant.id, merchantName: o.merchant.name,
  });
  return { purchaseId, merchantId, amount };
}

export interface WalletPurchase { id: string; merchantId: string; merchantName: string; amount: number; date: string; status?: string; description: string; sessionId?: string }
export interface WalletRow {
  agentId: string; model: string; displayName: string; accountLast4: string;
  balance: number; balanceSource: "nessie" | "ledger"; purchases: number; spent: number; funded: number;
}

const SESSION_RE = /\bses_[a-z0-9]+\b/i;

function localTotals(c: NessieBackendCache, agentId: string) {
  const mine = c.ledger.filter((e) => e.agentId === agentId);
  const buys = mine.filter((e) => e.kind === "purchase");
  const spent = money(buys.reduce((s, e) => s + e.amount, 0));
  const funded = money(mine.filter((e) => e.kind === "deposit").reduce((s, e) => s + e.amount, 0));
  return { buys, spent, funded, balance: money(funded - spent) };
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => { const t = setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms); t.unref?.(); })]);

async function liveBalance(api: NessieApi, w: NessieWallet, fallback: number): Promise<{ balance: number; source: "nessie" | "ledger" }> {
  if (api.simulated) return { balance: fallback, source: "ledger" };
  try { return { balance: (await withTimeout(api.getAccount(w.accountId), 5000)).balance, source: "nessie" }; }
  catch { return { balance: fallback, source: "ledger" }; }
}

/** Every wallet on the active backend, with balance (live from Nessie when real) and purchase totals. */
export async function listWallets(): Promise<WalletRow[]> {
  const api = backend();
  const c = cacheOf(api);
  const rows = await Promise.all(Object.values(c.wallets).map(async (w) => {
    const t = localTotals(c, w.agentId);
    const b = await liveBalance(api, w, t.balance);
    return { agentId: w.agentId, model: w.model, displayName: w.displayName, accountLast4: w.accountLast4, balance: b.balance, balanceSource: b.source, purchases: t.buys.length, spent: t.spent, funded: t.funded };
  }));
  return rows.sort((a, b) => b.spent - a.spent || a.displayName.localeCompare(b.displayName));
}

/** One wallet: balance and recent purchases (read live from Nessie when real; the local ledger otherwise). */
export async function walletSummary(agentId: string, limit = 200): Promise<{ wallet: WalletRow; purchases: WalletPurchase[]; source: "nessie" | "ledger" } | null> {
  const api = backend();
  const c = cacheOf(api);
  const w = c.wallets[agentId];
  if (!w) return null;
  const t = localTotals(c, agentId);
  const b = await liveBalance(api, w, t.balance);
  const nameById = new Map<string, string>();
  for (const [arenaId, nid] of Object.entries(c.merchants)) nameById.set(nid, read().merchants.find((m) => m.id === arenaId)?.name ?? arenaId);
  let purchases: WalletPurchase[];
  let source: "nessie" | "ledger" = "ledger";
  const fromLedger = () => t.buys.map((e) => ({ id: e.id, merchantId: e.merchantId ?? "", merchantName: e.merchantName ?? nameById.get(e.merchantId ?? "") ?? "Merchant", amount: e.amount, date: e.date, status: "completed", description: e.description, sessionId: e.sessionId }));
  if (api.simulated) purchases = fromLedger();
  else {
    try {
      const live = await withTimeout(api.listPurchases(w.accountId), 8000);
      purchases = live.map((p) => ({ id: p.id, merchantId: p.merchantId, merchantName: nameById.get(p.merchantId) ?? "Merchant", amount: p.amount, date: p.date, status: p.status, description: p.description, sessionId: p.description.match(SESSION_RE)?.[0] }));
      source = "nessie";
    } catch { purchases = fromLedger(); }
  }
  purchases.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const live = source === "nessie";
  return {
    wallet: {
      agentId, model: w.model, displayName: w.displayName, accountLast4: w.accountLast4, balance: b.balance, balanceSource: b.source,
      purchases: live ? purchases.length : t.buys.length, spent: live ? money(purchases.reduce((s, p) => s + p.amount, 0)) : t.spent, funded: t.funded,
    },
    purchases: purchases.slice(0, limit), source,
  };
}

// ---------------------------------------------------------------- Arena hooks (never throw)
const errMsg = (e: unknown) => redact(String((e as Error)?.message || e)).slice(0, 300);

/** Session start: ensure the wallet and deposit the budget in the background. Returns immediately. */
/** Wallet identity. Self-asserted agentIds get their own namespace so an unverified caller can't fund or
 *  charge a verified agent's account by claiming its id. */
export function walletKey(s: Pick<Session, "agentId" | "unverified">): string {
  return s.unverified ? `unverified:${s.agentId}` : s.agentId;
}
/** Hard cap on what a single task can deposit, whatever budget the caller claims. */
export const MAX_TASK_FUNDING = 10_000;

export function onSessionStart(session: Pick<Session, "id" | "agentId" | "model" | "task" | "unverified">): void {
  let api: NessieApi;
  try { api = backend(); } catch (e) { console.error("[nessie]", errMsg(e)); return; }
  const info = providerInfo(api);
  const p = (async () => {
    try {
      const wallet = await ensureAgentWallet(walletKey(session), session.model);
      const dep = await fundForTask(wallet, Math.min(Math.max(0, Number(session.task.budget) || 0), MAX_TASK_FUNDING), session.id);
      append(session.id, "system", "bank_funded", { provider: info.provider, simulated: info.simulated, accountLast4: wallet.accountLast4, amount: dep.amount, depositId: dep.depositId });
      return wallet;
    } catch (e) {
      const error = errMsg(e);
      console.warn("[nessie] funding failed:", error);
      append(session.id, "system", "bank_error", { stage: "fund", provider: info.provider, simulated: info.simulated, error });
      return null;
    }
  })();
  funding.set(session.id, p);
  const t = setTimeout(() => funding.delete(session.id), 60 * 60_000);
  t.unref?.();
}

export interface CheckoutBank {
  provider: Provider; simulated: boolean;
  status: "charged" | "declined" | "error" | "pending";
  accountLast4?: string; amount: number; purchaseIds?: string[]; error?: string;
}

/**
 * Checkout: charge one purchase per merchant (completed) or log a decline (blocked). Never throws; gives up
 * waiting after `waitMs` (the charge then finishes in the background and still lands in the trace).
 */
export async function onCheckout(o: {
  session: Pick<Session, "id" | "agentId" | "model" | "unverified">; status: "completed" | "blocked"; items: CartItem[]; products: Product[];
  merchants: ArenaMerchant[]; total: number; reason?: string; waitMs?: number;
}): Promise<CheckoutBank> {
  let api: NessieApi;
  try { api = backend(); } catch (e) { return { provider: "simulated_ledger", simulated: true, status: "error", amount: o.total, error: errMsg(e) }; }
  const info = providerInfo(api);
  const base = { provider: info.provider, simulated: info.simulated, amount: o.total };

  const work = (async (): Promise<CheckoutBank> => {
    try {
      const funded: NessieWallet | null = await withTimeout<NessieWallet | null>(funding.get(o.session.id) ?? Promise.resolve(null), 12_000).catch(() => null);
      // Never charge a session twice. Only a prior *charge* short-circuits: a blocked (declined) attempt can be
      // followed by an edited cart and a completed checkout, which must still be charged.
      const prior = getChain(o.session.id).find((e) => e.action === "bank_charge");
      if (prior) {
        const pl = prior.payload as { accountLast4?: string };
        return { ...base, status: "charged", accountLast4: pl.accountLast4 } as CheckoutBank;
      }
      const wallet = funded ?? await ensureAgentWallet(walletKey(o.session), o.session.model);
      if (o.status === "blocked") {
        append(o.session.id, "system", "bank_declined", { provider: info.provider, simulated: info.simulated, accountLast4: wallet.accountLast4, amount: o.total, reason: o.reason ?? "guardrail block" });
        return { ...base, status: "declined", accountLast4: wallet.accountLast4 };
      }
      // one purchase per merchant
      const byMerchant = new Map<string, { amount: number; titles: string[] }>();
      for (const it of o.items) {
        const p = o.products.find((x) => x.id === it.productId);
        const mid = p?.merchantId ?? "m_unknown";
        const cur = byMerchant.get(mid) ?? { amount: 0, titles: [] };
        cur.amount += it.qty * it.unitPrice;
        cur.titles.push(`${it.qty > 1 ? `${it.qty}x ` : ""}${(p?.title ?? it.productId).slice(0, 48)}`);
        byMerchant.set(mid, cur);
      }
      const settled = await Promise.allSettled([...byMerchant].map(([mid, g2]) => {
        const m = o.merchants.find((x) => x.id === mid) ?? { id: mid, name: mid.replace(/^m_/, "") };
        return chargePurchase({ wallet, merchant: m, amount: g2.amount, description: `Bonded ${o.session.id} · ${g2.titles.join(", ")}`, sessionId: o.session.id });
      }));
      const ok = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      const bad = settled.flatMap((r) => (r.status === "rejected" ? [errMsg(r.reason)] : []));
      if (ok.length) {
        append(o.session.id, "system", "bank_charge", {
          provider: info.provider, simulated: info.simulated, purchaseIds: ok.map((x) => x.purchaseId), accountLast4: wallet.accountLast4,
          amount: money(ok.reduce((s, x) => s + x.amount, 0)), merchantIds: ok.map((x) => x.merchantId),
        });
      }
      if (bad.length) {
        append(o.session.id, "system", "bank_error", { stage: "charge", provider: info.provider, simulated: info.simulated, error: bad.join("; ") });
        return { ...base, status: ok.length ? "charged" : "error", accountLast4: wallet.accountLast4, purchaseIds: ok.map((x) => x.purchaseId), error: bad.join("; ") };
      }
      return { ...base, status: "charged", accountLast4: wallet.accountLast4, purchaseIds: ok.map((x) => x.purchaseId) };
    } catch (e) {
      const error = errMsg(e);
      console.warn("[nessie] checkout banking failed:", error);
      try { append(o.session.id, "system", "bank_error", { stage: o.status === "blocked" ? "decline" : "charge", provider: info.provider, simulated: info.simulated, error }); } catch { /* ignore */ }
      return { ...base, status: "error", error };
    } finally {
      if (o.status === "completed") funding.delete(o.session.id);
    }
  })();

  return withTimeout(work, o.waitMs ?? 20_000).catch(() => ({ ...base, status: "pending" as const }));
}
