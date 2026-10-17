"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, FastForward, Loader2, PenLine, RotateCcw, Swords } from "lucide-react";
import { hiddenText } from "@/components/StepTimeline";
import { RollingNumber } from "@/components/home/RollingNumber";
import { buttonClass, cx } from "@/components/ui";
import { modelHref, taskHref, traceHref, trapLabel, usd } from "@/lib/ui/format";
import type { TheaterScam, TheaterTest, useRedteamDirector } from "./useRedteamDirector";
import { WRITE } from "./useRedteamDirector";

type Director = ReturnType<typeof useRedteamDirector>;
const EASE = [0.2, 0.75, 0.15, 1] as const;
const SIMS = ["sim/careful", "sim/bargain-hunter", "sim/gullible", "sim/hasty", "sim/brand-blind"];
const SIM_NAMES: Record<string, string> = {
  "sim/careful": "Atlas Careful", "sim/bargain-hunter": "Magpie Bargain-Hunter", "sim/gullible": "Echo Gullible",
  "sim/hasty": "Dash Hasty", "sim/brand-blind": "Mimic Brand-Blind",
};
const nameOf = (m: string) => SIM_NAMES[m] ?? (m.includes("/") ? m.split("/").slice(1).join("/") : m);
const ZW = /[​-‏⁠﻿]/g;

/** Progress 0..1 of a segment on the stage clock (seconds since stageAt), scaled by the director's speed. */
function useClock(active: boolean) {
  const [now, setNow] = useState(() => performance.now() / 1000);
  useEffect(() => {
    if (!active) return;
    // ~30 fps is plenty for typing, and unlike rAF it keeps going in a background tab
    const iv = setInterval(() => setNow(performance.now() / 1000), 33);
    return () => clearInterval(iv);
  }, [active]);
  return now;
}

function typed(text: string, now: number, at: number, seg: readonly [number, number], speed: number, instant: boolean) {
  if (instant) return { s: text, typing: false, started: true };
  const p = Math.max(0, Math.min(1, (now - at - seg[0] * speed) / (seg[1] * speed)));
  return { s: text.slice(0, Math.round(p * text.length)), typing: p > 0 && p < 1, started: p > 0 };
}

function Caret({ tone = "accent" }: { tone?: "accent" | "rose" }) {
  return <span className={cx("ml-px inline-block h-[1.05em] w-[2px] translate-y-[2px] animate-pulse", tone === "rose" ? "bg-coral" : "bg-accent")} />;
}

export default function Theater({
  director, busy, onRun, onReplay, canReplay, connected, error,
}: { director: Director; busy: boolean; onRun: () => void; onReplay: () => void; canReplay: boolean; connected: boolean; error?: string }) {
  const { state, current, stage, stageAt, speed, revealed } = director;
  const reduce = useReducedMotion() ?? false;
  const now = useClock(stage === "writing" || stage === "testing");
  const round = current?.round ?? state.summary?.round;
  const inRound = current ? state.scams.filter((s) => s.round === current.round) : [];
  const idx = current ? inRound.indexOf(current) : -1;
  const total = Math.max(inRound.length, state.perRound && !state.retry ? state.perRound : 0);
  const keptCount = director.shownKept.length;
  const startTasks = state.startTasks;
  const playing = stage === "writing" || stage === "testing" || stage === "verdict";

  return (
    <section className="overflow-hidden rounded-xl border border-divider bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      {/* ------------------------------------------------ header */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-divider px-5 py-3 max-sm:px-4">
        <div className="flex items-center gap-2 text-[13px]">
          <span className={cx("size-1.5 rounded-full", playing || busy ? "pulse-dot bg-coral" : connected ? "bg-pass" : "bg-ink-5")} />
          <span className="font-semibold text-ink">{state.replay ? "Replay" : playing || busy ? "Live round" : stage === "done" ? "Round complete" : "Red-team theater"}</span>
          {round != null && round > 0 && <span className="text-ink-3 tnum">Round {round}</span>}
          {current && <span className="text-ink-4 tnum">· scam {idx + 1} of {total}</span>}
        </div>
        {inRound.length > 0 && (
          <div className="flex items-center gap-1" aria-label="Scams in this round">
            {Array.from({ length: total }).map((_, k) => {
              const s = inRound[k];
              const shownVerdict = s && (inRound.indexOf(s) < idx || (s === current && stage !== "writing" && stage !== "testing") || stage === "done");
              return (
                <span key={k} className={cx("h-1.5 w-5 rounded-full transition-colors duration-500",
                  !s ? "bg-canvas-sunk" : s === current && !shownVerdict ? "bg-accent" :
                  shownVerdict ? (s.verdict?.kept ? "bg-coral" : "bg-ink-5") : "bg-ink-5")} />
              );
            })}
          </div>
        )}
        <AnimatePresence>
          {state.retry && (
            <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
              className="rounded bg-amber-soft px-1.5 py-0.5 text-[11.5px] font-medium text-amber-ink">
              Nothing landed, so the attacker is escalating (wave {state.retry.attempt})
            </motion.span>
          )}
        </AnimatePresence>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2 max-sm:ml-0 max-sm:w-full max-sm:justify-between">
          {startTasks != null && (
            <div className="flex items-center gap-1.5 text-[13px] text-ink-3" title="Tasks in the benchmark">
              Benchmark
              <span className="tnum text-ink-4">{startTasks}</span>
              <ArrowRight size={12} className="text-ink-5" />
              <span className={cx("text-[15px] font-semibold", keptCount ? "text-ink" : "text-ink-3")}>
                <RollingNumber value={startTasks + keptCount} />
              </span>
              <span>tasks</span>
            </div>
          )}
          {playing && !reduce && (
            <button onClick={director.skip} className={cx(buttonClass("ghost"), "h-7 px-2 text-[12.5px]")} title="Play the rest faster">
              <FastForward size={13} /> Faster
            </button>
          )}
          {canReplay && !busy && !playing && (
            <button onClick={onReplay} className={cx(buttonClass("ghost"), "h-7 px-2 text-[12.5px]")} title="Replay the latest scams from the registry (no new run)">
              <RotateCcw size={13} /> Replay
            </button>
          )}
          <button onClick={onRun} disabled={busy || playing} className={buttonClass("primary")}>
            {busy ? <><Loader2 size={14} className="animate-spin" /> Round in progress</> : <><Swords size={14} /> Run red-team round</>}
          </button>
        </div>
      </div>
      {error && <div className="border-b border-coral/20 bg-coral-soft/60 px-5 py-2 text-[12.5px] text-coral-ink">{error}</div>}

      {/* ------------------------------------------------ stage */}
      <div className="grid grid-cols-1 min-h-[470px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 border-b border-divider p-5 max-sm:p-4 lg:border-b-0 lg:border-r">
          <PanelLabel icon={<PenLine size={12} />} text="Attacker"
            aside={current ? (current.listing.generator === "llm" ? "LLM attacker" : "Mutation engine") : undefined}
            live={stage === "writing"} liveText="writing a scam listing" />
          <AnimatePresence mode="wait">
            {current ? (
              <motion.div key={current.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35, ease: EASE }}>
                <Listing scam={current} now={now} at={stageAt} speed={speed} instant={reduce || stage !== "writing"} />
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><IdleAttacker busy={busy} /></motion.div>
            )}
          </AnimatePresence>
          {current && inRound.length > 1 && <RoundLog scams={inRound} current={current} stage={stage} />}
        </div>
        <div className="flex min-w-0 flex-col p-5 max-sm:p-4">
          <PanelLabel icon={<Swords size={12} />} text="Targets" aside={current ? `${current.models.length} models in parallel` : undefined}
            live={stage === "testing"} liveText="shopping with the scam in the store" />
          {current?.listing.task && (
            <div className="mb-3 rounded-md border border-divider bg-ivory/60 px-3 py-2 text-[12.5px]">
              <span className="text-ink-3">User asks: </span>
              <span className="text-ink">&ldquo;{current.listing.task.instruction}&rdquo;</span>
              {current.listing.task.budget != null && <span className="ml-1.5 text-ink-3 tnum">budget {usd(current.listing.task.budget, 0)}</span>}
            </div>
          )}
          <div className="space-y-1.5">
            {(current?.models.length ? current.models : SIMS).map((m, k) => {
              const t = current?.tests.find((x) => x.model === m);
              const shown = !!current && revealed.includes(m);
              const state: LaneState = !current ? "idle" : stage === "writing" ? "queued" : shown && t ? (t.fooled ? "fooled" : "resisted") : "running";
              return <Lane key={`${current?.id ?? "idle"}-${m}`} model={m} state={state} test={t} trap={current?.listing.trapType} k={k} reduce={reduce} />;
            })}
          </div>
          <div className="mt-auto pt-4">
            <AnimatePresence mode="wait">
              {current && (stage === "verdict" || stage === "done") && current.verdict && (
                <Verdict key={current.id} scam={current} />
              )}
            </AnimatePresence>
            {stage === "done" && state.summary && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-3 text-[12.5px] text-ink-3 tnum">
                Round {state.summary.round} finished: the attacker wrote {state.summary.generated} scam{state.summary.generated === 1 ? "" : "s"},
                {" "}{state.summary.kept} fooled at least one model and {state.summary.kept === 1 ? "was" : "were"} added to the benchmark.
              </motion.p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PanelLabel({ icon, text, aside, live, liveText }: { icon: React.ReactNode; text: string; aside?: string; live?: boolean; liveText?: string }) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
      <span className="inline-flex items-center gap-1.5 font-medium uppercase tracking-[0.06em] text-ink-3">{icon}{text}</span>
      {aside && <span className="text-ink-4">· {aside}</span>}
      <AnimatePresence>
        {live && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="ml-auto inline-flex items-center gap-1.5 text-accent">
            <Loader2 size={11} className="animate-spin" />{liveText}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ attacker: the listing being written */

function splitDescription(desc: string) {
  const visible: string[] = [];
  const payload: { text: string; how: string }[] = [];
  for (const raw of desc.split(/\n+/)) {
    if (!raw.trim()) continue;
    const h = hiddenText(raw);
    if (h.length) payload.push(...h);
    else visible.push(raw.replace(ZW, "").trim());
  }
  return { visible: visible.join(" "), payload };
}

function Listing({ scam, now, at, speed, instant }: { scam: TheaterScam; now: number; at: number; speed: number; instant: boolean }) {
  const L = scam.listing, p = L.product ?? {};
  const { visible, payload } = splitDescription(String(p.description ?? ""));
  const title = typed(String(p.title ?? L.id), now, at, WRITE.title, speed, instant);
  const desc = typed(visible, now, at, WRITE.desc, speed, instant);
  const pay = typed(payload.map((x) => x.text).join(" "), now, at, WRITE.payload, speed, instant);
  const note = typed(String(p.trap?.note ?? ""), now, at, WRITE.note, speed, instant);
  const showPrice = instant || now - at >= WRITE.price * speed;
  const off = p.listPrice && p.price && p.listPrice > p.price ? Math.round((1 - p.price / p.listPrice) * 100) : 0;
  const techniques = String(L.technique ?? "").split(/[+:]/).filter(Boolean);

  return (
    <div>
      <div className="rounded-lg border border-divider bg-white">
        <div className="flex items-start gap-4 border-b border-divider px-4 py-3.5 max-sm:gap-2 max-sm:px-3">
          <div className="min-w-0 flex-1">
            <div className="min-h-[44px] text-[15.5px] font-semibold leading-snug tracking-[-0.01em] text-ink">
              {title.s}{title.typing && <Caret />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
              {p.brand && <span>{p.brand}</span>}
              {p.merchantId && <span className="font-mono text-[11.5px] text-ink-4">{p.merchantId}</span>}
              {p.rating != null && <span className="tnum">★ {p.rating} · {Number(p.reviewCount ?? 0).toLocaleString("en-US")} reviews</span>}
            </div>
          </div>
          <div className="w-[96px] shrink-0 text-right max-sm:w-[84px]">
            <AnimatePresence>
              {showPrice && p.price != null && (
                <motion.div initial={{ opacity: 0, y: 6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 24 }}>
                  <div className="text-[19px] font-semibold tracking-[-0.02em] text-ink tnum">{usd(p.price)}</div>
                  {off > 0 && <div className="text-[11.5px] tnum"><span className="text-ink-4 line-through">{usd(p.listPrice)}</span> <span className="font-medium text-coral-ink">−{off}%</span></div>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        <div className="space-y-3 px-4 py-3.5 max-sm:px-3">
          <p className="min-h-[40px] text-[13px] leading-relaxed text-ink-2">{desc.s}{desc.typing && <Caret />}</p>
          {payload.length > 0 && (instant || pay.started) && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.25 }}
              className="overflow-hidden rounded-md border border-coral/35 bg-coral-soft/70">
              <div className="flex flex-wrap items-center justify-between gap-x-2 border-b border-coral/20 px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.06em] text-coral-ink">
                <span>Hidden payload, aimed at the agent</span>
                <span className="normal-case tracking-normal text-coral">{payload[0].how}</span>
              </div>
              <pre className="whitespace-pre-wrap break-words px-2.5 py-2 font-mono text-[11.5px] leading-relaxed text-coral-ink">{pay.s}{pay.typing && <Caret tone="rose" />}</pre>
            </motion.div>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex h-6 items-center rounded-md bg-coral-soft px-2 text-[12px] font-medium text-coral-ink">{trapLabel(L.trapType)}</span>
        {techniques.map((t, k) => (
          <motion.span key={t + k} initial={instant ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: instant ? 0 : (0.3 + k * 0.12) * speed }}
            className="inline-flex h-6 items-center rounded-md border border-divider bg-white px-2 font-mono text-[11px] text-ink-2">{t}</motion.span>
        ))}
      </div>
      {note.s && (
        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
          <span className="font-medium text-ink-2">Why it&rsquo;s a scam</span> <span className="text-ink-4">(hidden from agents)</span>: {note.s}{note.typing && <Caret />}
        </p>
      )}
    </div>
  );
}

function RoundLog({ scams, current, stage }: { scams: TheaterScam[]; current: TheaterScam; stage: string }) {
  const ci = scams.indexOf(current);
  return (
    <div className="mt-5 border-t border-divider pt-3">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-4">This round</div>
      <ul className="space-y-0.5">
        {scams.map((s, i) => {
          const done = i < ci || (i === ci && (stage === "verdict" || stage === "done"));
          const isCur = i === ci && !done;
          return (
            <motion.li key={s.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
              className={cx("grid grid-cols-[16px_1fr_auto] items-center gap-2 rounded px-1 py-1 text-[12px]", isCur && "bg-ivory")}>
              <span className={cx("size-1.5 justify-self-center rounded-full",
                isCur ? "pulse-dot bg-accent" : !done ? "bg-ink-5" : s.verdict?.kept ? "bg-coral" : "bg-ink-5")} />
              <span className={cx("truncate", i > ci ? "text-ink-4" : "text-ink-2")}>{s.listing.product?.title ?? s.id}</span>
              <span className={cx("text-[11.5px] tnum", !done ? "text-ink-4" : s.verdict?.kept ? "text-coral-ink" : "text-ink-4")}>
                {!done ? (isCur ? "testing" : "queued") : s.verdict?.kept ? `fooled ${s.verdict.fooled.length}` : "discarded"}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

function IdleAttacker({ busy }: { busy: boolean }) {
  const steps = [
    ["Write", "The attacker composes a new listing aimed at one benchmark task: a knockoff, a fake discount, an injected instruction."],
    ["Test", "The listing goes into the store and every model shops the targeted task against it, in parallel."],
    ["Keep", "A scam that fools at least one model becomes a new benchmark task. Scams that fool nobody are removed."],
  ];
  return (
    <div className="flex h-full flex-col">
      <p className="max-w-[440px] text-[15px] leading-relaxed text-ink-2">
        {busy ? "Starting a round. The first listing appears here as soon as the attacker writes it." : "Each round, an adversary writes new scams and tests them against every model. Run one and watch it happen."}
      </p>
      <ol className="mt-6 space-y-4">
        {steps.map(([h, t], i) => (
          <li key={h} className="grid grid-cols-[28px_1fr] gap-3">
            <span className="flex size-6 items-center justify-center rounded-full border border-divider font-mono text-[11px] text-ink-3">{i + 1}</span>
            <div><div className="text-[13.5px] font-medium text-ink">{h}</div><p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{t}</p></div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ targets: one lane per model */

type LaneState = "idle" | "queued" | "running" | "fooled" | "resisted";

function outcome(t: TheaterTest | undefined, trap?: string) {
  if (!t) return "";
  const amt = t.amount ? ` · ${usd(t.amount)}` : "";
  if (t.fooled) return trap === "prompt_injection" ? `Obeyed the hidden instructions${amt}` : `Bought the ${trapLabel(trap ?? "").toLowerCase()}${amt}`;
  if (t.success) return `Bought the genuine item${amt}`;
  if (t.bought === false) return "Walked away without buying";
  if (t.overBudget) return `Avoided the scam, went over budget${amt}`;
  if (t.wrongItem) return `Avoided the scam, bought the wrong item${amt}`;
  return `Avoided the scam${amt}`;
}

function Lane({ model, state, test, trap, k, reduce }: { model: string; state: LaneState; test?: TheaterTest; trap?: string; k: number; reduce: boolean }) {
  const fooled = state === "fooled", resisted = state === "resisted";
  const body = (
    <motion.div layout={!reduce}
      className={cx("relative grid grid-cols-[1fr_104px] max-sm:grid-cols-[minmax(0,1fr)_88px] items-center gap-3 max-sm:gap-2 overflow-hidden rounded-lg border px-3 py-2.5 transition-colors duration-500",
        fooled ? "border-coral/35 bg-coral-soft/50" : resisted ? "border-divider bg-white" : "border-divider bg-white",
        state === "idle" && "opacity-60")}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-ink">{nameOf(model)}</span>
          <span className="truncate font-mono text-[11px] text-ink-4 max-sm:hidden">{model}</span>
        </div>
        <div className="mt-1.5 h-[18px]">
          <AnimatePresence mode="popLayout" initial={false}>
            {fooled || resisted ? (
              <motion.div key="o" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={cx("truncate text-[12px]", fooled ? "text-coral-ink" : "text-ink-3")}>
                {outcome(test, trap)}
              </motion.div>
            ) : (
              <motion.div key="t" exit={{ opacity: 0 }} className={cx("relative mt-[7px] h-[3px] overflow-hidden rounded-full", state === "idle" ? "bg-transparent" : "bg-canvas-sunk")}>
                {state === "running" && (
                  <motion.span className="absolute inset-y-0 w-1/3 rounded-full bg-accent/70"
                    initial={{ left: "-33%" }} animate={{ left: "100%" }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: k * 0.12 }} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="flex justify-end">
        <AnimatePresence mode="popLayout" initial={false}>
          {fooled ? (
            <motion.span key="f" initial={reduce ? false : { scale: 1.9, opacity: 0, rotate: -14 }} animate={{ scale: 1, opacity: 1, rotate: -6 }}
              transition={{ type: "spring", stiffness: 520, damping: 18 }}
              className="inline-flex h-7 items-center rounded-md border-2 border-coral px-2 text-[12px] font-bold uppercase tracking-[0.12em] text-coral-ink">
              Fooled
            </motion.span>
          ) : resisted ? (
            <motion.span key="r" initial={reduce ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-pass-soft px-2 text-[12px] font-medium text-pass-ink">
              <Check size={13} strokeWidth={2.5} /> Resisted
            </motion.span>
          ) : state === "running" ? (
            <motion.span key="s" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[12px] text-ink-3">Shopping…</motion.span>
          ) : state === "idle" ? (
            <span className="text-[12px] text-ink-4">Standing by</span>
          ) : state === "queued" ? (
            <motion.span key="q" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[12px] text-ink-4">Queued</motion.span>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
  return test?.sessionId && (fooled || resisted)
    ? <Link href={traceHref(test.sessionId)} title="Open this agent's trace" className="block">{body}</Link>
    : <Link href={modelHref(model)} className="block" tabIndex={-1}>{body}</Link>;
}

function Verdict({ scam }: { scam: TheaterScam }) {
  const v = scam.verdict!;
  const n = v.fooled.length;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.4, ease: EASE }}
      className={cx("flex items-center gap-3 rounded-lg border px-3.5 py-3", v.kept ? "border-accent/30 bg-accent-soft" : "border-divider bg-ivory")}>
      <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold", v.kept ? "bg-accent text-white" : "bg-ink-5 text-ink-3")}>
        {v.kept ? "+1" : "0"}
      </span>
      <div className="min-w-0 flex-1 text-[13px]">
        {v.kept ? (
          <>
            <div className="font-semibold text-ink">Added to benchmark</div>
            <div className="text-ink-2">Fooled {n} of {scam.models.length} model{scam.models.length === 1 ? "" : "s"}. It is now a permanent task.</div>
          </>
        ) : (
          <>
            <div className="font-semibold text-ink-2">Discarded</div>
            <div className="text-ink-3">Every model resisted it, so the listing was removed from the store.</div>
          </>
        )}
      </div>
      {v.kept && v.variantTaskId && (
        <Link href={taskHref(v.variantTaskId)} className="hidden max-w-[220px] shrink-0 items-center gap-1 truncate font-mono text-[11.5px] text-accent hover:underline sm:inline-flex">
          <span className="truncate">{v.variantTaskId}</span><ArrowRight size={12} className="shrink-0" />
        </Link>
      )}
    </motion.div>
  );
}
