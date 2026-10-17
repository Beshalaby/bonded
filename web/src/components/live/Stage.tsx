"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, CreditCard, Lock, ScanLine, Search, ShieldAlert, ShieldCheck, ShoppingCart, Store, X } from "lucide-react";
import type { GuardianVerdict, Merchant, Product } from "@/lib/types";
import { ProductArt, SellerBadge, Stars } from "@/app/arena/ui";
import { Badge, GuardrailBadge, TrapBadge, cx } from "@/components/ui";
import { usd } from "@/lib/ui/format";
import { useAfter } from "./hooks";
import { injectedSegments, obj, splitDescription, str, type Derived, type Scene, type SearchHit } from "./model";

interface StageProps {
  d: Derived;
  products: Record<string, Product>;
  merchants: Record<string, Merchant>;
  speed: number;
  agentName: string;
  /** shown when there is no scene yet (idle / starting) */
  intro: ReactNode;
  /** overlay (grade reveal) */
  overlay?: ReactNode;
  showTraps: boolean;
}

type Pt = { x: number; y: number };

export default function Stage({ d, products, merchants, speed, agentName, intro, overlay, showTraps }: StageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cartRef = useRef<HTMLDivElement>(null);
  const scene = d.scene;
  const sceneKey = scene.kind === "start" ? "start" : `${scene.kind}-${scene.kind === "product" ? scene.productId + (scene.adding ? "" : `-${scene.seq}`) : scene.seq}`;

  // ---- "back to results" pick: before opening a listing, show the grid with the cursor on its card
  const viewSeq = scene.kind === "product" && !scene.adding ? scene.seq : -1;
  const [picking, setPicking] = useState<number>(-1);
  const lastViewSeq = useRef(-1);
  useEffect(() => {
    if (viewSeq < 0 || viewSeq === lastViewSeq.current) return;
    lastViewSeq.current = viewSeq;
    if (!d.lastSearch) return;
    setPicking(viewSeq);
    const t = setTimeout(() => setPicking(-1), 760 / speed);
    return () => clearTimeout(t);
  }, [viewSeq, d.lastSearch, speed]);
  const isPicking = picking >= 0 && picking === viewSeq && !!d.lastSearch;

  // ---- fly-to-cart
  const addSeq = scene.kind === "product" && scene.adding ? scene.adding.seq : -1;
  const [fly, setFly] = useState<{ key: number; from: Pt; to: Pt; go: boolean; label: string } | null>(null);
  const [landed, setLanded] = useState(-1);
  const [ripple, setRipple] = useState<{ key: number; at: Pt } | null>(null);
  useEffect(() => {
    if (addSeq < 0) return;
    const t1 = setTimeout(() => {
      const stage = stageRef.current, btn = stage?.querySelector("[data-add-button]"), cart = cartRef.current;
      if (!stage || !btn || !cart) { setLanded(addSeq); return; }
      const s = stage.getBoundingClientRect(), b = btn.getBoundingClientRect(), c = cart.getBoundingClientRect();
      const from = { x: b.left - s.left + b.width / 2, y: b.top - s.top + b.height / 2 };
      setRipple({ key: addSeq, at: from });
      const qty = scene.kind === "product" && scene.adding ? scene.adding.qty : 1;
      setFly({ key: addSeq, from, to: { x: c.left - s.left + 14, y: c.top - s.top + c.height / 2 }, go: false, label: `+${qty}` });
      requestAnimationFrame(() => requestAnimationFrame(() => setFly((f) => (f && f.key === addSeq ? { ...f, go: true } : f))));
    }, 560 / speed);
    const t2 = setTimeout(() => { setFly(null); setLanded(addSeq); }, (560 + 720) / speed);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addSeq, speed]);
  const lagging = addSeq >= 0 && landed !== addSeq && scene.kind === "product" && !!scene.adding;
  const lagQty = lagging && scene.kind === "product" && scene.adding ? scene.adding.qty : 0;
  const lagLine = lagging && scene.kind === "product" ? d.cart.find((c) => c.productId === scene.productId) : undefined;
  const cartCount = d.cart.reduce((s, c) => s + c.qty, 0) - lagQty;
  const cartTotal = d.cartTotal - (lagLine ? lagQty * lagLine.unitPrice : 0);

  // ---- agent cursor follows whatever element the scene marks with data-cursor="1"
  const [cursor, setCursor] = useState<Pt | null>(null);
  const place = () => {
    const stage = stageRef.current;
    const el = stage?.querySelector<HTMLElement>('[data-cursor="1"]');
    if (!stage || !el) return;
    const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
    const x = Math.round(r.left - s.left + Math.min(r.width * 0.42, 64));
    const y = Math.round(r.top - s.top + Math.min(r.height * 0.55, 22));
    setCursor((c) => (c && Math.abs(c.x - x) < 1 && Math.abs(c.y - y) < 1 ? c : { x, y }));
  };
  const target = `${sceneKey}|${isPicking}|${addSeq}|${scene.kind === "checkout" ? `${scene.verdictSeq}-${scene.outcomeSeq}` : ""}`;
  const [phaseTick, setPhaseTick] = useState(0);
  useLayoutEffect(() => {
    const el = stageRef.current?.querySelector<HTMLElement>('[data-cursor="1"]');
    const sc = scrollRef.current;
    if (el && sc) {
      const er = el.getBoundingClientRect(), sr = sc.getBoundingClientRect();
      if (er.top < sr.top + 8 || er.bottom > sr.bottom - 8) sc.scrollTo({ top: sc.scrollTop + er.top - sr.top - sr.height / 3, behavior: "smooth" });
    }
    place();
  });
  useEffect(() => {
    // scenes move their own cursor target over time (typing → results, scan → callout); re-measure a few times
    const ts = [120, 400, 900, 1600, 2600].map((ms) => setTimeout(() => setPhaseTick((n) => n + 1), ms / speed));
    return () => ts.forEach(clearTimeout);
  }, [target, speed]);
  void phaseTick;
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const on = () => place();
    sc.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { sc.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, []);

  useEffect(() => {
    if (!isPicking || !cursor) return;
    const t = setTimeout(() => setRipple({ key: picking + 0.5, at: cursor }), 420 / speed);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPicking, picking]);

  const url = scene.kind === "search" || isPicking ? `arena.spendbench.dev/search?q=${encodeURIComponent((d.lastSearch?.query ?? "").toLowerCase()).replace(/%20/g, "+")}`
    : scene.kind === "product" ? `arena.spendbench.dev/p/${scene.productId}`
    : scene.kind === "checkout" ? "arena.spendbench.dev/checkout" : "arena.spendbench.dev";

  return (
    <div ref={stageRef} className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] bg-surface shadow-tile max-lg:h-[min(600px,78svh)]">
      {/* store chrome */}
      <div className="flex h-14 shrink-0 items-center gap-3 px-4 sm:px-5">
        <div className="flex items-center gap-1.5 text-[13px] font-medium tracking-[-0.01em] text-ink-2 max-sm:hidden">
          <Store size={14} strokeWidth={1.75} className="text-ink-4" /> Arena
        </div>
        <div className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-canvas-sunk/70 px-3.5 font-mono text-[11.5px] text-ink-3">
          <Lock size={11} className="shrink-0 text-ink-4" />
          <span key={url} className="lv-fade-in truncate">{url}</span>
        </div>
        <div ref={cartRef} key={`cart-${landed}`}
          className={cx("flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] tnum transition-colors duration-300",
            landed >= 0 && "lv-bump",
            cartCount > 0 ? (d.task && cartTotal > d.task.budget ? "bg-coral-soft text-coral-ink" : "bg-gold-soft text-accent") : "bg-canvas-sunk/70 text-ink-3")}>
          <ShoppingCart size={13} />
          <span className="font-medium">{Math.max(0, cartCount)}</span>
          {cartCount > 0 && <span className="font-mono text-[11.5px]">{usd(cartTotal)}</span>}
        </div>
      </div>

      {/* scene */}
      <div ref={scrollRef} className="lv-scroll relative min-h-0 flex-1 overflow-y-auto">
        {scene.kind === "start" ? intro
          : isPicking && d.lastSearch ? (
            <SearchScene key={`pick-${picking}`} query={d.lastSearch.query} hits={d.lastSearch.hits} products={products} merchants={merchants}
              d={d} speed={speed} fresh={false} focusId={scene.kind === "product" ? scene.productId : undefined} showTraps={showTraps} />
          ) : scene.kind === "search" ? (
            <SearchScene key={sceneKey} query={scene.query} hits={scene.hits} products={products} merchants={merchants} d={d} speed={speed} fresh showTraps={showTraps} />
          ) : scene.kind === "product" ? (
            <ProductScene key={sceneKey} scene={scene} product={products[scene.productId]} merchants={merchants} speed={speed} budget={d.task?.budget} showTraps={showTraps} />
          ) : (
            <CheckoutScene key={sceneKey} scene={scene} products={products} merchants={merchants} budget={d.task?.budget ?? 0} speed={speed} />
          )}
      </div>

      {/* agent cursor */}
      {cursor && scene.kind !== "start" && (
        <div className="lv-cursor pointer-events-none absolute left-0 top-0 z-20" style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}>
          <svg width="18" height="18" viewBox="0 0 18 18" className="-translate-x-[3px] -translate-y-[2px] drop-shadow-[0_1px_1px_oklch(20%_0.012_70/0.15)]">
            <path d="M3 2.2 L15 8.6 L9.4 10 L7.3 15.6 Z" fill="var(--color-accent)" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          <div className="ml-3 -mt-0.5 whitespace-nowrap rounded-[5px] bg-accent px-1.5 py-[2px] text-[10.5px] font-medium leading-none text-white shadow-sm">{agentName}</div>
        </div>
      )}
      {ripple && <span key={ripple.key} className="lv-ripple z-20" style={{ left: ripple.at.x, top: ripple.at.y }} />}
      {fly && (
        <div className={cx("lv-fly pointer-events-none absolute left-0 top-0 z-30 flex h-7 items-center gap-1 rounded-full bg-accent px-2.5 text-[12px] font-medium text-white shadow-md", fly.go && "opacity-40")}
          style={{ transform: fly.go ? `translate(${fly.to.x - 18}px, ${fly.to.y - 14}px) scale(0.55)` : `translate(${fly.from.x - 18}px, ${fly.from.y - 14}px)` }}>
          <ShoppingCart size={12} /> {fly.label}
        </div>
      )}
      {overlay}
    </div>
  );
}

/* ------------------------------------------------------------------ search */

function SearchScene({ query, hits, products, merchants, d, speed, fresh, focusId, showTraps }: {
  query: string; hits: SearchHit[]; products: Record<string, Product>; merchants: Record<string, Merchant>; d: Derived;
  speed: number; fresh: boolean; focusId?: string; showTraps: boolean;
}) {
  const perChar = 42 / speed;
  const [typed, setTyped] = useState(fresh ? 0 : query.length);
  useEffect(() => {
    if (!fresh) return;
    const id = setInterval(() => setTyped((n) => { if (n >= query.length) { clearInterval(id); return n; } return n + 1; }), perChar);
    return () => clearInterval(id);
  }, [fresh, query, perChar]);
  const doneTyping = typed >= query.length;
  const showResults = useAfter(fresh ? (query.length * perChar + 220) : 0, query);
  const results = doneTyping && showResults;

  return (
    <div className="px-5 pb-5 pt-1 max-sm:px-3">
      <div data-cursor={!results ? "1" : undefined}
        className={cx("flex h-10 items-center gap-2 rounded-full px-4 transition-[background-color,box-shadow] duration-300", !results ? "bg-surface shadow-[0_0_0_1.5px_var(--color-gold),0_6px_20px_-8px_oklch(78%_0.125_84/0.6)]" : "bg-canvas-sunk/70")}>
        <Search size={14} className="text-ink-4" />
        <span className="text-[13.5px] text-ink">{query.slice(0, typed)}</span>
        {!results && <span className="lv-caret -ml-1.5 h-4 w-px bg-ink" />}
        {results && <span className="lv-fade-in ml-auto text-[12px] text-ink-3 tnum">{hits.length} result{hits.length === 1 ? "" : "s"}</span>}
      </div>
      {results && (
        <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-3">
          {hits.map((h, i) => (
            <ResultCard key={h.id} h={h} p={products[h.id]} m={merchants[h.merchantId] ?? (products[h.id] && merchants[products[h.id].merchantId])}
              i={fresh ? i : 0} focus={focusId === h.id} visited={d.visited.has(h.id) && focusId !== h.id}
              mark={d.rejected.has(h.id) ? "rejected" : d.approved.has(h.id) ? "approved" : undefined} showTraps={showTraps} />
          ))}
          {!hits.length && <div className="col-span-full py-10 text-center text-[13px] text-ink-3">No listings matched “{query}”.</div>}
        </div>
      )}
    </div>
  );
}

function ResultCard({ h, p, m, i, focus, visited, mark, showTraps }: {
  h: SearchHit; p?: Product; m?: Merchant; i: number; focus: boolean; visited: boolean; mark?: "rejected" | "approved"; showTraps: boolean;
}) {
  const off = p && p.listPrice > p.price ? Math.round((1 - p.price / p.listPrice) * 100) : 0;
  return (
    <div data-cursor={focus ? "1" : undefined} style={{ animationDelay: `${i * 35}ms` }}
      className={cx("lv-fade-up relative flex gap-2.5 rounded-[16px] p-2 transition-[box-shadow,background-color,opacity] duration-300",
        focus ? "bg-surface shadow-[0_0_0_1.5px_var(--color-gold),0_8px_24px_-10px_oklch(78%_0.125_84/0.7)]" : "bg-ivory/70",
        visited && !focus && "opacity-60")}>
      <ProductArt p={{ id: h.id, brand: h.brand, title: h.title, model: p?.model, category: p?.category ?? "" }} className="size-14 shrink-0 rounded [&_svg]:size-5 [&>div]:mt-1 [&>div]:text-[10px] [&>div:last-child]:hidden" />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[12px] font-medium leading-snug text-ink" title={h.title}>{h.title}</div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="font-mono text-[12px] font-medium text-ink tnum">{usd(h.price)}</span>
          {off >= 5 && p && <span className="font-mono text-[10.5px] text-ink-4 line-through">{usd(p.listPrice)}</span>}
          {off >= 30 && <span className="text-[10.5px] font-medium text-coral-ink">-{off}%</span>}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 [&_span]:text-[11px]"><SellerBadge m={m} /></div>
      </div>
      <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
        {showTraps && p?.trap && <TrapBadge type={p.trap.type} prefix={false} />}
        {mark === "rejected" && <span className="lv-block-in flex size-4 items-center justify-center rounded-full bg-coral-soft text-coral-ink" title="Rejected by the agent"><X size={10} strokeWidth={3} /></span>}
        {mark === "approved" && <span className="lv-block-in flex size-4 items-center justify-center rounded-full bg-pass-soft text-pass-ink" title="Passed the agent's checks"><Check size={10} strokeWidth={3} /></span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ product */

function ProductScene({ scene, product, merchants, speed, budget, showTraps }: {
  scene: Extract<Scene, { kind: "product" }>; product?: Product; merchants: Record<string, Merchant>; speed: number; budget?: number; showTraps: boolean;
}) {
  const v = scene.view;
  const p = product;
  const title = p?.title ?? str(v.title);
  const brand = p?.brand ?? str(v.brand);
  const price = p?.price ?? Number(v.price ?? 0);
  const listPrice = p?.listPrice ?? Number(v.listPrice ?? price);
  const desc = str(v.description) || p?.description || "";
  const m = merchants[p?.merchantId ?? str(v.merchantId)];
  const off = listPrice > price ? Math.round((1 - price / listPrice) * 100) : 0;
  const segs = splitDescription(desc);
  const injected = injectedSegments(desc);
  const adding = !!scene.adding;
  const scanMs = 1700 / speed;
  const scanned = useAfter(adding ? 0 : scanMs, scene.seq);
  const flagged = scanned && injected.length > 0;
  const qty = scene.adding?.qty ?? 1;
  const over = budget != null && price * qty > budget;

  return (
    <div className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_200px] gap-5 p-5 max-xl:grid-cols-[minmax(0,140px)_minmax(0,1fr)_180px] max-xl:gap-4 max-sm:grid-cols-[88px_minmax(0,1fr)] max-sm:gap-3 max-sm:p-3">
      <div className="lv-fade-in">
        <ProductArt p={{ id: scene.productId, brand, title, model: p?.model, category: p?.category ?? "" }} className="aspect-square w-full rounded-[12px] border border-divider" />
        {showTraps && p?.trap && <div className="mt-2"><TrapBadge type={p.trap.type} /></div>}
      </div>

      <div className="lv-fade-up min-w-0">
        <div className="text-[12px] text-ink-3">{brand}</div>
        <h2 className="mt-0.5 text-[16px] font-semibold leading-snug tracking-[-0.01em] text-ink">{title}</h2>
        {p && <div className="mt-1"><Stars rating={p.rating} count={p.reviewCount} /></div>}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-[20px] font-semibold tracking-[-0.02em] text-ink tnum">{usd(price)}</span>
          {off >= 5 && <span className="text-[12.5px] text-ink-4 line-through tnum">{usd(listPrice)}</span>}
          {off >= 5 && <Badge tone={off >= 50 ? "bad" : "neutral"}>-{off}%</Badge>}
        </div>
        {p?.specs && Object.keys(p.specs).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {Object.entries(p.specs).slice(0, 4).map(([k, val]) => (
              <span key={k} className="rounded border border-divider px-1.5 py-0.5 text-[11px] text-ink-2"><span className="text-ink-4">{k}</span> {val}</span>
            ))}
          </div>
        )}

        {/* description, as the agent reads it */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-3">
            <ScanLine size={12} className={cx(!scanned && "text-accent")} />
            {scanned ? "Description (raw text the agent reads)" : "Agent reading description…"}
          </div>
        </div>
        <div data-cursor={!adding && !flagged ? "1" : undefined}
          className={cx("relative mt-1.5 overflow-hidden rounded-[14px] px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-2 transition-[background-color,box-shadow] duration-500",
            flagged ? "bg-coral-soft/50 shadow-[inset_0_0_0_1px_oklch(68%_0.15_35/0.25)]" : !scanned ? "bg-gold-soft/60" : "bg-canvas-sunk/50")}
          style={{ ["--lv-scan-ms" as string]: `${scanMs}ms` }}>
          {segs.map((s, i) => s.injected ? (
            <span key={i} className={cx("rounded-[3px] font-mono text-[11.5px] transition-[background-color,color,box-shadow] duration-300",
              flagged ? "bg-coral-soft text-coral-ink ring-1 ring-coral/35" : "text-ink-3")}>{s.text}</span>
          ) : <span key={i} className="whitespace-pre-wrap">{s.text}</span>)}
          {!adding && !scanned && <ScanBeam />}
        </div>
        {flagged && (
          <div data-cursor={!adding ? "1" : undefined} className="lv-pop relative isolate mt-3 px-1 py-3">
            <div aria-hidden className="burst burst-coral lv-bloom" style={{ ["--bs" as string]: "150%", ["--bo" as string]: 0.9 }} />
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-coral-ink">
              <ShieldAlert size={14} /> Hidden instruction detected in listing
            </div>
            {injected.slice(0, 2).map((h, i) => (
              <div key={i} className="mt-1.5">
                <div className="text-[11px] text-coral-ink">{h.how}</div>
                <div className="mt-0.5 font-mono text-[11.5px] leading-relaxed text-coral-ink">“{h.text.length > 180 ? h.text.slice(0, 179) + "…" : h.text}”</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* buy box */}
      <div className="lv-fade-up min-w-0 self-start rounded-[18px] bg-ivory p-3.5 max-sm:col-span-2" style={{ animationDelay: "60ms" }}>
        <div className="text-[18px] font-semibold tracking-[-0.02em] text-ink tnum">{usd(price)}</div>
        <div className="mt-2 space-y-1 text-[11.5px] text-ink-2">
          <div className="text-ink-3">Sold by</div>
          <SellerBadge m={m} />
          {m && <div className="text-ink-3 tnum">{m.ageDays < 365 ? `${m.ageDays} days on Arena` : `${Math.floor(m.ageDays / 365)} yrs on Arena`} · ★ {m.rating.toFixed(1)}</div>}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-[12px] border border-divider px-2 py-1 text-[12px]">
          <span className="text-ink-3">Qty</span>
          <span key={qty} className={cx("font-mono font-medium tnum", adding && qty > 1 ? "lv-bump text-coral-ink" : "text-ink")}>{qty}</span>
        </div>
        {adding && budget != null && (
          <div className={cx("lv-fade-in mt-1.5 text-right font-mono text-[11px] tnum", over ? "text-coral-ink" : "text-ink-3")}>
            {qty} × {usd(price)} = {usd(qty * price)}
          </div>
        )}
        <button data-add-button data-cursor={adding ? "1" : undefined} tabIndex={-1}
          className={cx("mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-[12px] text-[12.5px] font-medium transition-all duration-150",
            adding ? "bg-accent-hover text-white ring-4 ring-accent/15" : "bg-accent text-white")}>
          <ShoppingCart size={13} /> Add to cart
        </button>
        <div className="mt-1.5 flex h-8 w-full items-center justify-center rounded-[12px] border border-divider text-[12.5px] text-ink-2">Buy now</div>
      </div>
    </div>
  );
}

function ScanBeam() {
  const ref = useRef<HTMLSpanElement>(null);
  const [h, setH] = useState(200);
  useLayoutEffect(() => { const el = ref.current?.parentElement; if (el) setH(el.clientHeight + 28); }, []);
  return <span ref={ref} className="lv-scan-beam" style={{ ["--lv-scan-h" as string]: `${h}px` }} />;
}

/* ------------------------------------------------------------------ checkout */

function CheckoutScene({ scene, products, merchants, budget, speed }: {
  scene: Extract<Scene, { kind: "checkout" }>; products: Record<string, Product>; merchants: Record<string, Merchant>; budget: number; speed: number;
}) {
  const over = scene.total > budget;
  const max = Math.max(scene.total, budget) * 1.08 || 1;
  const v = scene.verdict;
  const outcome = scene.outcome ? obj(scene.outcome) : undefined;
  const status = str(outcome?.status);
  const step = outcome ? 3 : v ? 2 : 1;

  return (
    <div className="p-5 max-sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.01em] text-ink"><CreditCard size={15} className="text-ink-4" /> Checkout</h2>
        <div className="flex items-center gap-1 text-[11.5px]">
          {["Order", "Guardrail", "Result"].map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              {i > 0 && <span className={cx("h-px w-5 transition-colors duration-300", step > i ? "bg-accent" : "bg-ink-5")} />}
              <span className={cx("rounded-full px-2 py-0.5 transition-colors duration-300", step > i ? "bg-accent-soft font-medium text-accent" : "bg-canvas-sunk text-ink-3")}>{s}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4 max-sm:grid-cols-1">
        {/* order */}
        <div className="lv-fade-up min-w-0">
          <div className="overflow-hidden rounded-[12px] border border-divider">
            {scene.items.map((it) => {
              const p = products[it.productId];
              return (
                <div key={it.productId} className="flex items-center gap-2.5 border-b border-divider px-3 py-2 last:border-b-0">
                  <ProductArt p={{ id: it.productId, brand: p?.brand ?? "", title: p?.title ?? it.title, model: p?.model, category: p?.category ?? "" }} className="size-10 shrink-0 rounded [&_svg]:size-4 [&>div]:hidden" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium text-ink">{p?.title ?? it.title ?? it.productId}</div>
                    <div className="text-[11px] text-ink-3"><SellerBadge m={p ? merchants[p.merchantId] : undefined} /></div>
                  </div>
                  <div className="shrink-0 text-right font-mono text-[12px] tnum">
                    <div className={cx(it.qty > 1 ? "text-ink" : "text-ink-3")}>{it.qty} × {usd(it.unitPrice)}</div>
                    <div className="font-medium text-ink">{usd(it.qty * it.unitPrice)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* total vs budget */}
          <div className="mt-3 rounded-[12px] border border-divider px-3 py-2.5" data-cursor={!v ? "1" : undefined}>
            <div className="flex items-baseline justify-between text-[12.5px]">
              <span className="text-ink-3">Order total</span>
              <span className={cx("font-mono text-[15px] font-semibold tnum", over ? "text-coral-ink" : "text-ink")}>{usd(scene.total)}</span>
            </div>
            <div className="relative mt-2 h-2 rounded-full bg-canvas-sunk">
              <div className={cx("lv-grow-x absolute inset-y-0 left-0 rounded-full", over ? "bg-coral" : "bg-accent")}
                style={{ width: `${(scene.total / max) * 100}%`, animationDuration: `${700 / speed}ms` }} />
              <div className="absolute -top-1 bottom-[-4px] w-px bg-ink" style={{ left: `${(budget / max) * 100}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-ink-3 tnum">
              <span>Budget {usd(budget)}</span>
              <span className={over ? "font-medium text-coral-ink" : "text-pass-ink"}>{over ? `${usd(scene.total - budget)} over` : `${usd(budget - scene.total)} under`}</span>
            </div>
          </div>
          {scene.reasoning && (
            <p className="lv-fade-in mt-3 border-l-2 border-divider pl-2.5 text-[12px] italic leading-relaxed text-ink-2">“{scene.reasoning}”</p>
          )}
        </div>

        {/* guardrail */}
        <div className="min-w-0">
          {!v ? (
            <div className="lv-fade-in flex h-full min-h-[140px] flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-ink-5 text-[12.5px] text-ink-3">
              <ShieldCheck size={18} className="pulse-dot text-accent" />
              Pre-checkout guardrail reviewing the cart…
            </div>
          ) : <VerdictPanel v={v} speed={speed} />}
        </div>
      </div>

      {outcome && (
        <div data-cursor="1" className={cx("lv-stamp mt-4 flex items-center gap-3 rounded-[12px] border px-4 py-3",
          status === "completed" ? (v && v.decision !== "approve" ? "border-amber/35 bg-amber-soft/60" : "border-pass/35 bg-pass-soft/60") : "border-coral/35 bg-coral-soft/60")}>
          {status === "completed" ? <Check size={16} className={v && v.decision !== "approve" ? "text-amber-ink" : "text-pass-ink"} /> : <X size={16} className="text-coral-ink" />}
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-ink">
              {status === "completed" ? `Order placed · ${usd(Number(outcome.amount ?? scene.total))}` : "Purchase blocked by the guardrail"}
            </div>
            <div className="text-[12px] text-ink-2">{str(outcome.reason)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function VerdictPanel({ v, speed, compact }: { v: GuardianVerdict & { mode?: string }; speed: number; compact?: boolean }) {
  const tone = v.decision === "block" ? "border-coral/35" : v.decision === "ask" ? "border-amber/35" : "border-pass/35";
  return (
    <div data-cursor={compact ? undefined : "1"} className={cx("lv-pop rounded-[12px] border bg-white", tone)}>
      <div className="flex items-center justify-between gap-2 border-b border-divider px-3 py-2">
        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
          {v.decision === "approve" ? <ShieldCheck size={14} className="text-pass-ink" /> : <ShieldAlert size={14} className={v.decision === "block" ? "text-coral-ink" : "text-amber-ink"} />}
          Guardrail verdict
        </div>
        <div className="flex items-center gap-1.5">
          <span className="lv-stamp inline-flex" style={{ animationDelay: `${150 / speed}ms` }}><GuardrailBadge decision={v.decision} /></span>
          {v.mode && <span className="text-[11px] text-ink-3">{v.mode}</span>}
        </div>
      </div>
      <div className="space-y-1.5 px-3 py-2.5">
        {v.reasons.length === 0 && <div className="text-[12px] text-ink-3">No issues found.</div>}
        {v.reasons.map((r, i) => (
          <div key={i} className="lv-slide-left flex items-start gap-2 text-[12px]" style={{ animationDelay: `${(300 + i * 380) / speed}ms` }}>
            <Badge tone={r.severity === "critical" ? "bad" : r.severity === "warn" ? "warn" : "neutral"} className="font-mono text-[10.5px]">{r.code}</Badge>
            <span className="leading-snug text-ink-2">{r.message}</span>
          </div>
        ))}
        {v.judge?.summary && !compact && <p className="pt-1 text-[11.5px] leading-snug text-ink-3">{v.judge.summary}</p>}
      </div>
    </div>
  );
}
