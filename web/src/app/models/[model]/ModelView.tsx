"use client";
// A model: its name, one score, the chance of success with its interval, one sentence, three facts.
// Everything else (traps, failure modes, history, failures) waits behind "Details".
import Link from "next/link";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { CountBars, LineChart, RateBars } from "@/components/charts";
import Disclosure from "@/components/Disclosure";
import FailureList from "@/components/FailureList";
import { ErrorState, cx } from "@/components/ui";
import type { ModelStats } from "@/lib/types";
import { useApi, type BankResponse, type ModelResponse } from "@/lib/ui/api";
import { TRAP_LABEL, TRAP_TYPES, cost, dateTime, failureLabel, ms, num, pct, runHref, usd } from "@/lib/ui/format";

const EASE = [0.2, 0.75, 0.15, 1] as const;
const clean = (s: string) => s.replace(/\s*\(sim\)\s*$/i, "");

function scamLine(s: ModelStats) {
  const k = Math.round(s.metrics.scamRate * s.n);
  return k === 0 ? `Never fell for a scam in ${s.n} task${s.n === 1 ? "" : "s"}.` : `Fell for a scam in ${k} of ${s.n} tasks.`;
}

export default function ModelView({ model }: { model: string }) {
  const { data, error, loading, reload } = useApi<ModelResponse>(`/api/models/${encodeURIComponent(model)}`);

  if (error) return (<><Crumb /><h1 className="mt-10 break-anywhere text-[40px] font-[600] tracking-[-0.045em] text-ink">{model}</h1><div className="mt-8"><ErrorState error={error} onRetry={reload} /></div></>);
  if (loading && !data) return (
    <>
      <Crumb />
      <div aria-hidden className="mt-16 grid gap-6">
        <div className="h-5 w-24 animate-pulse rounded-full bg-canvas-sunk" />
        <div className="h-24 w-[min(620px,90%)] animate-pulse rounded-[24px] bg-canvas-sunk" />
        <div className="h-40 w-64 animate-pulse rounded-[24px] bg-canvas-sunk/70" />
      </div>
    </>
  );
  if (!data) return null;

  const { stats: s, failures, history } = data;
  const m = s.metrics;
  const traps = TRAP_TYPES.map((t) => {
    const b = s.byTrap?.[t];
    return { key: t, label: TRAP_LABEL[t], rate: b?.rate ?? { mean: 0, lower: 0, upper: 0 }, k: b?.fooled ?? 0, n: b?.exposed ?? 0 };
  });
  const modes = Object.entries(s.failureModes ?? {})
    .filter(([, v]) => (v ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k, v]) => ({ key: k, label: failureLabel(k), value: v ?? 0 }));
  const failedN = modes.reduce((a, b) => a + b.value, 0);
  const hist = [...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const scams = Math.round(m.scamRate * s.n);
  const risky = scams > 0;

  return (
    <div>
      <Crumb />

      {/* ---------------------------------------------------------------- the model, the number */}
      <section aria-labelledby="model-title" className="relative isolate pb-20 pt-10 sm:pb-28 sm:pt-16">
        <div aria-hidden className="burst burst-gold" style={{ ["--bx" as string]: "10%", ["--by" as string]: "30%", ["--bs" as string]: "min(900px, 130vw)", ["--bo" as string]: 0.7 }} />
        <div aria-hidden className={cx("burst", risky ? "burst-coral" : "burst-sage")} style={{ ["--bx" as string]: "88%", ["--by" as string]: "72%", ["--bs" as string]: "min(720px, 110vw)", ["--bo" as string]: risky ? 0.4 : 0.6 }} />

        <p className="text-[15px] text-ink-3">
          {s.provider}{s.simulated && <span className="text-ink-4"> · scripted policy, used to calibrate the benchmark</span>}
        </p>
        <h1 id="model-title" className="mt-2 break-anywhere font-[600] leading-[0.96] tracking-[-0.055em] text-ink [font-size:clamp(48px,8vw,120px)]">{clean(s.displayName)}</h1>
        <p className="mt-3 break-anywhere font-mono text-[12.5px] text-ink-4">{s.model}</p>

        <div className="mt-14 grid items-end gap-x-16 gap-y-10 sm:mt-20 lg:grid-cols-[auto_minmax(0,1fr)]">
          <div>
            <div className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-4">Score</div>
            <motion.p className="pnum mt-3 font-[600] text-ink numeral [font-size:clamp(96px,15vw,208px)]"
              initial={{ opacity: 0, filter: "blur(10px)", y: 8 }} animate={{ opacity: 1, filter: "blur(0px)", y: 0 }} transition={{ duration: 1.1, ease: EASE }}>
              {num(s.score, 1)}<span className="ml-[0.12em] align-baseline text-[0.2em] tracking-[-0.03em] text-ink-4">/100</span>
            </motion.p>
          </div>
          <div className="min-w-0 pb-3 lg:max-w-[560px]">
            <div className="flex items-baseline justify-between gap-4 text-[14px]">
              <span className="text-ink-3">Chance of success</span>
              <span className="tnum"><span className="text-[22px] font-[560] tracking-[-0.03em] text-ink">{pct(s.reliability.mean)}</span>
                <span className="ml-2 text-ink-4">{pct(s.reliability.lower)}–{pct(s.reliability.upper)}</span></span>
            </div>
            <div className="mt-4"><Bar r={s.reliability} /></div>
            <div className="mt-2 flex justify-between text-[11.5px] text-ink-4 tnum"><span>0</span><span>50</span><span>100</span></div>
          </div>
        </div>

        <motion.p className={cx("mt-14 max-w-[26ch] text-[24px] leading-[1.3] tracking-[-0.02em] sm:text-[30px]", risky ? "text-ink" : "text-ink-2")}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.25, ease: EASE }}>
          {scamLine(s)}
        </motion.p>
      </section>

      {/* ---------------------------------------------------------------- three facts */}
      <dl className="grid grid-cols-3 gap-x-4 gap-y-8 border-t border-divider pt-10 sm:gap-x-6">
        <Fact k="Success" v={pct(m.successRate)} sub={`${Math.round(m.successRate * s.n)} of ${s.n} tasks`} />
        <Fact k="Scams" v={String(scams)} sub={scams ? `${pct(m.scamRate)} of tasks` : "none taken"} tone={risky ? "bad" : "good"} />
        <Fact k="Avg cost" v={cost(m.avgCostUsd)} sub="per task" />
      </dl>
      <WalletLine model={s.model} />

      {/* ---------------------------------------------------------------- everything else */}
      <Disclosure id="details" label="Details" openLabel="Hide details" align="left" className="mt-16 sm:mt-20">
        <div className="grid gap-20 sm:gap-24">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
            <Fact small k="Over budget" v={pct(m.budgetViolationRate)} tone={m.budgetViolationRate >= 0.2 ? "bad" : undefined} />
            <Fact small k="Wrong item" v={pct(m.wrongItemRate)} />
            <Fact small k="No purchase" v={pct(m.noPurchaseRate)} />
            <Fact small k="Guardrail catch rate" v={pct(m.guardrailCatchRate)} sub="failures flagged pre-checkout" />
            <Fact small k="Avg latency" v={ms(m.avgLatencyMs)} sub={`${num(m.avgSteps, 1)} steps per task`} />
          </dl>

          <div className="grid gap-20 lg:grid-cols-2 lg:gap-12">
            <Block title="Trap resistance." lead="Fooled out of exposed, with a 90% interval.">
              <RateBars rows={traps} />
            </Block>
            <Block title="Failure modes." lead={`${failedN} attributed failure${failedN === 1 ? "" : "s"}.`}>
              {modes.length ? <CountBars rows={modes} /> : <p className="text-[15px] text-ink-3">No failures attributed.</p>}
            </Block>
          </div>

          <Block title="Score across runs." lead={hist.length ? `${hist.length} run${hist.length === 1 ? "" : "s"}.` : "No run history."}>
            {hist.length >= 2 ? (
              <>
                <LineChart
                  data={hist.map((h, i) => ({ x: i, y: h.score, label: `Run ${i + 1}`, href: runHref(h.runId) }))}
                  yMin={0} yMax={100} height={190}
                  yFormat={(v) => v.toFixed(0)}
                  xFormat={(p) => p.label ?? ""}
                  tooltip={(p, i) => (
                    <>
                      <div className="text-[13px] font-semibold text-ink tnum">Score {hist[i].score.toFixed(1)}</div>
                      <div className="text-ink-2 tnum">Success {pct(hist[i].successRate)}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-ink-4">{hist[i].runId}</div>
                      <div className="text-ink-4">{p.label} · {dateTime(hist[i].createdAt)}</div>
                    </>
                  )}
                />
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-3">
                  {hist.map((h, i) => (
                    <Link key={h.runId} href={runHref(h.runId)} className="hover:text-accent max-lg:inline-flex max-lg:min-h-10 max-lg:items-center"><span className="text-ink-4">Run {i + 1}</span> <span className="font-mono">{h.runId}</span></Link>
                  ))}
                </div>
              </>
            ) : hist.length === 1 ? (
              <p className="text-[15px] text-ink-3">One run so far (score {hist[0].score.toFixed(1)}). History appears after the next run.</p>
            ) : null}
          </Block>

          <Block title="Recent failures." lead="Each one is read by the attribution judge, which labels the fault and cites the trace steps it relied on.">
            {failures.length ? <FailureList results={failures} /> : <p className="text-[15px] text-ink-3">Every graded result for this model passed.</p>}
          </Block>
        </div>
      </Disclosure>
    </div>
  );
}

/** P(success): a hairline track, the 90% interval as a soft gold fade, and the mean as a bead (as on the ranking). */
function Bar({ r }: { r: ModelStats["reliability"] }) {
  const { lower, upper, mean } = r;
  return (
    <div className="relative h-6" role="img" aria-label={`Chance of success ${Math.round(mean * 100)}%, 90% interval ${Math.round(lower * 100)} to ${Math.round(upper * 100)}%`}>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink-5/70" />
      <motion.div className="absolute left-0 top-1/2 h-[2px] origin-left -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent to-[oklch(82%_0.1_86/0.8)]"
        style={{ width: `${mean * 100}%` }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1.2, delay: 0.2, ease: EASE }} />
      <motion.div className="absolute top-1/2 h-[8px] origin-left -translate-y-1/2 rounded-full"
        style={{ left: `${lower * 100}%`, width: `${Math.max(1, (upper - lower) * 100)}%`,
          background: "linear-gradient(90deg, oklch(84% 0.1 86 / 0) 0%, oklch(80% 0.125 84 / 0.9) 35%, oklch(80% 0.125 84 / 0.9) 65%, oklch(84% 0.1 86 / 0) 100%)" }}
        initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }} transition={{ duration: 1, delay: 0.3, ease: EASE }} />
      <motion.div className="absolute top-1/2 size-[12px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_2.5px_white]"
        style={{ left: `${mean * 100}%` }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.7 }} />
    </div>
  );
}

function Fact({ k, v, sub, tone, small }: { k: string; v: ReactNode; sub?: string; tone?: "good" | "bad"; small?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13.5px] text-ink-3">{k}</dt>
      <dd className={cx("mt-1.5 font-[560] leading-none tracking-[-0.04em] tnum", small ? "text-[26px]" : "text-[25px] min-[420px]:text-[30px] sm:text-[40px] lg:text-[48px]",
        tone === "bad" ? "text-coral-ink" : tone === "good" ? "text-sage-ink" : "text-ink")}>{v}</dd>
      {sub && <dd className="mt-2 text-[13px] text-ink-4">{sub}</dd>}
    </div>
  );
}

function Block({ title, lead, children }: { title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h2 className="font-[600] leading-[1.02] tracking-[-0.045em] text-ink [font-size:clamp(26px,3vw,36px)]">{title}</h2>
      <p className="mb-7 mt-2 max-w-[56ch] text-[15px] leading-relaxed text-ink-3">{lead}</p>
      {children}
    </section>
  );
}

/** "Wallet: Capital One ••4821 · 30 purchases · $4,210 spent", summed over every agent id this model shopped as. */
function WalletLine({ model }: { model: string }) {
  const { data } = useApi<BankResponse>("/api/bank");
  const mine = (data?.wallets ?? []).filter((w) => w.model === model).sort((a, b) => b.purchases - a.purchases);
  if (!data || !mine.length) return null;
  const n = mine.reduce((a, w) => a + w.purchases, 0);
  const spent = mine.reduce((a, w) => a + w.spent, 0);
  return (
    <p className="mt-8 text-[14px] text-ink-3">
      Wallet: <Link href="/bank" className="text-ink-2 transition-colors hover:text-accent">Capital One ••{mine[0].accountLast4}</Link>
      {" · "}{n} purchase{n === 1 ? "" : "s"} · {usd(spent, 0)} spent{data.simulated ? <span className="text-ink-4"> · simulated ledger</span> : null}
    </p>
  );
}

function Crumb() {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[14px] text-ink-3">
      <Link href="/#ranking" className="transition-colors hover:text-ink max-lg:inline-flex max-lg:min-h-10 max-lg:items-center">Ranking</Link>
      <span className="text-ink-5">/</span><span className="text-ink-4">Model</span>
    </nav>
  );
}
