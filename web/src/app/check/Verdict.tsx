"use client";
// The vetted listing, sent back: the real listing (image, title, price, seller), then Shield's verdict as one giant
// word on a burst of its colour, the headline, up to four signals, any hidden instructions it stripped, and the
// market estimate. Shared by /check and the /check/s/<id> page an agent's send_listing links to.
import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cx, EASE } from "@/design";
import type { NormalizedListing, ShieldSignal, ShieldVerdict } from "@/lib/shield/types";

export type ListingView = Omit<NormalizedListing, "description"> & { description?: string };

export const money = (n: number | undefined, currency = "USD") => {
  if (n == null) return "";
  const whole = Number.isInteger(n) || n >= 1000;
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(n); }
  catch { return `${currency} ${n.toFixed(2)}`; }
};

const WORD = { buy: "Buy.", caution: "Careful.", avoid: "Avoid." } as const;
const INK = { buy: "text-sage-ink", caution: "text-amber-ink", avoid: "text-coral-ink" } as const;
const BURST: Record<ShieldVerdict["decision"], { cls: string; style?: Record<string, string | number> }> = {
  buy: { cls: "burst burst-sage" },
  caution: { cls: "burst", style: { "--b1": "oklch(87% 0.11 78 / 0.7)", "--b2": "oklch(95% 0.045 85 / 0.7)" } },
  avoid: { cls: "burst burst-coral" },
};
const SEV_DOT = { critical: "bg-coral", warn: "bg-amber", info: "bg-ink-5" } as const;
const SEV_RANK = { critical: 0, warn: 1, info: 2 } as const;

export function topSignals(v: ShieldVerdict, n = 4): ShieldSignal[] {
  return [...v.signals]
    .filter((s) => s.code !== "HIDDEN_INSTRUCTIONS" || !v.injectionsRemoved.length) // shown in its own block
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]).slice(0, n);
}

/** Markdown an agent (or a person) can paste anywhere. */
export function summaryMarkdown(l: ListingView, v: ShieldVerdict, link?: string): string {
  const m = v.marketPrice;
  const lines = [
    `**Bonded Shield: ${WORD[v.decision]}** ${v.headline}`,
    "",
    `**${l.title}**`,
    [l.price != null ? money(l.price, l.currency) : null, l.condition, l.seller?.name ? `sold by ${l.seller.name}` : null, l.site].filter(Boolean).join(" · "),
    ...(m ? [`Market estimate: ${money(m.estimate, m.currency)}${m.low != null && m.high != null ? ` (${money(m.low, m.currency)}–${money(m.high, m.currency)})` : ""}`] : []),
    "",
    ...topSignals(v, 6).map((s) => `- ${s.severity === "critical" ? "⚠️ " : ""}${s.message}`),
    ...(v.injectionsRemoved.length ? ["", "Hidden instructions removed from the listing:", ...v.injectionsRemoved.slice(0, 3).map((x) => `> ~~${x.slice(0, 200)}~~`)] : []),
    "",
    ...(l.url ? [`Listing: ${l.url}`] : []),
    ...(link ? [`Verdict: ${link}`] : []),
    "_Checked by Bonded Shield. Nothing was purchased._",
  ];
  return lines.join("\n");
}

function ListingImage({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div aria-hidden className="flex size-full items-center justify-center bg-canvas-sunk text-[32px] font-[600] tracking-[-0.04em] text-ink-4 sm:text-[44px]">
        {title.trim().charAt(0).toUpperCase()}
      </div>
    );
  }
  // A plain <img> with no referrer: listing images live on every CDN under the sun, and next/image would need each one configured.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" referrerPolicy="no-referrer" loading="eager" onError={() => setFailed(true)} className="size-full object-contain p-3" />;
}

export function ListingCard({ l }: { l: ListingView }) {
  const seller = l.seller;
  const stars = seller?.rating != null ? `${seller.rating.toFixed(seller.rating >= 4.95 ? 0 : 1)}★` : null;
  return (
    <div className="flex items-start gap-4 rounded-[24px] bg-surface p-3.5 shadow-[0_0_0_1px_oklch(20%_0.012_70/0.05),0_30px_70px_-44px_oklch(25%_0.03_70/0.35)] sm:items-center sm:gap-7 sm:rounded-[28px] sm:p-5">
      <div className="size-[92px] shrink-0 overflow-hidden rounded-[16px] bg-white sm:size-[164px] sm:rounded-[20px]">
        <ListingImage src={l.images?.[0]} title={l.title} />
      </div>
      <div className="min-w-0 flex-1 pt-0.5 sm:pt-0">
        <p className="text-[11.5px] font-medium uppercase tracking-[0.14em] text-ink-3 sm:text-[12px]">{l.site ?? "Pasted listing"}</p>
        <h2 className="mt-1 line-clamp-3 text-[16.5px] font-[560] leading-[1.25] tracking-[-0.02em] text-ink [text-wrap:pretty] sm:mt-1.5 sm:text-[21px]">{l.title}</h2>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {l.price != null
            ? <span className="text-[24px] font-[600] tracking-[-0.04em] text-ink sm:text-[28px]">{money(l.price, l.currency)}</span>
            : <span className="text-[15px] text-ink-3">No price shown</span>}
          {l.listPrice != null && <span className="text-[15px] text-ink-4 line-through">{money(l.listPrice, l.currency)}</span>}
          {l.condition && <span className="text-[14px] capitalize text-ink-3">{l.condition}</span>}
        </div>
        {seller?.name && (
          <p className="mt-1.5 text-[13.5px] leading-snug text-ink-3 sm:mt-2 sm:text-[14px]">
            Sold by <span className="font-medium text-ink-2">{seller.name}</span>
            {seller.verified && <span className="text-sage-ink"> · verified</span>}
            {stars && <span> · {stars}</span>}
            {seller.reviewCount != null && <span> · {seller.reviewCount.toLocaleString()} ratings</span>}
          </p>
        )}
      </div>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  useEffect(() => { if (state === "idle") return; const t = setTimeout(() => setState("idle"), 2000); return () => clearTimeout(t); }, [state]);
  return (
    <>
      <button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(text); setState("ok"); } catch { setState("err"); }
      }}
        className={cx("inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-medium transition-colors duration-300",
          state === "ok" ? "bg-pass-soft text-pass-ink" : "bg-ink text-white hover:bg-ink-2")}>
        {state === "ok" ? <Check size={16} aria-hidden /> : <Copy size={15} aria-hidden />}
        {state === "ok" ? "Copied for your agent" : state === "err" ? "Couldn’t copy" : label}
      </button>
      <span role="status" className="sr-only">{state === "ok" ? "Summary copied to clipboard" : ""}</span>
    </>
  );
}

export function VerdictView({ l, v, note, onAnother, shareLink }: {
  l: ListingView; v: ShieldVerdict; note?: { by?: string; text?: string }; onAnother?: () => void; shareLink?: string;
}) {
  const reduce = useReducedMotion();
  const m = v.marketPrice;
  const vs = m && l.price != null && m.estimate > 0 ? Math.round(((l.price - m.estimate) / m.estimate) * 100) : undefined;
  const signals = topSignals(v);
  const burst = BURST[v.decision];
  const enter = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 14, filter: "blur(8px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" }, transition: { duration: 0.9, ease: EASE, delay: d } });

  return (
    <div className="mx-auto w-full max-w-[760px]">
      {note?.text && (
        <motion.p {...enter(0)} className="mb-6 text-center text-[16px] leading-relaxed text-ink-2 [text-wrap:pretty]">
          <span className="text-ink-3">{note.by ? `${note.by} sent you this listing` : "Sent to you"}:</span> “{note.text}”
        </motion.p>
      )}
      <motion.div {...enter(0)}><ListingCard l={l} /></motion.div>

      <section aria-label="Shield verdict" className="relative isolate mt-16 text-center sm:mt-20">
        <div aria-hidden className={burst.cls} style={{ ["--bx" as string]: "50%", ["--by" as string]: "38%", ["--bs" as string]: "min(980px, 150vw)", ["--bo" as string]: 0.95, ...(burst.style ?? {}) }} />
        <motion.p {...enter(0.08)} className="text-[12px] font-medium uppercase tracking-[0.16em] text-ink-3">Bonded Shield says</motion.p>
        <motion.h2 {...enter(0.14)} className={cx("numeral pnum mt-2 font-[600] leading-[0.9] tracking-[-0.06em] [font-size:clamp(84px,17vw,200px)]", INK[v.decision])}>
          {WORD[v.decision]}
        </motion.h2>
        <motion.p {...enter(0.22)} className="mx-auto mt-5 max-w-[34ch] text-[19px] leading-[1.45] text-ink-2 [text-wrap:balance] sm:text-[21px]">{v.headline}</motion.p>
      </section>

      {(signals.length > 0 || v.injectionsRemoved.length > 0 || m) && (
        <motion.div {...enter(0.3)} className="mx-auto mt-14 max-w-[620px]">
          {v.injectionsRemoved.length > 0 && (
            <div className="mb-8">
              <p className="flex items-center gap-2 text-[15px] font-medium text-coral-ink">
                <span aria-hidden className="size-2 rounded-full bg-coral" />
                Hidden instructions, removed
              </p>
              <p className="mt-1 text-[14px] text-ink-3">The listing tried to talk to your agent. Shield stripped it before anything could read it.</p>
              <ul className="mt-3 grid gap-2">
                {v.injectionsRemoved.slice(0, 3).map((x, i) => (
                  <li key={i} className="rounded-[16px] bg-coral-soft/70 px-4 py-3 font-mono text-[13px] leading-relaxed text-coral-ink/90 line-through decoration-coral/60 [overflow-wrap:anywhere]">
                    {x.length > 280 ? `${x.slice(0, 280)}…` : x}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {signals.length > 0 && (
            <ul className="grid gap-0">
              {signals.map((s, i) => (
                <li key={`${s.code}-${i}`} className="flex gap-3.5 border-b border-divider py-3.5 last:border-0">
                  <span aria-hidden className={cx("mt-[9px] size-2 shrink-0 rounded-full", SEV_DOT[s.severity])} />
                  <div className="min-w-0">
                    <p className="text-[16px] leading-[1.5] text-ink [text-wrap:pretty]">{s.message.replace(/^Reviewer:\s*/, "")}</p>
                    {s.evidence && <p className="mt-0.5 truncate text-[13px] text-ink-4">“{s.evidence}”</p>}
                  </div>
                  <span className="sr-only">{s.severity}</span>
                </li>
              ))}
            </ul>
          )}
          {m && (
            <p className="mt-6 text-center text-[14px] leading-relaxed text-ink-3">
              Market price ≈ <span className="font-medium text-ink-2">{money(m.estimate, m.currency)}</span>
              {m.low != null && m.high != null && <> ({money(m.low, m.currency)}–{money(m.high, m.currency)})</>}
              {vs != null && <> · this listing is <span className={cx("font-medium", vs > 15 || vs < -35 ? "text-coral-ink" : "text-ink-2")}>{vs === 0 ? "at market" : `${Math.abs(vs)}% ${vs > 0 ? "above" : "below"}`}</span></>}
              <span className="block text-[12.5px] text-ink-4">{m.basis.replace(/\s*\(openai\/[^)]+\)/, "")}</span>
            </p>
          )}
        </motion.div>
      )}

      <motion.div {...enter(0.38)} className="mt-12 flex flex-col items-center gap-5 sm:flex-row sm:justify-center sm:gap-7">
        <CopyButton text={summaryMarkdown(l, v, shareLink)} label="Send to my agent" />
        {l.url && (
          <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="group inline-flex items-center gap-1 text-[15px] font-medium text-ink-2 transition-colors hover:text-ink">
            Open listing <ArrowUpRight size={15} aria-hidden className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </a>
        )}
        {onAnother && (
          <button type="button" onClick={onAnother} className="text-[15px] font-medium text-ink-3 transition-colors hover:text-ink">Check another</button>
        )}
      </motion.div>
      <p className="mt-8 text-center text-[12.5px] text-ink-4">
        Nothing was bought. {v.judge.used === "llm" ? "Checked with rules and an AI reviewer." : "Checked with Shield’s rules."}
      </p>
    </div>
  );
}
