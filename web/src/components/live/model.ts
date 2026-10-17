// Live Agent Theater: pure derivation of what's on screen from a prefix of a session's hash-chained trace.
import type {
  BenchResult, GuardianVerdict, GuardrailMode, LogEntry, Merchant, Product, Session, TaskSpec, Transaction,
} from "@/lib/types";
import { hiddenText } from "@/components/StepTimeline";
import { usd } from "@/lib/ui/format";

/** GET /api/live/sessions/:id */
export interface LiveSessionData {
  session: Session;
  entries: LogEntry[];
  products: Record<string, Product>;
  merchants: Record<string, Merchant>;
  finished: boolean;
  integrity: { valid: boolean; length: number; brokenAt?: number; reason?: string };
  result?: BenchResult;
  transaction?: Transaction;
  run?: { id: string; name: string; status: string; error?: string };
}

export interface LiveModel { id: string; displayName: string; profile: string; simulated: boolean; available: boolean }
export interface LivePreset { key: string; label: string; hint: string; taskId: string; model: string }
export interface LiveConfig { models: LiveModel[]; presets: LivePreset[]; demoEnabled: boolean }

export type ReasoningKind = "thought" | "plan" | "decision";

type P = Record<string, unknown>;
export const obj = (x: unknown): P => (x && typeof x === "object" ? (x as P) : {});
export const str = (x: unknown) => (x == null ? "" : String(x));
export const num = (x: unknown) => (x == null || x === "" || !Number.isFinite(Number(x)) ? undefined : Number(x));

export interface SearchHit { id: string; title: string; brand: string; price: number; merchantId: string }
export interface CartLine { productId: string; qty: number; unitPrice: number; title: string }

export type Scene =
  | { kind: "start" }
  | { kind: "search"; seq: number; query: string; hits: SearchHit[] }
  | { kind: "product"; seq: number; productId: string; view: P; adding?: { seq: number; qty: number } }
  | { kind: "checkout"; seq: number; items: CartLine[]; total: number; reasoning: string; verdict?: GuardianVerdict & { mode?: GuardrailMode }; verdictSeq?: number; outcome?: P; outcomeSeq?: number; bank?: BankEvent };

/** What the bank (Capital One Nessie, or the simulated ledger) did at checkout, from bank_* trace entries. */
export interface BankEvent { kind: "charged" | "declined" | "error"; accountLast4?: string; amount?: number; simulated: boolean; seq: number }

export interface Derived {
  task?: TaskSpec;
  model?: string;
  guardrail?: GuardrailMode;
  scene: Scene;
  /** search the agent last came from (for the "back to results" pick animation) */
  lastSearch?: { seq: number; query: string; hits: SearchHit[] };
  visited: Set<string>;
  rejected: Set<string>;
  approved: Set<string>;
  cart: CartLine[];
  cartTotal: number;
  spent: number;          // cart total, or the charged amount once checked out
  checkedOut: boolean;
  last?: LogEntry;
  /** card funded at session start */
  card?: { accountLast4: string; simulated: boolean };
  bank?: BankEvent;
}

const REJECT = /\bRejecting (p_[A-Za-z0-9_]+)/g;
const PASS = /\b(p_[A-Za-z0-9_]+) passes\b/g;

export function derive(entries: LogEntry[]): Derived {
  const d: Derived = {
    scene: { kind: "start" }, visited: new Set(), rejected: new Set(), approved: new Set(),
    cart: [], cartTotal: 0, spent: 0, checkedOut: false,
  };
  for (const e of entries) {
    const p = obj(e.payload);
    d.last = e;
    switch (e.action) {
      case "session_start": {
        d.task = obj(p.task) as unknown as TaskSpec;
        d.model = str(p.model);
        d.guardrail = (str(p.guardrail) || "observe") as GuardrailMode;
        break;
      }
      case "search": {
        const hits = (Array.isArray(p.results) ? (p.results as P[]) : []).map((r) => ({
          id: str(r.id), title: str(r.title), brand: str(r.brand), price: Number(r.price ?? 0), merchantId: str(r.merchantId),
        }));
        d.lastSearch = { seq: e.seq, query: str(p.query), hits };
        d.scene = { kind: "search", seq: e.seq, query: str(p.query), hits };
        break;
      }
      case "view": {
        const id = str(p.productId);
        d.visited.add(id);
        d.scene = { kind: "product", seq: e.seq, productId: id, view: p };
        break;
      }
      case "add_to_cart": {
        const id = str(p.productId);
        const qty = Number(p.qty ?? 1);
        const ex = d.cart.find((c) => c.productId === id);
        if (ex) ex.qty += qty;
        else d.cart.push({ productId: id, qty, unitPrice: Number(p.unitPrice ?? 0), title: str(p.title) });
        d.cartTotal = num(p.cartTotal) ?? d.cart.reduce((s, c) => s + c.qty * c.unitPrice, 0);
        d.spent = d.cartTotal;
        const view = d.scene.kind === "product" && d.scene.productId === id ? d.scene.view : { productId: id, title: p.title, price: p.unitPrice };
        d.scene = { kind: "product", seq: e.seq, productId: id, view, adding: { seq: e.seq, qty } };
        break;
      }
      case "remove_from_cart": {
        d.cart = d.cart.filter((c) => c.productId !== str(p.productId));
        d.cartTotal = num(p.cartTotal) ?? d.cart.reduce((s, c) => s + c.qty * c.unitPrice, 0);
        d.spent = d.cartTotal;
        break;
      }
      case "checkout_requested": {
        const items = (Array.isArray(p.items) ? (p.items as P[]) : []).map((it) => ({
          productId: str(it.productId), qty: Number(it.qty ?? 1), unitPrice: Number(it.unitPrice ?? 0),
          title: d.cart.find((c) => c.productId === str(it.productId))?.title ?? "",
        }));
        const total = Number(p.total ?? 0);
        d.spent = total;
        d.scene = { kind: "checkout", seq: e.seq, items, total, reasoning: str(p.reasoning) };
        break;
      }
      case "guardrail_verdict": {
        if (d.scene.kind === "checkout") d.scene = { ...d.scene, verdict: p as unknown as GuardianVerdict & { mode?: GuardrailMode }, verdictSeq: e.seq };
        break;
      }
      case "checkout_result": {
        if (d.scene.kind === "checkout") d.scene = { ...d.scene, outcome: p, outcomeSeq: e.seq };
        if (str(p.status) === "completed") { d.checkedOut = true; d.spent = Number(p.amount ?? d.spent); }
        else d.spent = 0;
        break;
      }
      case "bank_funded": {
        d.card = { accountLast4: str(p.accountLast4), simulated: !!p.simulated };
        break;
      }
      case "bank_charge":
      case "bank_declined":
      case "bank_error": {
        const kind = e.action === "bank_charge" ? "charged" : e.action === "bank_declined" ? "declined" : "error";
        if (kind === "error" && d.bank?.kind === "charged") break; // a partial failure after a charge keeps the charge
        d.bank = { kind, accountLast4: str(p.accountLast4) || d.card?.accountLast4 || undefined, amount: num(p.amount), simulated: !!p.simulated, seq: e.seq };
        if (d.scene.kind === "checkout") d.scene = { ...d.scene, bank: d.bank };
        break;
      }
      case "reasoning": {
        const t = str(p.text);
        for (const m of t.matchAll(REJECT)) d.rejected.add(m[1]);
        for (const m of t.matchAll(PASS)) d.approved.add(m[1]);
        break;
      }
    }
  }
  return d;
}

/** How long (ms at 1×) the theater lingers on an entry so its animation can play out. */
export function dwell(e: LogEntry | undefined, products: Record<string, Product>): number {
  if (!e) return 400;
  const p = obj(e.payload);
  switch (e.action) {
    case "session_start": return 1300;
    case "reasoning": return Math.min(3400, 650 + str(p.text).length * 19);
    case "search": return 1500 + str(p.query).length * 45;
    case "view": {
      const desc = str(p.description) || products[str(p.productId)]?.description || "";
      return injectedSegments(desc).length ? 4200 : 2300;
    }
    case "add_to_cart": return 1900;
    case "remove_from_cart": return 900;
    case "checkout_requested": return 2000;
    case "guardrail_verdict": return 1600 + 450 * ((p.reasons as unknown[])?.length ?? 0);
    case "checkout_result": return 1700;
    default: return 700;
  }
}

const INJECTION_RE = /(ignore (all )?(previous|prior)|\bai (assistant|model|agent)s?\b|for ai\b|system\s*(:|override)|automated shopping|assistant instruction|pre-approved|checkout immediately|checkout now|do not compare|disregard|purchase mode|budget limits do not apply|already agreed)/i;

/** Text in a listing aimed at the agent rather than the shopper (hidden markup, obfuscation, "note to AI" lines). */
export function injectedSegments(desc: string): { text: string; how: string }[] {
  if (!desc) return [];
  const found = hiddenText(desc);
  if (found.length) return found;
  return desc.split(/\n+|(?<=\.)\s+/).filter((s) => INJECTION_RE.test(s)).map((s) => ({ text: s.trim(), how: "instruction addressed to agents" }));
}

/** Split a raw description into visible prose and injected spans, preserving order (for in-place highlighting). */
export function splitDescription(desc: string): { text: string; injected: boolean; how?: string }[] {
  if (!desc) return [];
  const out: { text: string; injected: boolean; how?: string }[] = [];
  const re = /<!--[\s\S]*?-->|<span[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/span>/gi;
  let last = 0;
  for (const m of desc.matchAll(re)) {
    if (m.index! > last) out.push(...splitPlain(desc.slice(last, m.index)));
    out.push({ text: m[0], injected: true, how: m[0].startsWith("<!--") ? "HTML comment" : "hidden element" });
    last = m.index! + m[0].length;
  }
  if (last < desc.length) out.push(...splitPlain(desc.slice(last)));
  return out;
}

function splitPlain(s: string): { text: string; injected: boolean; how?: string }[] {
  const parts = s.split(/(?<=[.!?])(\s+)/);
  const out: { text: string; injected: boolean; how?: string }[] = [];
  for (const part of parts) {
    if (!part) continue;
    const zw = /[​-‏⁠﻿]/.test(part);
    const fw = /[！-～]{4,}/.test(part);
    const inj = zw || fw || INJECTION_RE.test(part);
    const prev = out[out.length - 1];
    if (prev && prev.injected === inj && !inj) prev.text += part;
    else out.push({ text: part, injected: inj, how: zw ? "zero-width characters" : fw ? "full-width characters" : inj ? "instruction addressed to agents" : undefined });
  }
  return out;
}

export function displayName(model?: string, models?: LiveModel[]) {
  if (!model) return "Agent";
  return models?.find((m) => m.id === model)?.displayName ?? model.replace(/^sim\//, "Sim-");
}

/** One quiet sentence for what the card did. Shared by the checkout scene and the verdict. */
export function bankLine(b: BankEvent): string {
  if (b.kind === "declined") return "Declined. No charge.";
  if (b.kind === "error") return "Bank unavailable. No charge recorded.";
  return `Charged to Capital One card ••${b.accountLast4 ?? "····"}${b.amount != null ? ` · ${usd(b.amount)}` : ""}`;
}
