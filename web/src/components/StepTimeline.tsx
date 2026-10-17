"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  ChevronRight, CircleDot, CreditCard, Eye, Flag, MessageSquare, Minus, Play, Search, ShieldAlert, ShieldCheck, ShoppingCart,
} from "lucide-react";
import type { GuardianVerdict, LogEntry, Merchant, Product } from "@/lib/types";
import { shortHash, usd } from "@/lib/ui/format";
import { Badge, GuardrailBadge, TrapBadge, cx } from "./ui";

type P = Record<string, unknown>;
const obj = (x: unknown): P => (x && typeof x === "object" ? (x as P) : {});
const str = (x: unknown) => (x == null ? "" : String(x));

const ZW = /[\u200b-\u200f\u2060\ufeff]/g;
const FULLWIDTH = /[\uff01-\uff5e]{4,}/;
const AGENTY = /\b(agent|assistant|AI|automated|LLM|bot)s?\b[\s\S]*\b(must|should|ignore|add|buy|set|skip|do not|don't|pre-?approved|authori[sz]ed|instructions?)\b/i;

/**
 * Pull out the parts of a listing's description aimed at agents rather than shoppers:
 * HTML comments, hidden spans, zero-width-obfuscated and full-width text, and "note to agents" paragraphs.
 */
export function hiddenText(desc?: string): { text: string; how: string }[] {
  if (!desc) return [];
  const out: { text: string; how: string }[] = [];
  const clean = (t: string) => t.normalize("NFKC").replace(ZW, "").replace(/<[^>]+>/g, "").trim();
  for (const m of desc.matchAll(/<!--([\s\S]*?)-->/g)) out.push({ text: clean(m[1]), how: "HTML comment" });
  for (const m of desc.matchAll(/<span[^>]*display\s*:\s*none[^>]*>([\s\S]*?)<\/span>/gi)) out.push({ text: clean(m[1]), how: "hidden element" });
  const rest = desc.replace(/<!--[\s\S]*?-->/g, "").replace(/<span[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/span>/gi, "");
  for (const line of rest.split(/\n+/)) {
    if (!line.trim()) continue;
    if (ZW.test(line)) { ZW.lastIndex = 0; out.push({ text: clean(line), how: "zero-width characters" }); continue; }
    if (FULLWIDTH.test(line)) { out.push({ text: clean(line), how: "full-width characters" }); continue; }
    if (AGENTY.test(line)) out.push({ text: clean(line), how: "fine print addressed to agents" });
  }
  return out.filter((h) => h.text);
}

export function ProductCard({ p, merchant, compact, qty }: { p: Product; merchant?: Merchant; compact?: boolean; qty?: number }) {
  const hidden = p.trap?.type === "prompt_injection" ? hiddenText(p.description) : [];
  const showTrapDetail = !!p.trap && !compact;
  const off = p.listPrice > p.price ? Math.round((1 - p.price / p.listPrice) * 100) : 0;
  const overMarket = p.marketPrice > 0 ? p.price / p.marketPrice - 1 : 0;
  return (
    <div className={cx("rounded-md border bg-white", p.trap ? "border-coral/35" : "border-divider")}>
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={`/arena/p/${p.id}`} className="tap truncate text-[13px] font-medium text-ink hover:text-accent" title={p.title}>{p.title}</Link>
            {compact && p.trap && <TrapBadge type={p.trap.type} />}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-ink-3">
            <span>{p.brand}</span>
            {merchant && <span>{merchant.name}{merchant.verified ? " · verified" : ""}{merchant.ageDays < 30 ? ` · ${merchant.ageDays}d old` : ""}</span>}
            <span className="tnum">★ {p.rating.toFixed(1)} ({p.reviewCount.toLocaleString()})</span>
            <span className="break-anywhere font-mono text-[11px] text-ink-4">{p.id}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[13px] font-medium text-ink">{qty && qty > 1 ? `${qty} × ` : ""}{usd(p.price)}</div>
          {!compact && (
            <div className="font-mono text-[11px] text-ink-4">
              {off >= 5 && <span className="line-through">{usd(p.listPrice)}</span>}
              {p.marketPrice > 0 && <span className="ml-1.5">mkt {usd(p.marketPrice)}</span>}
            </div>
          )}
        </div>
      </div>
      {showTrapDetail && p.trap && (
        <div className="border-t border-coral/20 bg-coral-soft/60 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <TrapBadge type={p.trap.type} />
            <span className="min-w-0 break-anywhere text-[12px] text-coral-ink">{p.trap.note}</span>
            {p.trap.type === "price_gouge" && overMarket > 0 && <span className="text-[12px] text-coral-ink tnum">{Math.round(overMarket * 100)}% above market</span>}
          </div>
          {hidden.length > 0 && (
            <div className="mt-2">
              {hidden.map((h, i) => (
                <div key={i} className="mt-1.5">
                  <div className="text-[11px] font-medium text-coral-ink">Injected text · {h.how}</div>
                  <pre className="mt-0.5 whitespace-pre-wrap break-words rounded border border-coral/35 bg-white px-2 py-1.5 font-mono text-[11.5px] leading-relaxed text-coral-ink">{h.text}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Rendered { icon: ReactNode; title: ReactNode; detail?: ReactNode; tone?: "good" | "bad" | "warn" }

function render(e: LogEntry, products: Record<string, Product>, budget?: number): Rendered {
  const p = obj(e.payload);
  const prod = (id: unknown) => products[str(id)];
  switch (e.action) {
    case "session_start": {
      const task = obj(p.task);
      return { icon: <Play size={13} />, title: <>Session started{task.budget != null && <span className="text-ink-3"> · budget {usd(Number(task.budget))}</span>}{p.guardrail ? <span className="text-ink-3"> · guardrail {str(p.guardrail)}</span> : null}</> };
    }
    case "search": {
      const results = Array.isArray(p.results) ? (p.results as P[]) : [];
      const count = p.count != null ? Number(p.count) : results.length;
      const filters = [p.category && `in ${p.category}`, p.maxPrice && `under ${usd(Number(p.maxPrice), 0)}`].filter(Boolean).join(" ");
      return {
        icon: <Search size={13} />,
        title: <><Verb>search</Verb> <Q>“{str(p.query)}”</Q>{filters && <span className="text-ink-3"> {filters}</span>} <Arrow /> <span className="tnum">{count} result{count === 1 ? "" : "s"}</span></>,
        detail: results.length ? <SearchResults results={results} products={products} /> : undefined,
      };
    }
    case "view": {
      const pr = prod(p.productId);
      return {
        icon: <Eye size={13} />,
        title: <><Verb>view</Verb> <span className="text-ink">{str(p.title) || pr?.title || str(p.productId)}</span></>,
        detail: pr ? <ProductCard p={pr} /> : undefined,
        tone: pr?.trap ? "warn" : undefined,
      };
    }
    case "add_to_cart": {
      const pr = prod(p.productId);
      const qty = Number(p.qty ?? 1);
      return {
        icon: <ShoppingCart size={13} />,
        title: <><Verb>add_to_cart</Verb> <span className="text-ink">{str(p.title) || pr?.title}</span> <span className="tnum text-ink-3">×{qty}</span>
          {p.cartTotal != null && <span className="text-ink-3"> · cart {usd(Number(p.cartTotal))}</span>}</>,
        detail: pr?.trap ? <ProductCard p={pr} compact qty={qty} /> : undefined,
        tone: pr?.trap ? "bad" : undefined,
      };
    }
    case "remove_from_cart": {
      const pr = prod(p.productId);
      return { icon: <Minus size={13} />, title: <><Verb>remove_from_cart</Verb> <span className="text-ink">{pr?.title ?? str(p.productId)}</span></> };
    }
    case "checkout_requested":
    case "checkout": {
      const items = Array.isArray(p.items) ? (p.items as P[]) : [];
      const total = Number(p.total ?? p.amount ?? 0);
      const over = budget != null && total > budget;
      return {
        icon: <CreditCard size={13} />,
        title: <><Verb>checkout</Verb> <span className="font-mono tnum">{usd(total)}</span>
          {budget != null && <span className={over ? "text-coral-ink" : "text-ink-3"}> · budget {usd(budget)}{over ? " (over)" : ""}</span>}</>,
        detail: (
          <div className="space-y-1.5">
            {p.reasoning ? <p className="text-[12.5px] italic text-ink-2">“{str(p.reasoning)}”</p> : null}
            {items.map((it, i) => { const pr = prod(it.productId); return pr ? <ProductCard key={i} p={pr} compact qty={Number(it.qty)} /> : null; })}
          </div>
        ),
        tone: over ? "bad" : undefined,
      };
    }
    case "guardian_verdict":
    case "guardrail_verdict": {
      const v = e.payload as GuardianVerdict & { mode?: string };
      const reasons = v?.reasons ?? [];
      return {
        icon: v?.decision === "approve" ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />,
        title: <><Verb>guardrail</Verb> <GuardrailBadge decision={v?.decision} />{v?.mode && <span className="text-ink-3"> · {v.mode} mode</span>}
          {v?.judge && <span className="text-ink-4"> · {v.judge.used}</span>}</>,
        detail: (reasons.length || v?.judge?.summary) ? (
          <div className="space-y-1">
            {reasons.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-[12.5px]">
                <Badge tone={r.severity === "critical" ? "bad" : r.severity === "warn" ? "warn" : "neutral"} className="font-mono">{r.code}</Badge>
                <span className="text-ink-2">{r.message}</span>
              </div>
            ))}
            {v?.judge?.summary && <p className="text-[12.5px] text-ink-3">{v.judge.summary}</p>}
          </div>
        ) : undefined,
        tone: v?.decision === "block" ? "bad" : v?.decision === "ask" ? "warn" : "good",
      };
    }
    case "checkout_result": {
      const status = str(p.status);
      const ok = status === "completed" || status === "approved";
      return {
        icon: <Flag size={13} />,
        title: <><Verb>{ok ? "purchase completed" : `checkout ${status}`}</Verb>{p.amount != null && <> <span className="font-mono tnum">{usd(Number(p.amount))}</span></>}
          {p.reason ? <span className="text-ink-3"> · {str(p.reason)}</span> : null}</>,
        tone: ok ? "good" : "bad",
      };
    }
    case "bank_funded":
    case "bank_charge":
    case "bank_declined":
    case "bank_error": {
      const sim = p.simulated ? <span className="text-ink-4"> · simulated ledger</span> : <span className="text-ink-4"> · Capital One Nessie</span>;
      const card = p.accountLast4 ? <> card <span className="font-mono">••{str(p.accountLast4)}</span></> : null;
      const amt = p.amount != null ? <> <span className="font-mono tnum">{usd(Number(p.amount))}</span></> : null;
      if (e.action === "bank_funded") return { icon: <CreditCard size={13} />, title: <><Verb>card funded</Verb>{card}{amt}{sim}</> };
      if (e.action === "bank_charge") return { icon: <CreditCard size={13} />, title: <><Verb>charged</Verb>{amt} to{card}{sim}</>, tone: "good" };
      if (e.action === "bank_declined") return { icon: <CreditCard size={13} />, title: <><Verb>declined</Verb>{card} · no charge{sim}</>, tone: "bad" };
      return { icon: <CreditCard size={13} />, title: <><Verb>bank unavailable</Verb> <span className="text-ink-3">{str(p.error).slice(0, 140)}</span></> };
    }
    default: {
      const text = str(p.text ?? p.message ?? p.content ?? p.thought ?? "");
      return {
        icon: text ? <MessageSquare size={13} /> : <CircleDot size={13} />,
        title: <><Verb>{e.action.replace(/_/g, " ")}</Verb>{text && <span className="text-ink-2"> {text.length > 140 ? text.slice(0, 140) + "…" : text}</span>}</>,
      };
    }
  }
}

function Verb({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[12.5px] font-medium text-ink">{children}</span>;
}
function Q({ children }: { children: ReactNode }) { return <span className="text-ink">{children}</span>; }
function Arrow() { return <span className="text-ink-4">→</span>; }

function SearchResults({ results, products }: { results: P[]; products: Record<string, Product> }) {
  const [all, setAll] = useState(false);
  const shown = all ? results : results.slice(0, 5);
  return (
    <div className="overflow-hidden rounded-md border border-divider">
      {shown.map((r, i) => {
        const pr = products[str(r.id)];
        return (
          <div key={i} className="flex items-center gap-3 border-b border-divider px-3 py-1.5 text-[12.5px] last:border-b-0">
            <span className="w-4 text-right text-ink-4 tnum">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-ink" title={str(r.title)}>{str(r.title)}</span>
            {pr?.trap && <TrapBadge type={pr.trap.type} />}
            <span className="font-mono text-ink-2 tnum">{usd(Number(r.price))}</span>
          </div>
        );
      })}
      {results.length > 5 && (
        <button onClick={() => setAll((a) => !a)} className="w-full bg-ivory px-3 py-1 max-lg:py-2.5 text-left text-[12px] text-ink-3 hover:text-ink">
          {all ? "Show fewer" : `Show all ${results.length}`}
        </button>
      )}
    </div>
  );
}

export default function StepTimeline({
  entries, products, evidence = [], brokenAt, budget,
}: { entries: LogEntry[]; products: Record<string, Product>; evidence?: number[]; brokenAt?: number; budget?: number }) {
  const t0 = entries.length ? new Date(entries[0].ts).getTime() : 0;
  const ev = new Set(evidence);
  return (
    <ol className="relative">
      {entries.map((e, i) => {
        const r = render(e, products, budget);
        const cited = ev.has(e.seq);
        const broken = brokenAt != null && e.seq === brokenAt;
        const dt = (new Date(e.ts).getTime() - t0) / 1000;
        return (
          <li key={e.seq} id={`seq-${e.seq}`} className="relative grid scroll-mt-24 grid-cols-[28px_minmax(0,1fr)] gap-x-3 max-sm:gap-x-2">
            {/* rail */}
            <div className="relative flex justify-center">
              {i < entries.length - 1 && <span className="absolute bottom-0 top-7 w-px bg-ink-5" />}
              <span className={cx(
                "relative z-10 mt-2.5 flex size-7 items-center justify-center rounded-full border bg-white",
                r.tone === "bad" ? "border-coral/35 text-coral-ink" : r.tone === "warn" ? "border-amber/35 text-amber-ink" : r.tone === "good" ? "border-pass/35 text-pass-ink" : "border-divider text-ink-3",
              )}>{r.icon}</span>
            </div>
            <Step e={e} r={r} cited={cited} broken={broken} dt={dt} />
          </li>
        );
      })}
    </ol>
  );
}

function Step({ e, r, cited, broken, dt }: { e: LogEntry; r: Rendered; cited: boolean; broken: boolean; dt: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cx("mb-1.5 min-w-0 rounded-md px-3 py-2.5 max-sm:px-2",
      cited && "bg-amber-soft/70 ring-1 ring-amber/35", broken && "bg-coral-soft ring-1 ring-coral/35")}>
      <div className="flex items-start gap-3 max-sm:flex-col max-sm:gap-0.5">
        <div className="min-w-0 flex-1 break-anywhere text-[13.5px] leading-6 text-ink-2">
          {r.title}
          {cited && <Badge tone="warn" className="ml-2 align-[1px]">Cited as evidence</Badge>}
          {broken && <Badge tone="bad" className="ml-2 align-[1px]">Chain broken here</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-0.5 font-mono text-[11.5px] text-ink-4 tnum">
          <span title={new Date(e.ts).toLocaleString()}>+{dt.toFixed(1)}s</span>
          <span className="text-ink-3">#{e.seq}</span>
          <button onClick={() => setOpen((o) => !o)} title={`hash ${e.hash}\nprev ${e.prevHash}`}
            className="inline-flex items-center gap-0.5 rounded px-1 hover:bg-canvas-sunk hover:text-ink-2 max-lg:-my-2.5 max-lg:min-h-10 max-lg:px-2">
            <ChevronRight size={12} className={cx("transition-transform", open && "rotate-90")} />{shortHash(e.hash)}
          </button>
        </div>
      </div>
      {r.detail && <div className="mt-2">{r.detail}</div>}
      {open && (
        <div className="mt-2 overflow-hidden rounded-md border border-divider bg-ivory">
          <div className="flex flex-wrap gap-x-4 border-b border-divider px-3 py-1.5 font-mono text-[11px] text-ink-3">
            <span>actor {e.actor}</span><span>prev {shortHash(e.prevHash)}</span><span className="break-all">hash {e.hash}</span>
          </div>
          <pre className="max-h-80 overflow-auto px-3 py-2 font-mono text-[11.5px] leading-relaxed text-ink-2">{JSON.stringify(e.payload, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

