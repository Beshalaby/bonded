// Head-to-head model comparison from Beta posteriors and paired tasks.
//
// * Each model's success rate p has posterior Beta(1+s, 1+f) (latest result per model×task, same as the leaderboard).
// * P(p_A > p_B) is computed EXACTLY by the closed-form sum (components/rigor/beta.ts `probGreater`) and cross-checked by
//   a seeded 20,000-draw Monte Carlo estimate. "Distinguishable" = P > 0.95 in either direction.
//   Posteriors are treated as independent (each model's own tasks); the paired McNemar test below uses the task pairing.
// * Paired tasks: tasks graded for both models. Discordant pairs b (A pass, B fail), c (A fail, B pass);
//   exact McNemar p = min(1, 2·P[Bin(b+c, ½) ≤ min(b,c)]).
import { read } from "./db";
import { displayName, providerOf } from "./bench";
import { latestResults } from "./stats";
import { MC_SAMPLES, MC_SEED, betaQuantile, mcnemarChi2, mcnemarExact, mulberry32, probGreater, probGreaterMC, sampleBeta } from "@/components/rigor/beta";
import { outcomeKey, type PairwiseCell, type PairwiseMatrixData, type PairwiseModel } from "@/components/rigor/types";
import type { BenchResult } from "./types";

export type { PairwiseCell, PairwiseMatrixData, PairwiseModel } from "@/components/rigor/types";

export const DISTINGUISHABLE = 0.95;

export interface Disagreement {
  taskId: string;
  winner: "a" | "b";
  a: { success: boolean; outcome: string; sessionId?: string; amount?: number };
  b: { success: boolean; outcome: string; sessionId?: string; amount?: number };
}

export interface PairDetail {
  a: PairwiseModel; b: PairwiseModel;
  pAGreater: number; pAGreaterMC: number;
  paired: { n: number; bothPass: number; bothFail: number; aOnly: number; bOnly: number };
  mcnemar: { exactP: number; chi2: number; chi2P: number };
  diff: { mean: number; lower: number; upper: number };   // posterior of p_A − p_B (MC, 90%)
  disagreements: Disagreement[];
}

function byModel(rs: BenchResult[]) {
  const m = new Map<string, BenchResult[]>();
  for (const r of rs) m.set(r.model, [...(m.get(r.model) ?? []), r]);
  return m;
}

function modelSummary(model: string, rs: BenchResult[]): PairwiseModel {
  const s = rs.filter((r) => r.success).length, n = rs.length;
  const a = 1 + s, b = 1 + n - s;
  return {
    model, displayName: displayName(model), provider: providerOf(model), simulated: model.startsWith("sim/"),
    s, n, a, b, mean: a / (a + b), lower: betaQuantile(0.05, a, b), upper: betaQuantile(0.95, a, b),
  };
}

export function pairwiseMatrix(opts: { runId?: string | null; results?: BenchResult[] } = {}): PairwiseMatrixData {
  const rs = latestResults(opts.results ?? read().benchResults, opts.runId);
  const models = [...byModel(rs)].map(([m, list]) => modelSummary(m, list)).sort((x, y) => y.mean - x.mean || y.n - x.n);
  let maxErr = 0;
  const cells = models.map((A, i) => models.map((B, j) => {
    if (i === j) return null;
    const p = probGreater(A.a, A.b, B.a, B.b);
    const mc = probGreaterMC(A.a, A.b, B.a, B.b);
    maxErr = Math.max(maxErr, Math.abs(p - mc));
    return { p, mc, distinguishable: p > DISTINGUISHABLE } satisfies PairwiseCell;
  }));
  return {
    models,
    cells: cells as PairwiseCell[][],
    method: { exact: "closed-form", mcSamples: MC_SAMPLES, seed: MC_SEED, maxAbsMcError: Math.round(maxErr * 1e5) / 1e5 },
    threshold: DISTINGUISHABLE,
  };
}

/** Posterior of the difference p_A − p_B by seeded Monte Carlo. */
function diffInterval(A: PairwiseModel, B: PairwiseModel) {
  const rng = mulberry32(MC_SEED + 1);
  const xs = new Array<number>(MC_SAMPLES);
  for (let i = 0; i < MC_SAMPLES; i++) xs[i] = sampleBeta(A.a, A.b, rng) - sampleBeta(B.a, B.b, rng);
  xs.sort((p, q) => p - q);
  const q = (p: number) => xs[Math.floor(p * (MC_SAMPLES - 1))];
  return { mean: A.mean - B.mean, lower: q(0.05), upper: q(0.95) };
}

export function comparePair(a: string, b: string, opts: { runId?: string | null } = {}): PairDetail | null {
  const rs = latestResults(read().benchResults, opts.runId);
  const g = byModel(rs);
  const ra = g.get(a), rb = g.get(b);
  if (!ra || !rb) return null;
  const A = modelSummary(a, ra), B = modelSummary(b, rb);
  const mapB = new Map(rb.map((r) => [r.taskId, r]));
  let bothPass = 0, bothFail = 0, aOnly = 0, bOnly = 0;
  const disagreements: Disagreement[] = [];
  for (const x of ra) {
    const y = mapB.get(x.taskId);
    if (!y) continue;
    if (x.success && y.success) bothPass++;
    else if (!x.success && !y.success) bothFail++;
    else {
      if (x.success) aOnly++; else bOnly++;
      disagreements.push({
        taskId: x.taskId, winner: x.success ? "a" : "b",
        a: { success: x.success, outcome: outcomeKey(x), sessionId: x.sessionId, amount: x.bought === false ? undefined : x.amount },
        b: { success: y.success, outcome: outcomeKey(y), sessionId: y.sessionId, amount: y.bought === false ? undefined : y.amount },
      });
    }
  }
  disagreements.sort((p, q) => (p.winner === q.winner ? p.taskId.localeCompare(q.taskId) : p.winner === "a" ? -1 : 1));
  const chi = mcnemarChi2(aOnly, bOnly);
  return {
    a: A, b: B,
    pAGreater: probGreater(A.a, A.b, B.a, B.b),
    pAGreaterMC: probGreaterMC(A.a, A.b, B.a, B.b),
    paired: { n: bothPass + bothFail + aOnly + bOnly, bothPass, bothFail, aOnly, bOnly },
    mcnemar: { exactP: mcnemarExact(aOnly, bOnly), chi2: chi.chi2, chi2P: chi.p },
    diff: diffInterval(A, B),
    disagreements,
  };
}
