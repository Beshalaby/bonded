"use client";
// /penny: Penny, Bonded's shopping agent. Tell her what to buy; she shops around, checks every listing for scams,
// has a council of expert models vote, and decides: buy, ask you, or walk away. Backed by POST /api/procure
// (the same planner agents call as plan_purchase). She never places an order.
// Page: hero with the ask box → capabilities → how it works → ways to use her → FAQ.
// Submitting opens the conversation at /penny/shop/:id.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  AnimatePresence, motion, useInView, useReducedMotion, useScroll, useTransform,
} from "motion/react";
import {
  ArrowRight, ArrowUpRight, FileCheck2, Plus, Scale, ShieldAlert, ShoppingBag, Sparkles, Users, type LucideProps,
} from "lucide-react";
import { cx, EASE } from "@/design";
import { PennyAvatar } from "./Answer";
import { createRequest, readDraft, type PennyDraft } from "./session";
import SetupTabs from "@/components/connect/SetupTabs";
import { CopyField } from "@/components/connect/Code";
import { usePublicOrigin } from "@/lib/ui/usePublicOrigin";

const EXAMPLES = ["AirPods Pro 2 under $250", "Sony WH-1000XM5 headphones in black", "Running shoes", "A MacBook Air M3 under $900"];

/* ------------------------------------------------------------------ hero + ask */

function Hero({ onAsk, busy }: { onAsk: (draft: PennyDraft) => void; busy: boolean }) {
  const [q, setQ] = useState("");
  const [budget, setBudget] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const draft = readDraft();
    if (draft) { setQ(draft.request); setBudget(draft.budget); }
  }, []);
  const submit = (text = q) => {
    const t = text.trim();
    if (!t || busy) { input.current?.focus(); return; }
    onAsk({ request: t, budget, where: "web" });
  };
  const rise = (d: number) => ({ initial: { opacity: 0, y: 16, filter: "blur(6px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" }, transition: { duration: 0.9, delay: d, ease: EASE } });

  return (
    <section aria-labelledby="penny-title" className="px-2 pt-[60px] sm:px-3 sm:pt-[64px]">
      <div className="relative isolate overflow-hidden rounded-[28px] sm:rounded-[40px]">
        <div aria-hidden className="mesh mesh-penny -z-10" />
        <div className="flex min-h-[min(860px,calc(100svh-76px))] flex-col items-center justify-center px-5 py-20 text-center sm:py-24">
          <motion.div className="inline-flex items-center gap-2.5" {...rise(0)}>
            <PennyAvatar size={30} />
            <span className="text-[18px] font-[600] tracking-[-0.02em] text-white">Penny</span>
          </motion.div>
          <motion.h1 id="penny-title" className="mt-5 font-[600] leading-[0.98] tracking-[-0.045em] text-white [font-size:clamp(48px,7vw,96px)]" {...rise(0.08)}>
            Hey, I’m Penny
          </motion.h1>
          <motion.p className="mt-5 max-w-[46ch] text-[16px] leading-[1.6] text-white/90 sm:text-[18px]" {...rise(0.18)}>
            Your AI shopping agent. Tell me what you need and I’ll shop around, check every listing for scams, and only buy when I’m sure.
            Otherwise I’ll ask you, or walk away.
          </motion.p>

          <motion.form {...rise(0.3)} onSubmit={(e) => { e.preventDefault(); submit(); }} aria-label="Ask Penny to buy something"
            className="mt-9 w-full max-w-[680px] rounded-[24px] bg-white p-2 text-left shadow-[0_30px_60px_-28px_oklch(25%_0.06_170/0.6)]">
            <div className="flex items-center gap-2">
              <label htmlFor="penny-q" className="sr-only">What should Penny buy?</label>
              <input ref={input} id="penny-q" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" maxLength={1000}
                placeholder="What should I buy for you?" className="h-12 min-w-0 flex-1 bg-transparent pl-4 text-[16px] text-ink outline-none placeholder:text-ink-4" />
              <button type="submit" disabled={busy}
                className="inline-flex h-12 shrink-0 items-center gap-2 rounded-[16px] bg-ink px-5 text-[15px] font-medium text-white transition-[background-color,transform] hover:bg-ink-2 active:scale-[0.97] disabled:opacity-60">
                {busy ? "Opening…" : "Ask Penny"}
                {!busy && <ArrowUpRight size={16} aria-hidden className="opacity-80" />}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-divider px-3 pb-1 pt-2.5 text-[13px] text-ink-3">
              <label className="inline-flex items-center gap-1.5">
                Budget
                <span className="inline-flex items-center rounded-[10px] bg-canvas-sunk px-2">
                  <span aria-hidden className="text-ink-4">$</span>
                  <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" placeholder="optional" aria-label="Budget in dollars"
                    className="h-8 w-[76px] bg-transparent pl-1 text-ink outline-none placeholder:text-ink-4" />
                </span>
              </label>
              <span className="ml-auto hidden text-ink-4 sm:inline">Nothing gets ordered.</span>
            </div>
          </motion.form>

          <motion.div className="mt-5 flex max-w-[680px] flex-wrap justify-center gap-2" {...rise(0.4)}>
            {EXAMPLES.map((e) => (
              <button key={e} type="button" disabled={busy} onClick={() => { setQ(e); submit(e); }}
                className="rounded-full bg-white/15 px-3.5 py-1.5 text-[13px] text-white shadow-[inset_0_0_0_1px_oklch(100%_0_0/0.3)] backdrop-blur-md transition-colors hover:bg-white/25 disabled:opacity-60">
                {e}
              </button>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ capabilities */

interface Cap { key: string; icon: ComponentType<LucideProps>; name: string; body: string; visual: ComponentType }

const card = "rounded-[18px] bg-white shadow-[0_0_0_1px_oklch(20%_0.012_70/0.05),0_14px_30px_-18px_oklch(20%_0.012_70/0.35)]";

function ShopVisual() {
  const rows = [["Northgate Electronics", "$229.99"], ["BluePeak Tech", "$249.00"], ["SoundHaus", "$244.99"], ["GadgetFlash Store", "$189.99"]];
  return (
    <div className={cx(card, "w-full max-w-[380px] p-4")}>
      <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-4">Found 11 listings</p>
      <ul className="mt-3 grid gap-2">
        {rows.map(([m, pr], i) => (
          <motion.li key={m} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.1 + i * 0.07, ease: EASE }}
            className="flex items-center justify-between rounded-[12px] bg-canvas-sunk/60 px-3 py-2.5 text-[13.5px]">
            <span className="text-ink-2">AirPods Pro 2 · <span className="text-ink">{m}</span></span><span className="tabular-nums text-ink">{pr}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function ScamVisual() {
  const rows = [["Appel AirPods Pro 2", "Knockoff"], ["MEGA SALE 72% OFF", "Fake discount"], ["“Authorized Reseller”", "Hidden instructions"], ["GadgetFlash Store", "Brand-new seller"]];
  return (
    <div className={cx(card, "w-full max-w-[380px] p-4")}>
      <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-4">Skipped 7 risky listings</p>
      <ul className="mt-3 grid gap-2">
        {rows.map(([t, f], i) => (
          <motion.li key={t} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 + i * 0.08, ease: EASE }}
            className="flex items-center justify-between gap-3 rounded-[12px] px-1 py-1.5 text-[13.5px]">
            <span className="truncate text-ink-3 line-through decoration-ink-4">{t}</span>
            <span className="shrink-0 rounded-full bg-coral-soft px-2 py-0.5 text-[11.5px] font-medium text-coral-ink">{f}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function StopVisual() {
  const zones = [["Walk away", "below 50", "bg-coral-soft text-coral-ink"], ["Ask you", "50 to 74", "bg-amber-soft text-amber-ink"], ["Buy", "75 and up", "bg-pass-soft text-pass-ink"]];
  return (
    <div className={cx(card, "w-full max-w-[380px] p-5")}>
      <div className="flex items-baseline justify-between"><span className="text-[13px] font-medium text-ink-2">Trust score</span><span className="text-[26px] font-[600] tracking-[-0.03em] tabular-nums text-ink">95<span className="text-[13px] font-normal text-ink-4">/100</span></span></div>
      <div className="relative mt-3 h-2 rounded-full bg-[linear-gradient(90deg,var(--color-coral)_0%,var(--color-coral)_50%,var(--color-amber)_50%,var(--color-amber)_75%,var(--color-pass)_75%)] opacity-80">
        <motion.span className="absolute -top-1.5 size-5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_2px_var(--color-ink),0_4px_10px_-2px_oklch(20%_0.012_70/0.4)]"
          initial={{ left: "10%" }} animate={{ left: "95%" }} transition={{ duration: 1.4, ease: EASE, delay: 0.2 }} />
      </div>
      <ul className="mt-5 grid grid-cols-3 gap-2 text-center">
        {zones.map(([a, b, tone]) => <li key={a} className={cx("rounded-[12px] px-2 py-2", tone)}><span className="block text-[13px] font-medium">{a}</span><span className="text-[11.5px] opacity-80">{b}</span></li>)}
      </ul>
    </div>
  );
}

function CouncilVisual() {
  const votes = [["Spec checker", "Northgate", true], ["Fraud spotter", "Northgate", true], ["Value hunter", "Tecktonic", false], ["Your advocate", "Northgate", true]] as const;
  return (
    <div className={cx(card, "w-full max-w-[380px] p-4")}>
      <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-4">The council · 3 of 4 agree</p>
      <ul className="mt-3 grid gap-2">
        {votes.map(([e, pick, agree], i) => (
          <motion.li key={e} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.1 + i * 0.08, ease: EASE }}
            className="flex items-center justify-between rounded-[12px] bg-canvas-sunk/60 px-3 py-2.5 text-[13.5px]">
            <span className="text-ink">{e}</span>
            <span className={cx("rounded-full px-2 py-0.5 text-[11.5px] font-medium", agree ? "bg-pass-soft text-pass-ink" : "bg-coral-soft text-coral-ink")}>{agree ? pick : `${pick} (vetoed)`}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function RecordVisual() {
  const steps = ["intake", "sources", "checks", "council", "pre-mortem", "decision"];
  return (
    <div className={cx(card, "w-full max-w-[380px] p-4")}>
      <p className="flex items-center justify-between text-[12px] font-medium uppercase tracking-[0.12em] text-ink-4">Flight record<span className="normal-case tracking-normal text-sage-ink">✓ chain verified</span></p>
      <ol className="relative mt-3 grid gap-1.5">
        <span aria-hidden className="absolute bottom-3 left-[11px] top-3 w-px bg-ink-5" />
        {steps.map((s, i) => (
          <motion.li key={s} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.08 + i * 0.07, ease: EASE }}
            className="relative flex items-center gap-3 text-[13px]">
            <span className="grid size-[23px] place-items-center rounded-full bg-white text-[10px] tabular-nums text-ink-3 shadow-[0_0_0_1px_oklch(20%_0.012_70/0.12)]">{i + 1}</span>
            <span className="font-mono text-ink-2">{s}</span>
            <span className="ml-auto font-mono text-[11px] text-ink-4">#{["3a9f", "b71c", "0e42", "9d15", "c6a0", "71fe"][i]}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

const CAPS: Cap[] = [
  { key: "shop", icon: ShoppingBag, name: "Shops around for you", visual: ShopVisual,
    body: "Tell Penny what you want in plain words. She searches stores across the web and lines up every real option, with price and seller." },
  { key: "scam", icon: ShieldAlert, name: "Spots the scam", visual: ScamVisual,
    body: "Every listing is checked for knockoffs, fake discounts, overpricing, brand-new sellers and instructions hidden in the description." },
  { key: "stop", icon: Scale, name: "Knows when to stop", visual: StopVisual,
    body: "Penny only buys when her trust score clears 75. Between 50 and 75 she asks you first. Below that, she walks away." },
  { key: "council", icon: Users, name: "Gets a second opinion", visual: CouncilVisual,
    body: "Four expert models vote on every pick, then a pre-mortem tries to break it before she commits." },
  { key: "record", icon: FileCheck2, name: "Shows her work", visual: RecordVisual,
    body: "Every step goes into a hash-chained record, so you can see exactly why she chose what she chose." },
];

const STEP_MS = 6000;

function Capabilities() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { margin: "-30% 0px -30% 0px" });
  const reduce = useReducedMotion();
  const running = inView && !paused && !reduce;
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setI((v) => (v + 1) % CAPS.length), STEP_MS);
    return () => clearTimeout(t);
  }, [i, running]);
  const c = CAPS[i];
  const Visual = c.visual;

  return (
    <section ref={ref} aria-labelledby="caps-title" className="mx-auto max-w-[1180px] px-5 py-24 sm:px-8 sm:py-36"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-20">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-ink-2">Penny’s capabilities</p>
          <h2 id="caps-title" className="mt-4 font-display font-normal leading-[0.98] tracking-[-0.02em] text-ink [font-size:clamp(40px,4.6vw,60px)]">
            Let Penny do the shopping
          </h2>
          <div className="mt-10 h-px bg-divider" />
          <ol>
            {CAPS.map((x, k) => {
              const on = k === i;
              const Icon = x.icon;
              return (
                <li key={x.key} className="relative border-b border-divider">
                  <button type="button" onClick={() => setI(k)} aria-expanded={on}
                    className={cx("flex w-full items-center gap-3 py-5 text-left transition-colors duration-500", on ? "text-ink" : "text-ink-4 hover:text-ink-2")}>
                    <Icon size={18} strokeWidth={1.8} aria-hidden />
                    <span className="text-[18px] font-medium tracking-[-0.02em] sm:text-[19px]">{x.name}</span>
                  </button>
                  <div className={cx("grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.2,0.75,0.15,1)]", on ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                    <div className="overflow-hidden"><p className="max-w-[44ch] pb-6 pl-[30px] text-[15px] leading-[1.6] text-ink-3">{x.body}</p></div>
                  </div>
                  {on && (
                    <span aria-hidden className="absolute -bottom-px left-0 h-[2px] w-full overflow-hidden">
                      <span key={`${k}-${running}`} className="block h-full origin-left bg-sage"
                        style={{ animation: running ? `trap-progress ${STEP_MS}ms linear forwards` : undefined, transform: running ? undefined : "scaleX(0.35)" }} />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="relative isolate grid min-h-[440px] place-items-center overflow-hidden rounded-[32px] px-5 py-12 sm:min-h-[540px] sm:rounded-[40px]">
            <div aria-hidden className="mesh mesh-sage -z-10" />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={c.key} className="flex w-full justify-center"
                initial={{ opacity: 0, y: 20, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -14, filter: "blur(6px)" }} transition={{ duration: 0.5, ease: EASE }}>
                <Visual />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ how it works: a horizontal track driven by scroll */

const HOW = [
  { lead: "Tell Penny what you need", rest: " in plain words, with a budget if you have one. If a detail changes the item, like a shoe size, she’ll ask.", mesh: "mesh-sky",
    mock: <div className={cx(card, "w-[86%] p-4")}><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-4">You</p><p className="mt-1.5 rounded-[14px] rounded-br-[6px] bg-ink px-3 py-2 text-[13.5px] text-white">AirPods Pro 2, under $250 please</p></div> },
  { lead: "She shops around", rest: " across the web, collecting every real listing for the item along with its price, seller and details.", mesh: "mesh-gold",
    mock: <div className={cx(card, "w-[86%] p-4")}><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-4">Found 11 listings</p>{["$229.99 · Northgate", "$249.00 · BluePeak", "$244.99 · SoundHaus"].map((r) => <p key={r} className="mt-2 rounded-[10px] bg-canvas-sunk/70 px-3 py-1.5 text-[13px] tabular-nums text-ink-2">{r}</p>)}</div> },
  { lead: "She checks every listing", rest: " for knockoffs, fake discounts, overpricing, brand-new sellers and instructions hidden in the text.", mesh: "mesh-dusk",
    mock: <div className={cx(card, "flex w-[86%] flex-wrap gap-1.5 p-4")}>{["Knockoff", "Fake discount", "Hidden instructions", "Brand-new seller", "Overpriced"].map((f) => <span key={f} className="rounded-full bg-coral-soft px-2.5 py-1 text-[12px] font-medium text-coral-ink">{f}</span>)}</div> },
  { lead: "The council votes", rest: " — four expert models score every safe option, then a pre-mortem tries to talk her out of the winner.", mesh: "mesh-sage",
    mock: <div className={cx(card, "w-[86%] p-4")}><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-4">3 of 4 picked</p><p className="mt-1.5 text-[15px] font-medium text-ink">Northgate Electronics · $229.99</p><div className="mt-3 flex gap-1.5">{[1, 1, 0, 1].map((v, i) => <span key={i} className={cx("h-1.5 flex-1 rounded-full", v ? "bg-pass" : "bg-coral")} />)}</div></div> },
  { lead: "She decides", rest: " to buy when she’s sure, to ask you when she isn’t, or to walk away. You always see why.", mesh: "mesh-gold",
    mock: <div className={cx(card, "w-[86%] p-4")}><div className="flex items-center gap-2"><PennyAvatar size={26} /><span className="text-[13px] font-medium text-ink">Penny</span></div><p className="mt-2 text-[15px] font-[600] tracking-[-0.02em] text-ink">I’d buy this one.</p><p className="mt-0.5 text-[12.5px] text-ink-3">Trust 95/100 · nothing ordered yet</p></div> },
];

function HowItWorks() {
  const ref = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [dist, setDist] = useState(0);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const measure = () => {
      setWide(mq.matches);
      if (track.current) setDist(Math.max(0, track.current.scrollWidth - window.innerWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (track.current) ro.observe(track.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  const pinned = wide && !reduce && dist > 0;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, (v) => (pinned ? -v * dist : 0));

  return (
    <section ref={ref} aria-labelledby="how-title" className="relative" style={pinned ? { height: `calc(100svh + ${dist}px)` } : undefined}>
      <div className={cx(pinned && "sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden", !pinned && "py-24")}>
        <div className="px-5 text-center">
          <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-ink-2">How it works</p>
          <h2 id="how-title" className="mx-auto mt-4 max-w-[17ch] font-[600] leading-[1] tracking-[-0.045em] text-ink [font-size:clamp(36px,4.8vw,60px)]">
            Say what you need. She handles the rest.
          </h2>
        </div>
        <motion.div ref={track} style={{ x }}
          className={cx("mt-12 flex gap-5 px-5 sm:gap-6 sm:px-[max(32px,calc((100vw-1180px)/2))]", pinned ? "w-max" : "snap-x snap-mandatory scroll-px-5 overflow-x-auto pb-4 [scrollbar-width:none] sm:scroll-px-8")}>
          {HOW.map((h, i) => (
            <article key={h.lead} className="w-[min(340px,82vw)] shrink-0 snap-start sm:w-[360px]">
              <div className="relative isolate grid aspect-[4/3] place-items-center overflow-hidden rounded-[24px]">
                <div aria-hidden className={cx("mesh -z-10", h.mesh)} />
                {h.mock}
              </div>
              <p className="mt-5 text-[16px] leading-[1.55] text-ink-3">
                <span className="font-medium text-ink">0{i + 1} — {h.lead}</span>{h.rest}
              </p>
            </article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ ways to use her + FAQ */

const WAYS = [
  { icon: Sparkles, title: "Ask her right here", body: "Type what you need at the top of this page. Penny shows you what she’d buy and why.", href: "#top", cta: "Ask Penny" },
  { icon: Users, title: "Call her from your agent", body: "Any MCP agent can hand Penny a purchase with the plan_purchase tool and get her decision back.", href: "#agents", cta: "Connect an agent" },
  { icon: FileCheck2, title: "Check her work", body: "Every answer links to its full record: the listings, the checks, the votes, and a verified hash chain.", href: "#top", cta: "Ask, then open the record" },
];

const FAQ = [
  { q: "Does Penny actually buy things?", a: "Not yet. Penny plans the purchase: she tells you exactly what she would buy, from which seller, for how much, and why. Nothing is ordered and no card is charged." },
  { q: "How does Penny decide whether to buy?", a: "She gives the best option a trust score out of 100, built from how well it matches what you asked for (30%), whether it’s genuine (25%), the price (15%), the seller (10%), how much her council agrees (10%) and the evidence behind it (10%). At 75 or above she’d buy. From 50 to 74 she asks you first. Below 50 she walks away." },
  { q: "When will Penny ask me instead of deciding?", a: "Whenever a missing detail would change the item, like a size or a storage capacity, whenever her trust score lands between 50 and 75, and whenever her pre-mortem finds a problem only you can settle." },
  { q: "Where does Penny shop?", a: "Across the web, using live search." },
  { q: "What stops Penny from falling for a scam?", a: "Every listing goes through hard checks first: knockoffs, fake discounts, overpricing, brand-new sellers, and instructions hidden in the listing text. Listings that fail are vetoed before her council of four expert models votes, and a pre-mortem then tries to find what could still go wrong." },
  { q: "Can my own AI agent use Penny?", a: "Yes, any agent that speaks MCP: Claude, Cursor, VS Code Copilot, Gemini CLI, the OpenAI Agents SDK, LangChain and more. Connect it to Bonded’s Penny server at /api/mcp/penny and it can call plan_purchase, vet_listing and send_listing. See “Use Penny from any agent” above for setup." },
  { q: "Can I see why Penny chose something?", a: "Always. Each answer has a full record with every listing she found, every check, every vote and the pre-mortem, written to a hash chain so it can’t be quietly edited afterwards." },
];

/** Connect any MCP agent to Penny's server: the address, then per-client setup. */
function ForAgents() {
  const origin = usePublicOrigin();
  const endpoint = `${origin}/api/mcp/penny`;
  return (
    <section id="agents" aria-labelledby="agents-title" className="relative isolate mx-auto max-w-[920px] scroll-mt-24 px-5 py-24 sm:px-8 sm:py-32">
      <div aria-hidden className="burst burst-sky" style={{ ["--bx" as string]: "50%", ["--by" as string]: "40%", ["--bs" as string]: "min(900px, 140vw)", ["--bo" as string]: 0.7 }} />
      <h2 id="agents-title" className="text-center font-[600] leading-[1] tracking-[-0.045em] text-ink [font-size:clamp(34px,4.4vw,52px)]">Use Penny from any agent.</h2>
      <p className="mx-auto mt-5 max-w-[52ch] text-center text-[16px] leading-[1.6] text-ink-3 sm:text-[17px]">
        Penny is an MCP server, an open standard, so it works with Claude, Cursor, VS Code Copilot, Gemini CLI, the OpenAI Agents SDK, LangChain and anything else that speaks MCP. Your agent gets four tools: <span className="font-mono text-[14px] text-ink-2">plan_purchase</span>, <span className="font-mono text-[14px] text-ink-2">get_proposal</span>, <span className="font-mono text-[14px] text-ink-2">vet_listing</span> and <span className="font-mono text-[14px] text-ink-2">send_listing</span>. None of them ever buys anything.
      </p>
      <div className="mx-auto mt-10 flex max-w-[620px] justify-center"><CopyField value={endpoint} size="lg" className="w-full" /></div>
      <div className="mt-10"><SetupTabs endpoint={endpoint} /></div>
      <p className="mt-6 text-center text-[13.5px] leading-[1.6] text-ink-4">
        Hosted agents (ChatGPT, Claude.ai) need Bonded on a public HTTPS address. Want to benchmark your agent instead? <Link href="/connect" className="text-ink-2 underline-offset-4 hover:underline">Use the SpendBench server</Link>.
      </p>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section aria-labelledby="faq-title" className="mx-auto max-w-[800px] px-5 pb-28 pt-8 sm:pb-40">
      <h2 id="faq-title" className="text-center font-[600] leading-[1] tracking-[-0.045em] text-ink [font-size:clamp(34px,4.4vw,52px)]">Questions about Penny</h2>
      <ul className="mt-12 border-t border-divider">
        {FAQ.map((f, i) => {
          const on = open === i;
          return (
            <li key={f.q} className="border-b border-divider">
              <button type="button" onClick={() => setOpen(on ? null : i)} aria-expanded={on}
                className="flex w-full items-start gap-4 py-5 text-left">
                <span aria-hidden className={cx("mt-0.5 grid size-7 shrink-0 place-items-center rounded-[9px] transition-colors", on ? "bg-ink text-white" : "bg-canvas-sunk text-ink-2")}>
                  <Plus size={15} className={cx("transition-transform duration-300", on && "rotate-45")} />
                </span>
                <span className="text-[17px] font-medium tracking-[-0.015em] text-ink sm:text-[18px]">{f.q}</span>
              </button>
              <div className={cx("grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.2,0.75,0.15,1)]", on ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                <div className="overflow-hidden"><p className="pb-6 pl-11 text-[15px] leading-[1.65] text-ink-3">{f.a}</p></div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ page */

export default function PennyView() {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const reduce = useReducedMotion();
  const navigation = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(navigation.current), []);
  const ask = (draft: PennyDraft) => {
    const href = `/penny/shop/${createRequest(draft)}`;
    router.prefetch(href);
    setOpening(true);
    navigation.current = setTimeout(() => router.push(href), reduce ? 0 : 180);
  };

  return (
    <motion.div id="top" animate={{ opacity: opening ? 0 : 1, y: opening && !reduce ? -6 : 0 }} transition={{ duration: reduce ? 0 : 0.22, ease: EASE }}>
      <Hero onAsk={ask} busy={opening} />

      <Capabilities />
      <HowItWorks />

      <section aria-labelledby="ways-title" className="mx-auto max-w-[1180px] px-5 py-24 sm:px-8 sm:py-32">
        <div className="text-center">
          <h2 id="ways-title" className="mx-auto max-w-[18ch] font-[600] leading-[1] tracking-[-0.045em] text-ink [font-size:clamp(34px,4.4vw,52px)]">Penny works wherever you do</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="#top" className="inline-flex h-12 items-center gap-2 rounded-[14px] bg-ink px-6 text-[15px] font-medium text-white transition-transform active:scale-[0.97]">Ask Penny <ArrowUpRight size={16} aria-hidden className="opacity-80" /></a>
            <Link href="/connect" className="inline-flex h-12 items-center rounded-[14px] bg-white px-6 text-[15px] font-medium text-ink shadow-[0_0_0_1px_oklch(20%_0.012_70/0.12)]">Connect your agent</Link>
          </div>
        </div>
        <ul className="mt-14 grid gap-4 md:grid-cols-3">
          {WAYS.map((w) => (
            <li key={w.title}>
              <a href={w.href} className="group flex h-full flex-col rounded-[24px] bg-[oklch(97%_0.006_85)] p-6 transition-colors hover:bg-[oklch(95.6%_0.01_85)]">
                <w.icon size={20} strokeWidth={1.7} className="text-ink-2" aria-hidden />
                <h3 className="mt-5 text-[19px] font-medium tracking-[-0.02em] text-ink">{w.title}</h3>
                <p className="mt-2 flex-1 text-[14.5px] leading-[1.6] text-ink-3">{w.body}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink">{w.cta}<ArrowRight size={14} aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5" /></span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <ForAgents />
      <Faq />
    </motion.div>
  );
}
