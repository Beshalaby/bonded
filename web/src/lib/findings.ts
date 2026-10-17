// Key findings: auto-generated, numeric, evidence-linked sentences computed from the live DB.
// Server-only (reads the store). Consumed by app/page.tsx and app/present/page.tsx, which pass them to client views.
//
// Every finding is a specific claim with its denominator, a tiny visual spec the UI renders, and a link to the
// evidence (a trace, a model page or the red-team gallery). Findings that the data can't support are omitted.
import { read } from "./db";
import { displayName } from "./bench";
import { betaInterval, computeStats, latestResults } from "./stats";
import { listTasks } from "./tasks";
import type { BenchResult, Interval, ModelStats, TrapType } from "./types";

export type Tone = "bad" | "warn" | "good" | "neutral";
/** Headline = text with emphasized spans: plain strings, or {n} for an emphasized figure. */
export type Seg = string | { n: string; tone?: Tone };

export type FindingVisual =
  | { kind: "dots"; items: { label: string; hit: boolean; detail: string }[] }
  | { kind: "bars"; rows: { label: string; value: number; highlight?: boolean }[]; format: "pct" }
  | { kind: "split"; a: { label: string; value: number }; b: { label: string; value: number }; format: "usd" }
  | { kind: "step"; points: number[]; base: number }
  | { kind: "interval"; interval: Interval; label: string };

export interface Finding {
  id: string;
  kicker: string;          // short category label
  headline: Seg[];
  detail: string;          // one sentence with the denominator / CI
  tone: Tone;
  visual: FindingVisual;
  href: string;
  hrefLabel: string;
}

export interface HeroStats {
  episodes: number;         // every graded result ever stored
  spendUsd: number;         // $ of agent checkouts audited (all graded results that bought)
  traceEntries: number;     // hash-chained trace entries
  models: number;
  tasks: number;            // tasks in the benchmark (base + red-team variants)
  baseTasks: number;
  scams: number;
  runs: number;
  updatedAt: string | null;
  last: { model: string; taskId: string; success: boolean; mode?: string; amount?: number; sessionId?: string; createdAt: string } | null;
}

const TRAP_NAME: Record<TrapType, { one: string; many: string }> = {
  prompt_injection: { one: "hidden prompt injection", many: "Hidden prompt injections" },
  knockoff: { one: "knockoff", many: "Knockoff listings" },
  fake_discount: { one: "fake discount", many: "Fake discounts" },
  new_merchant: { one: "brand-new merchant", many: "Brand-new merchants" },
  price_gouge: { one: "price-gouged listing", many: "Price-gouged listings" },
};
const TRAPS = Object.keys(TRAP_NAME) as TrapType[];

const short = (m: string) => displayName(m).replace(/\s*\(sim\)\s*$/i, "");
const pct = (x: number) => `${Math.round(x * 100)}%`;
const usd0 = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const enc = encodeURIComponent;
const NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const word = (n: number) => (n >= 0 && n <= 10 ? NUM[n] : String(n));
const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "1 in 11": readable odds for a rate. */
function oneIn(rate: number) {
  if (rate <= 0) return null;
  const k = Math.round(1 / rate);
  return k >= 2 ? `1 in ${k}` : pct(rate);
}

function traceLink(r: BenchResult | undefined, fallback: string) {
  if (!r?.sessionId) return fallback;
  const seq = r.attribution?.evidenceSeqs?.[0];
  return `/traces/${enc(r.sessionId)}${seq != null ? `#seq-${seq}` : ""}`;
}

export function heroStats(): HeroStats {
  const db = read();
  const all = db.benchResults;
  const latest = latestResults(all);
  const tasks = listTasks();
  return {
    episodes: all.length,
    spendUsd: Math.round(all.reduce((s, r) => s + (r.bought !== false && r.amount ? r.amount : 0), 0) * 100) / 100,
    traceEntries: db.log.length,
    models: new Set(latest.map((r) => r.model)).size,
    tasks: tasks.length,
    baseTasks: tasks.filter((t) => !t.adversarial).length,
    scams: (db.scams ?? []).length,
    runs: db.runs.length,
    updatedAt: all.reduce((m, r) => (r.createdAt > m ? r.createdAt : m), "") || null,
    last: (() => {
      const r = all.reduce<BenchResult | null>((m, x) => (!m || x.createdAt > m.createdAt ? x : m), null);
      return r ? { model: r.model, taskId: r.taskId, success: r.success, mode: r.attribution?.mode, amount: r.amount, sessionId: r.sessionId, createdAt: r.createdAt } : null;
    })(),
  };
}

/** Benchmark size over time (base tasks, +1 per kept scam), as plain counts for sparklines. */
export function growthPoints(): { base: number; points: number[] } {
  const base = listTasks().filter((t) => !t.adversarial).length;
  const scams = (read().scams ?? []).filter((s) => Number.isFinite(Date.parse(s.createdAt)))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const points = [base];
  let n = base;
  for (const s of scams) if (s.variantTaskId || s.fooled.length) points.push(++n);
  return { base, points };
}

export function computeFindings(): Finding[] {
  const db = read();
  const latest = latestResults(db.benchResults);
  if (!latest.length) return [];
  const rows: ModelStats[] = computeStats({ results: latest });
  const out: Finding[] = [];
  const top = rows[0];

  // 1. Prompt injection: how many agents does it fool at all?
  {
    const exposed = rows.filter((r) => r.byTrap.prompt_injection?.exposed);
    const fooled = exposed.filter((r) => (r.byTrap.prompt_injection?.fooled ?? 0) > 0);
    if (exposed.length) {
      const worst = [...exposed].sort((a, b) =>
        (b.byTrap.prompt_injection!.fooled / b.byTrap.prompt_injection!.exposed) - (a.byTrap.prompt_injection!.fooled / a.byTrap.prompt_injection!.exposed))[0];
      const w = worst.byTrap.prompt_injection!;
      const ev = latest.find((r) => r.model === worst.model && r.trapTypes?.includes("prompt_injection"));
      out.push({
        id: "injection",
        kicker: "Prompt injection",
        headline: fooled.length
          ? ["Hidden prompt injections fooled ", { n: `${fooled.length} of ${exposed.length}`, tone: "bad" }, " agents"]
          : ["No agent obeyed a hidden prompt injection ", { n: `(0 of ${exposed.length})`, tone: "good" }],
        detail: fooled.length
          ? `${short(worst.model)} followed instructions hidden in a listing in ${w.fooled} of ${w.exposed} exposed tasks (90% CI ${pct(w.rate.lower)}–${pct(w.rate.upper)}).`
          : `Across ${exposed.reduce((s, r) => s + r.byTrap.prompt_injection!.exposed, 0)} exposed tasks.`,
        tone: fooled.length ? "bad" : "good",
        visual: {
          kind: "dots",
          items: exposed.map((r) => {
            const b = r.byTrap.prompt_injection!;
            return { label: short(r.model), hit: b.fooled > 0, detail: `${b.fooled}/${b.exposed} obeyed` };
          }),
        },
        href: fooled.length ? traceLink(ev, `/models/${enc(worst.model)}`) : "/tasks",
        hrefLabel: fooled.length && ev ? "See the trace" : "See the tasks",
      });
    }
  }

  // 2. Budget discipline: the worst over-spender
  {
    const worst = [...rows].sort((a, b) => b.metrics.budgetViolationRate - a.metrics.budgetViolationRate)[0];
    const rate = worst?.metrics.budgetViolationRate ?? 0;
    if (worst && rate > 0) {
      const k = Math.round(rate * worst.n);
      const ci = betaInterval(k, worst.n);
      const ev = latest.filter((r) => r.model === worst.model && r.overBudget).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0];
      const task = ev ? listTasks().find((t) => t.id === ev.taskId) : undefined;
      const over = ev?.amount != null && task ? ev.amount - task.budget : null;
      out.push({
        id: "budget",
        kicker: "Budget discipline",
        headline: [`${short(worst.model)} overspent its budget in `, { n: pct(rate), tone: "bad" }, " of tasks"],
        detail: `${k} of ${worst.n} tasks (90% CI ${pct(ci.lower)}–${pct(ci.upper)})${over != null && over > 0 ? `; worst case ${usd0(over)} over a ${usd0(task!.budget)} budget` : ""}.`,
        tone: "bad",
        visual: {
          kind: "bars", format: "pct",
          rows: [...rows].sort((a, b) => b.metrics.budgetViolationRate - a.metrics.budgetViolationRate)
            .map((r) => ({ label: short(r.model), value: r.metrics.budgetViolationRate, highlight: r.model === worst.model })),
        },
        href: traceLink(ev, `/models/${enc(worst.model)}`),
        hrefLabel: ev ? "See the worst overspend" : "See the model",
      });
    }
  }

  // 3. Red team: new scams and whether they beat the leader
  {
    const scams = db.scams ?? [];
    if (scams.length && top) {
      const beatTop = scams.filter((s) => s.fooled.includes(top.model)).length;
      const g = growthPoints();
      out.push({
        id: "redteam",
        kicker: "Red team",
        headline: beatTop
          ? ["The red team found ", { n: `${scams.length} new scam${scams.length === 1 ? "" : "s"}` }, "; ", { n: String(beatTop), tone: "bad" }, " fooled the top-ranked agent"]
          : ["The red team found ", { n: `${scams.length} new scam${scams.length === 1 ? "" : "s"}` }, " that fool agents; the leader resisted all of them"],
        detail: `Each scam that fooled a model became a benchmark task: ${g.base} → ${g.points[g.points.length - 1]} tasks. ${sentenceCase(word(new Set(scams.flatMap((s) => s.fooled)).size))} of ${rows.length} models were fooled at least once.`,
        tone: beatTop ? "bad" : "warn",
        visual: { kind: "step", points: g.points, base: g.base },
        href: "/redteam",
        hrefLabel: "See the scams",
      });
    }
  }

  // 4. Guardrail: dollars it would have stopped
  {
    const failedBuys = latest.filter((r) => !r.success && r.bought !== false && (r.amount ?? 0) > 0 && r.guardrailDecision);
    const caught = failedBuys.filter((r) => r.guardrailDecision === "block" || r.guardrailDecision === "ask");
    const blocked = failedBuys.filter((r) => r.guardrailDecision === "block");
    const sum = (l: BenchResult[]) => l.reduce((s, r) => s + (r.amount ?? 0), 0);
    if (failedBuys.length) {
      const stopped = sum(caught), missed = sum(failedBuys) - stopped;
      const ev = [...blocked, ...caught].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0];
      out.push({
        id: "guardrail",
        kicker: "Guardrail",
        headline: ["The guardrail would have stopped ", { n: usd0(stopped), tone: "good" }, " of bad spend"],
        detail: `It flagged ${caught.length} of ${failedBuys.length} failed checkouts (${pct(caught.length / failedBuys.length)} catch rate, ${blocked.length} hard blocks); ${usd0(missed)} slipped through.`,
        tone: "good",
        visual: { kind: "split", format: "usd", a: { label: "Stopped", value: stopped }, b: { label: "Slipped through", value: missed } },
        href: traceLink(ev, "/runs"),
        hrefLabel: ev ? "See a caught checkout" : "See the runs",
      });
    }
  }

  // 5. Most effective trap across all agents
  {
    const agg = TRAPS.map((t) => {
      let e = 0, f = 0;
      for (const r of rows) { const b = r.byTrap[t]; if (b) { e += b.exposed; f += b.fooled; } }
      return { t, e, f, rate: e ? f / e : 0 };
    }).filter((x) => x.e > 0).sort((a, b) => b.rate - a.rate);
    if (agg.length && agg[0].f > 0) {
      const best = agg[0];
      const ci = betaInterval(best.f, best.e);
      const ev = latest.filter((r) => r.trapTypes?.includes(best.t))[0];
      out.push({
        id: "trap",
        kicker: "Most effective trap",
        headline: [`${TRAP_NAME[best.t].many} fooled agents in `, { n: pct(best.rate), tone: "bad" }, " of exposures"],
        detail: `${best.f} of ${best.e} model × task pairs (90% CI ${pct(ci.lower)}–${pct(ci.upper)}), the highest of ${agg.length} trap types.`,
        tone: "bad",
        visual: { kind: "bars", format: "pct", rows: agg.map((x) => ({ label: TRAP_NAME[x.t].one, value: x.rate, highlight: x.t === best.t })) },
        href: traceLink(ev, "/tasks"),
        hrefLabel: ev ? "See an example" : "See the tasks",
      });
    }
  }

  // 6. Even the leader fails
  if (top) {
    const fail = 1 - top.metrics.successRate;
    const odds = oneIn(fail);
    const ev = latest.filter((r) => r.model === top.model && !r.success)[0];
    out.push({
      id: "leader",
      kicker: "Reliability",
      headline: odds
        ? ["Even the top agent, ", short(top.model), ", fails ", { n: odds, tone: "warn" }, " tasks"]
        : ["The top agent, ", short(top.model), ", passed ", { n: "every task", tone: "good" }],
      detail: `Posterior P(success) ${pct(top.reliability.mean)}, 90% credible interval ${pct(top.reliability.lower)}–${pct(top.reliability.upper)} over n = ${top.n}.`,
      tone: odds ? "warn" : "good",
      visual: { kind: "interval", interval: top.reliability, label: "P(success)" },
      href: ev ? traceLink(ev, `/models/${enc(top.model)}`) : `/models/${enc(top.model)}`,
      hrefLabel: ev ? "See a failure" : "See the model",
    });
  }

  return out;
}
