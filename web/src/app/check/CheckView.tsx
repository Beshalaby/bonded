"use client";
// /check: paste any real listing. Bonded fetches it (SSRF-safe), reads it like an agent would, runs Bonded Shield,
// and sends the vetted listing back instead of buying it. One idea per screen: idle → working → verdict.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check as CheckIcon, Plus } from "lucide-react";
import { cx, EASE } from "@/design";
import type { ShieldVerdict } from "@/lib/shield/types";
import { VerdictView, type ListingView } from "./Verdict";

type Fetched = { status: number; site: string; extractedWith?: string; blocked?: boolean; reason?: string; ms: number; cached?: boolean };
type ApiOk = { listing: ListingView | null; verdict: ShieldVerdict | null; fetched: Fetched; fallback?: "paste"; message?: string };
type ApiErr = { error: string; code?: string; fallback?: "paste" };

type State =
  | { kind: "idle" }
  | { kind: "working"; stage: number; pasted: boolean }
  | { kind: "result"; listing: ListingView; verdict: ShieldVerdict; fetched: Fetched }
  | { kind: "blocked"; site: string; message: string; url?: string }
  | { kind: "paste" }
  | { kind: "error"; message: string; paste: boolean; url?: string };

export const EXAMPLES = [
  { label: "Amazon · AirPods Pro 2", url: "https://www.amazon.com/dp/B0D1XD1ZV3" },
  { label: "Walmart · Restored AirPods", url: "https://www.walmart.com/ip/5689919121" },
  { label: "Brooklinen · Sheet set", url: "https://www.brooklinen.com/products/classic-core-sheet-set" },
  { label: "eBay · Switch OLED", url: "https://www.ebay.com/itm/115478745689" },
];

const STAGES = ["Fetching", "Reading", "Checking seller", "Comparing price", "Scanning for hidden instructions"];
const STAGE_AT = [0, 900, 1900, 3000, 4200]; // ms after start; the last one holds until the verdict lands

function Stages({ stage, pasted }: { stage: number; pasted: boolean }) {
  const list = pasted ? STAGES.slice(1) : STAGES;
  const at = pasted ? Math.max(0, stage - 1) : stage;
  return (
    <ol className="mx-auto grid w-full max-w-[420px] gap-1" aria-live="polite">
      {list.map((s, i) => {
        const done = i < at, now = i === at;
        return (
          <motion.li key={s} initial={{ opacity: 0, y: 6 }} animate={{ opacity: i <= at ? 1 : 0.35, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: i * 0.05 }}
            className="flex h-12 items-center gap-4 text-left">
            <span aria-hidden className="relative flex size-6 shrink-0 items-center justify-center">
              {done ? (
                <span className="flex size-6 items-center justify-center rounded-full bg-sage-soft text-sage-ink"><CheckIcon size={13} strokeWidth={2.5} /></span>
              ) : now ? (
                <>
                  <span className="absolute size-6 animate-ping rounded-full bg-gold/40 [animation-duration:1.6s]" />
                  <span className="size-2.5 rounded-full bg-gold" />
                </>
              ) : (
                <span className="size-2 rounded-full bg-ink-5" />
              )}
            </span>
            <span className={cx("text-[19px] tracking-[-0.02em] sm:text-[21px]", now ? "font-[560] text-ink" : done ? "text-ink-3" : "text-ink-4")}>
              {s}{now ? "…" : ""}
            </span>
            {now && <span className="sr-only">in progress</span>}
          </motion.li>
        );
      })}
    </ol>
  );
}

export default function CheckView() {
  const router = useRouter();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [request, setRequest] = useState("");
  const [budget, setBudget] = useState("");
  const [more, setMore] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const ran = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);

  const run = useCallback(async (body: { url?: string; text?: string }) => {
    clearTimers();
    const pasted = !!body.text;
    setState({ kind: "working", stage: pasted ? 1 : 0, pasted });
    const t0 = Date.now();
    STAGE_AT.forEach((ms, i) => { if (i > 0 && (!pasted || i > 1)) timers.current.push(setTimeout(() => setState((s) => (s.kind === "working" ? { ...s, stage: Math.max(s.stage, i) } : s)), pasted ? Math.max(0, ms - 700) : ms)); });
    if (body.url) router.replace(`/check?u=${encodeURIComponent(body.url)}`, { scroll: false });
    const intent = { ...(request.trim() ? { request: request.trim() } : {}), ...(Number(budget) > 0 ? { budget: Number(budget) } : {}) };
    let out: ApiOk | ApiErr;
    try {
      const res = await fetch("/api/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, ...(Object.keys(intent).length ? { intent } : {}) }) });
      out = res.status === 429 ? { error: "Too many checks in a minute. Take a breath and try again." } : await res.json();
    } catch { out = { error: "Couldn’t reach Bonded. Check your connection and try again." }; }
    // let the staged progress finish gracefully rather than snapping
    const minMs = reduce ? 0 : pasted ? 1400 : 1800;
    const wait = Math.max(0, minMs - (Date.now() - t0));
    await new Promise((r) => setTimeout(r, wait));
    clearTimers();
    if ("error" in out) { setState({ kind: "error", message: out.error, paste: out.fallback === "paste", url: body.url }); return; }
    if (out.fetched.blocked || !out.listing || !out.verdict) {
      setState({ kind: "blocked", site: out.fetched.site, message: out.message ?? "This site doesn’t let automated checkers read its pages.", url: body.url });
      return;
    }
    setState({ kind: "working", stage: STAGES.length, pasted });
    await new Promise((r) => setTimeout(r, reduce ? 0 : 350));
    setState({ kind: "result", listing: out.listing, verdict: out.verdict, fetched: out.fetched });
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, [budget, request, reduce, router]);

  // /check?u=<url> runs immediately (links from the home page, from send_listing and from shared results)
  useEffect(() => {
    const u = params.get("u");
    if (u && ran.current !== u) { ran.current = u; setUrl(u); void run({ url: u }); }
  }, [params, run]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const v = url.trim();
    if (!v) { input.current?.focus(); return; }
    const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    ran.current = withScheme;
    setUrl(withScheme);
    void run({ url: withScheme });
  };
  const again = () => {
    clearTimers(); ran.current = null; setState({ kind: "idle" }); setUrl(""); setText("");
    router.replace("/check", { scroll: false });
    setTimeout(() => input.current?.focus(), 50);
  };

  const fade = reduce ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.6, ease: EASE } };

  return (
    <div className="relative isolate -mx-4 overflow-x-clip px-4 pb-10 sm:-mx-8 sm:px-8">
      <AnimatePresence mode="wait">
        {state.kind === "result" ? (
          <motion.div key="result" {...fade} className="pt-6 sm:pt-10">
            <VerdictView l={state.listing} v={state.verdict} onAnother={again} />
          </motion.div>
        ) : state.kind === "working" ? (
          <motion.div key="working" {...fade} className="relative isolate flex min-h-[62svh] flex-col items-center justify-center pt-6 text-center">
            <div aria-hidden className="burst burst-gold" style={{ ["--bx" as string]: "50%", ["--by" as string]: "46%", ["--bs" as string]: "min(820px, 130vw)", ["--bo" as string]: 0.75 }} />
            <p className="max-w-full truncate px-2 text-[13px] text-ink-3">{state.pasted ? "Your pasted listing" : url.replace(/^https?:\/\/(www\.)?/, "")}</p>
            <h1 className="mt-3 font-[600] leading-[1] tracking-[-0.05em] text-ink [font-size:clamp(40px,6vw,72px)]">Checking it like an agent would.</h1>
            <div className="mt-12 w-full"><Stages stage={state.stage} pasted={state.pasted} /></div>
          </motion.div>
        ) : (
          <motion.div key="form" {...fade} className="relative isolate pt-10 text-center sm:pt-16">
            <div aria-hidden className="burst burst-gold" style={{ ["--bx" as string]: "30%", ["--by" as string]: "16%", ["--bs" as string]: "min(600px, 120vw)", ["--bo" as string]: 0.75 }} />
            <div aria-hidden className="burst burst-sage" style={{ ["--bx" as string]: "76%", ["--by" as string]: "66%", ["--bs" as string]: "min(540px, 110vw)", ["--bo" as string]: 0.55 }} />
            <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-ink-3">Bonded Shield</p>
            <h1 className="mx-auto mt-4 max-w-[12ch] font-[600] leading-[0.96] tracking-[-0.055em] text-ink [font-size:clamp(48px,8.4vw,118px)] [text-wrap:balance]">
              Paste any <span className="text-gold-sweep">listing.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-[40ch] text-[17px] leading-[1.55] text-ink-3 [text-wrap:pretty] sm:text-[19px]">
              Bonded Shield checks it like an agent would — and sends it back instead of buying.
            </p>

            {state.kind === "blocked" || state.kind === "paste" || (state.kind === "error" && state.paste) ? (
              <PasteFallback
                title={state.kind === "blocked" ? `${state.site} wouldn’t let us in.` : state.kind === "paste" ? "Paste the listing." : "We couldn’t read that page."}
                message={state.kind === "blocked" ? "That’s their call, and we respect it. Copy the listing’s text (title, price, seller, description) and paste it here instead."
                  : state.kind === "paste" ? "Copy everything on the listing page (title, price, seller, description) and drop it here. Hidden text is welcome: that’s what Shield looks for."
                  : state.message}
                text={text} setText={setText}
                onSubmit={() => text.trim() && void run({ text, url: state.kind === "paste" ? undefined : state.url })}
                onBack={again}
              />
            ) : (
              <>
                <form onSubmit={submit} className="mx-auto mt-10 w-full max-w-[760px] sm:mt-12" role="search" aria-label="Check a listing">
                  <div className="flex items-center gap-2 rounded-full bg-surface py-2 pl-5 pr-2 shadow-float ring-1 ring-ink/[0.04] focus-within:ring-2 focus-within:ring-accent/40 sm:pl-7">
                    <label htmlFor="listing-url" className="sr-only">Listing link</label>
                    <input id="listing-url" ref={input} value={url} onChange={(e) => setUrl(e.target.value)} type="url" inputMode="url" autoComplete="off" spellCheck={false}
                      placeholder="https://www.ebay.com/itm/…" className="h-12 min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-4 sm:h-14 sm:text-[18px]" />
                    <button type="submit" className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-full bg-ink px-6 text-[15px] font-medium text-white transition-colors hover:bg-ink-2 sm:h-14 sm:px-8 sm:text-[16px]">
                      Check
                    </button>
                  </div>
                  {state.kind === "error" && <p role="alert" className="mt-4 text-[15px] text-coral-ink">{state.message}</p>}

                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    <span className="mr-1 text-[13px] text-ink-4">Try</span>
                    {EXAMPLES.map((x) => (
                      <button key={x.url} type="button" onClick={() => { setUrl(x.url); input.current?.focus(); }}
                        className="rounded-full px-3.5 py-1.5 text-[13px] text-ink-3 ring-1 ring-inset ring-ink/[0.08] transition-colors hover:bg-ivory hover:text-ink">
                        {x.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-6">
                    {!more ? (
                      <button type="button" onClick={() => setMore(true)} className="inline-flex items-center gap-1.5 text-[14px] text-ink-3 transition-colors hover:text-ink">
                        <Plus size={14} aria-hidden /> add what you’re shopping for
                      </button>
                    ) : (
                      <motion.div initial={reduce ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.4, ease: EASE }}
                        className="mx-auto flex max-w-[620px] flex-col gap-2 overflow-hidden px-1 py-1 sm:flex-row">
                        <label className="sr-only" htmlFor="intent-request">What do you want?</label>
                        <input id="intent-request" value={request} onChange={(e) => setRequest(e.target.value)} maxLength={500} placeholder="What do you want? e.g. AirPods Pro 2, new"
                          className="h-12 min-w-0 flex-1 rounded-full bg-surface px-5 text-[15px] text-ink shadow-[0_0_0_1px_oklch(20%_0.012_70/0.08)] outline-none placeholder:text-ink-4 focus:shadow-[0_0_0_2px_var(--color-accent)]" />
                        <label className="sr-only" htmlFor="intent-budget">Budget in dollars</label>
                        <div className="flex h-12 items-center rounded-full bg-surface px-5 shadow-[0_0_0_1px_oklch(20%_0.012_70/0.08)] focus-within:shadow-[0_0_0_2px_var(--color-accent)] sm:w-[150px]">
                          <span aria-hidden className="text-ink-4">$</span>
                          <input id="intent-budget" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="Budget"
                            className="ml-1 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-4" />
                        </div>
                      </motion.div>
                    )}
                  </div>
                </form>
                <button type="button" onClick={() => setState({ kind: "paste" })}
                  className="group mt-14 inline-flex items-center gap-1.5 text-[14px] text-ink-3 transition-colors hover:text-ink">
                  Or paste the listing’s text <ArrowRight size={14} aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5" />
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PasteFallback({ title, message, text, setText, onSubmit, onBack }: {
  title: string; message: string; text: string; setText: (s: string) => void; onSubmit: () => void; onBack: () => void;
}) {
  return (
    <div className="mx-auto mt-12 w-full max-w-[680px] text-left">
      <h2 className="text-center text-[24px] font-[580] tracking-[-0.03em] text-ink sm:text-[28px]">{title}</h2>
      <p className="mx-auto mt-2 max-w-[52ch] text-center text-[15.5px] leading-relaxed text-ink-3 [text-wrap:pretty]">
        {message}
      </p>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="mt-7">
        <label htmlFor="listing-text" className="sr-only">Listing text</label>
        <textarea id="listing-text" value={text} onChange={(e) => setText(e.target.value)} rows={8} maxLength={20000} autoFocus
          placeholder={"Apple AirPods Pro 2 — Brand New Sealed\nUS $89.99\nSeller: example_store (12) 98% positive\nNo returns accepted\n…"}
          className="block w-full resize-y rounded-[24px] bg-surface px-5 py-4 font-mono text-[13.5px] leading-relaxed text-ink shadow-float outline-none ring-1 ring-ink/[0.04] placeholder:text-ink-4 focus:ring-2 focus:ring-accent/40" />
        <div className="mt-5 flex items-center justify-center gap-6">
          <button type="submit" disabled={!text.trim()} className="inline-flex h-12 items-center rounded-full bg-ink px-7 text-[15px] font-medium text-white transition-colors hover:bg-ink-2 disabled:bg-ink-4">
            Check this text
          </button>
          <button type="button" onClick={onBack} className="text-[15px] font-medium text-ink-3 transition-colors hover:text-ink">Use a link instead</button>
        </div>
      </form>
    </div>
  );
}
