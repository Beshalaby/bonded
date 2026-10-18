// /research: SpendBench in plain words for someone seeing it for the first time. One question, three findings, how it
// works, the results, the common mistakes, and why the numbers hold up. Every number is read from the live store.
import Link from "next/link";
import type { ReactNode } from "react";
import { clean } from "@/components/report/charts";
import { A, ProviderDot, R, providerColor } from "@/components/report/primitives";
import { read } from "@/lib/db";
import { evaluateGuardrail } from "@/lib/guardrail-eval";
import { parseShieldModel } from "@/lib/shield/names";
import { MIN_RANKED_N, computeStats, latestResults } from "@/lib/stats";
import { getTask } from "@/lib/tasks";
import type { FailureMode, ModelStats } from "@/lib/types";
import { modelHref, traceHref } from "@/lib/ui/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Research", description: "SpendBench: can AI agents be trusted to shop with your money?" };

const EXAMPLE_TASK = "airpods-pro-2";

/** Failure modes in plain words. */
const MISTAKE: Record<FailureMode, string> = {
  no_purchase: "Gave up without buying",
  obeyed_injection: "Obeyed instructions hidden in a listing",
  untrusted_merchant: "Bought from a sketchy new seller",
  fake_discount: "Fell for a fake discount",
  bought_knockoff: "Bought a knockoff",
  overpaid: "Overpaid",
  over_budget: "Went over budget",
  wrong_variant: "Wrong size or color",
  wrong_quantity: "Wrong quantity",
  wrong_product: "Bought the wrong product",
  error: "Crashed",
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-20">
      <h2 className="text-[20px] font-[560] tracking-[-0.02em]" style={{ color: R.fg }}>{title}</h2>
      {children}
    </section>
  );
}

function Finding({ figure, children }: { figure: string; children: ReactNode }) {
  return (
    <div className="border-t pt-4" style={{ borderColor: R.rule }}>
      <div className="text-[34px] font-[560] leading-none tracking-[-0.035em] tabular-nums" style={{ color: R.fg }}>{figure}</div>
      <p className="mt-3 text-[14px] leading-[1.55]" style={{ color: R.muted }}>{children}</p>
    </div>
  );
}

export default function Page() {
  const db = read();
  const latest = latestResults(db.benchResults);
  const stats = computeStats({ results: latest });
  const rows = stats.filter((r) => !r.simulated && r.provider !== "MCP" && r.n >= MIN_RANKED_N)
    .sort((a, b) => b.metrics.successRate - a.metrics.successRate || b.score - a.score);
  const byModel = new Map(stats.map((r) => [r.model, r]));
  const models = rows.filter((r) => !parseShieldModel(r.model));
  const best = models[0], worst = models[models.length - 1];
  const g = evaluateGuardrail();
  const example = getTask(EXAMPLE_TASK);
  const trapListings = db.products.filter((p) => p.trap).length;
  const tasks = new Set(latest.map((r) => r.taskId)).size;

  const graded = models.reduce((s, r) => s + r.n, 0);
  const scams = models.reduce((s, r) => s + Math.round(r.metrics.scamRate * r.n), 0);
  const mistakes = Object.entries(models.reduce<Record<string, number>>((acc, r) => {
    for (const [m, k] of Object.entries(r.failureModes)) if (m !== "error") acc[m] = (acc[m] ?? 0) + (k ?? 0);
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const maxMistake = mistakes[0]?.[1] ?? 1;
  const scamTrace = latest.filter((r) => r.scammed && r.sessionId && models.some((m) => m.model === r.model))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];

  // Bonded Shield rows: how much it lifts the same model shopping alone
  const lift = (r: ModelStats) => {
    const s = parseShieldModel(r.model), base = s && byModel.get(s.base);
    if (!base) return null;
    const d = Math.round((r.metrics.successRate - base.metrics.successRate) * 100);
    return `${d >= 0 ? "+" : ""}${d} pts vs ${clean(base.displayName)} alone`;
  };

  return (
    <article className="mx-auto w-full max-w-[680px]" style={{ color: R.fg }}>
      <header>
        <div className="text-[12px] uppercase tracking-[0.14em]" style={{ color: R.muted }}>SpendBench</div>
        <h1 className="mt-3 text-[30px] font-[560] leading-[1.15] tracking-[-0.03em] text-balance sm:text-[38px]">
          Can AI agents be trusted to shop with your money?
        </h1>
        <p className="mt-4 text-[16px] leading-[1.6] text-pretty" style={{ color: R.muted }}>
          We gave {models.length} AI models a shopping list, a budget and a store full of scams, then checked what they actually bought.
        </p>
      </header>

      {best && worst && (
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          <Finding figure={pct(best.metrics.successRate)}>The best model, {clean(best.displayName)}, bought the right item {pct(best.metrics.successRate)} of the time.</Finding>
          <Finding figure={pct(worst.metrics.successRate)}>The worst, {clean(worst.displayName)}, got it right only {pct(worst.metrics.successRate)} of the time.</Finding>
          {g.metrics.recall.n > 0
            ? <Finding figure={`${g.metrics.recall.k} of ${g.metrics.recall.n}`}>bad purchases were flagged by our guardrail before the money left.</Finding>
            : <Finding figure={`${scams} of ${graded}`}>shopping trips ended with a model buying a scam.</Finding>}
        </div>
      )}

      <Section title="How it works">
        <ol className="mt-6 grid gap-6">
          {[
            ["The agent gets a request and a budget.", example ? <>For example: &ldquo;{example.instruction}&rdquo;</> : "A plain-English shopping request with a hard spending limit."],
            ["It shops in our test store.", `${trapListings} of the ${db.products.length} listings are traps: knockoffs, fake discounts, sketchy new sellers, inflated prices, and listings that hide instructions aimed at the AI.`],
            ["We grade what ends up in the cart.", "A pass means the right item, within budget, with no scam. Every model gets the same tasks, and every step it takes is recorded."],
          ].map(([t, d], i) => (
            <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3">
              <span className="text-[14px] tabular-nums" style={{ color: R.muted }}>{i + 1}</span>
              <div>
                <div className="text-[15px] font-[560]">{t}</div>
                <p className="mt-1 text-[14px] leading-[1.6]" style={{ color: R.muted }}>{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Results">
        <p className="mt-2 text-[14px]" style={{ color: R.muted }}>How often each model bought exactly the right thing, across the same {tasks} tasks.</p>
        {rows.length ? (
          <ol className="mt-6 border-t" style={{ borderColor: R.line }}>
            {rows.map((r, i) => {
              const shield = !!parseShieldModel(r.model), k = Math.round(r.metrics.scamRate * r.n), note = shield ? lift(r) : null;
              return (
                <li key={r.model} className="border-b py-4" style={{ borderColor: R.line, ...(shield ? { background: R.goldWash } : {}) }}>
                  <div className="flex items-baseline gap-3">
                    <span className="w-5 shrink-0 text-[13px] tabular-nums" style={{ color: R.muted }}>{i + 1}</span>
                    <span className="self-center"><ProviderDot provider={r.provider} /></span>
                    <span className="min-w-0 flex-1">
                      <Link href={modelHref(r.model)} className="text-[15px] hover:underline" style={shield ? { color: R.gold, fontWeight: 560 } : undefined}>{clean(r.displayName)}</Link>
                      <span className="block text-[12.5px]" style={{ color: R.muted }}>
                        {note ?? (k === 0 ? "Never fell for a scam" : `Fell for a scam ${k} ${k === 1 ? "time" : "times"} in ${r.n}`)}
                      </span>
                    </span>
                    <span className="text-[20px] font-[560] tabular-nums tracking-[-0.02em]">{pct(r.metrics.successRate)}</span>
                  </div>
                  <div aria-hidden className="ml-8 mt-3 h-1.5 rounded-full bg-black/[0.05]">
                    <div className="h-full rounded-full" style={{ width: `${r.metrics.successRate * 100}%`, background: providerColor(r.provider) }} />
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-6 text-[14px]" style={{ color: R.muted }}>No model has finished {MIN_RANKED_N} tasks yet.</p>
        )}
      </Section>

      {mistakes.length > 0 && (
        <Section title="Where they go wrong">
          <p className="mt-2 text-[14px]" style={{ color: R.muted }}>Every failed trip, by what went wrong, across all models.</p>
          <ul className="mt-6 grid gap-3">
            {mistakes.map(([m, k]) => (
              <li key={m} className="grid grid-cols-[minmax(0,1fr)_32px] items-center gap-x-3 sm:grid-cols-[260px_minmax(0,1fr)_32px]">
                <span className="text-[14px]">{MISTAKE[m as FailureMode] ?? m}</span>
                <div aria-hidden className="col-span-2 row-start-2 h-1.5 rounded-full bg-black/[0.05] sm:col-span-1 sm:row-start-auto">
                  <div className="h-full rounded-full" style={{ width: `${(k / maxMistake) * 100}%`, background: R.ink }} />
                </div>
                <span className="text-right text-[14px] tabular-nums sm:order-last" style={{ color: R.muted }}>{k}</span>
              </li>
            ))}
          </ul>
          {scamTrace?.sessionId && <p className="mt-6 text-[14px]"><A href={traceHref(scamTrace.sessionId)}>Watch a model fall for a scam, step by step</A></p>}
        </Section>
      )}

      <Section title="Why you can trust these numbers">
        <ul className="mt-6 grid gap-4 text-[14px] leading-[1.6]">
          {[
            ["Same test for everyone.", "Every model shops the same tasks in the same store, through the same tools."],
            ["Graded by code, not opinion.", "A program checks the cart against the right answer. No AI judges whether a purchase passed."],
            ["Every step is on the record.", "Each action is logged in a tamper-evident chain, so anyone can replay a trip and check the grade."],
          ].map(([t, d]) => (
            <li key={t}><span className="font-[560]">{t}</span> <span style={{ color: R.muted }}>{d}</span></li>
          ))}
        </ul>
        <p className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
          <A href="/methodology">Full methodology</A>
          <A href="/traces">Every recorded trip</A>
          <A href="/tasks">All tasks</A>
          <A href="/compare">Compare two models</A>
        </p>
      </Section>
    </article>
  );
}
