// OWNER: Team 3 (Risk + Guardian).
// Hierarchical Bayesian risk engine (Beta-Binomial).
//
//   population hyper-prior  ──►  model prior (SpendBench)  ──►  agent posterior (live transactions)
//
// * Model prior   Beta(a_m, b_m) = db.modelPriors[model] (written by SpendBench ingestion, or derived here from
//                 db.benchResults when absent), shrunk to a total pseudo-count of at most PRIOR_CAP so live
//                 evidence can move it.
// * Population    For models with no bench data: empirical-Bayes method-of-moments fit over the model priors'
//                 means (m, v): kappa = m(1-m)/v - 1, clamped to [2, POP_CAP]; fallback Beta(2,1) when < 1 prior.
// * Agent         alpha = a + successes, beta = b + FAIL_WEIGHT * failures (a paid claim counts 3x).
//                 Successes = completed tx not later claimed (txCount - failCount).
// * trustScore = posterior mean; [lower, upper] = 90% equal-tailed credible interval (5% / 95% quantiles).
// * spendLimit = $25 * e^(4*lower) * (1 + 0.25*ln(1+txCount)), rounded, clamped [$25, $5000]  (credit line).
//   Confidence dominates volume, so a high-volume sloppy agent can't out-limit a careful one.
// * premiumRate = 0.5% + (1-trust) * 0.6 * (1 + (upper-lower)), clamped [0.5%, 40%]          (expected loss).
import type { RiskProfile, RiskQuote, DB } from "./types";
import { mutate, read } from "./db";
import { publish } from "./events";

export const PRIOR_CAP = 20;          // max pseudo-count of a model prior
export const POP_CAP = 8;             // max pseudo-count of the population prior (weaker than a model's own data)
export const FAIL_WEIGHT = 3;         // a failure (paid claim) counts as 3 observations
export const LOSS_SEVERITY = 0.6;     // expected fraction of the amount lost on a bad transaction
export const BASE_LIMIT = 50;
export const FALLBACK_PRIOR = { alpha: 2, beta: 1 };

// ------------------------------------------------------------------ Beta distribution math (no deps)
function lgamma(x: number): number {
  // Lanczos approximation (g=7, n=9)
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the incomplete beta (modified Lentz; Numerical Recipes betacf). */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a,b) = Beta CDF. */
export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Beta inverse CDF by bisection on betaCdf (monotone, robust; 80 iterations → ~1e-24 width). */
export function betaQuantile(p: number, a: number, b: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (betaCdf(mid, a, b) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ------------------------------------------------------------------ priors
type Prior = { alpha: number; beta: number; source: string };

function capStrength(p: { alpha: number; beta: number }, cap: number) {
  const n = p.alpha + p.beta;
  if (n <= cap) return { alpha: p.alpha, beta: p.beta };
  return { alpha: (p.alpha / n) * cap, beta: (p.beta / n) * cap };
}

/** Empirical-Bayes population prior: method-of-moments Beta fit over model-prior means. */
export function populationPrior(db: DB = read()): Prior {
  const means = Object.values(db.modelPriors || {})
    .filter((p) => p && p.alpha > 0 && p.beta > 0)
    .map((p) => p.alpha / (p.alpha + p.beta));
  if (!means.length) return { ...FALLBACK_PRIOR, source: "fallback Beta(2,1)" };
  const m = Math.min(0.99, Math.max(0.01, means.reduce((s, x) => s + x, 0) / means.length));
  const v = means.length > 1 ? means.reduce((s, x) => s + (x - m) ** 2, 0) / (means.length - 1) : 0;
  const kappa = v > 1e-9 ? Math.min(POP_CAP, Math.max(2, (m * (1 - m)) / v - 1)) : 4;
  return { alpha: m * kappa, beta: (1 - m) * kappa, source: `population (EB over ${means.length} model${means.length === 1 ? "" : "s"})` };
}

/** The prior an agent on `model` starts from (strength-capped). */
export function modelPrior(model: string, db: DB = read()): Prior {
  const p = db.modelPriors?.[model];
  if (p && p.alpha > 0 && p.beta > 0) {
    const c = capStrength(p, PRIOR_CAP);
    return { ...c, source: `SpendBench prior for ${model}${p.alpha + p.beta > PRIOR_CAP ? ` (capped to n=${PRIOR_CAP})` : ""}` };
  }
  return populationPrior(db);
}

// ------------------------------------------------------------------ derived quantities
const LIMIT_SCALE = 25, CONF_K = 4, PROOF_K = 0.25;
export function spendLimitFor(lower: number, txCount: number): number {
  const raw = LIMIT_SCALE * Math.exp(CONF_K * lower) * (1 + PROOF_K * Math.log(1 + txCount));
  const step = raw < 200 ? 5 : raw < 1000 ? 10 : 50;
  return Math.min(5000, Math.max(25, Math.round(raw / step) * step));
}
export function premiumRateFor(trust: number, lower: number, upper: number): number {
  const r = 0.005 + (1 - trust) * LOSS_SEVERITY * (1 + (upper - lower));
  return +Math.min(0.4, Math.max(0.005, r)).toFixed(4);
}

function derive(p: RiskProfile, db: DB) {
  const prior = modelPrior(p.model, db);
  const successes = Math.max(0, p.txCount - p.failCount);
  p.alpha = +(prior.alpha + successes).toFixed(4);
  p.beta = +(prior.beta + FAIL_WEIGHT * p.failCount).toFixed(4);
  p.trustScore = +(p.alpha / (p.alpha + p.beta)).toFixed(4);
  p.lower = +betaQuantile(0.05, p.alpha, p.beta).toFixed(4);
  p.upper = +betaQuantile(0.95, p.alpha, p.beta).toFixed(4);
  p.spendLimit = spendLimitFor(p.lower, p.txCount);
  p.premiumRate = premiumRateFor(p.trustScore, p.lower, p.upper);
  return prior;
}
const point = (p: RiskProfile, event: string) => ({ ts: new Date().toISOString(), trustScore: p.trustScore, lower: p.lower, upper: p.upper, event });

/** Human-readable explanation of how the spend limit and premium were set. */
export function explainLimit(profile: RiskProfile): string {
  const prior = modelPrior(profile.model);
  const s = Math.max(0, profile.txCount - profile.failCount);
  const proof = 1 + PROOF_K * Math.log(1 + profile.txCount);
  return (
    `Prior: ${prior.source} = Beta(${prior.alpha.toFixed(1)}, ${prior.beta.toFixed(1)}). ` +
    `Evidence: ${s} good transaction${s === 1 ? "" : "s"}, ${profile.failCount} paid claim${profile.failCount === 1 ? "" : "s"} (×${FAIL_WEIGHT}). ` +
    `Posterior Beta(${profile.alpha.toFixed(1)}, ${profile.beta.toFixed(1)}): trust ${(profile.trustScore * 100).toFixed(1)}%, ` +
    `90% CI ${(profile.lower * 100).toFixed(1)}–${(profile.upper * 100).toFixed(1)}%. ` +
    `Limit = $${LIMIT_SCALE} × e^(${CONF_K}×${profile.lower.toFixed(2)}) [${Math.exp(CONF_K * profile.lower).toFixed(2)}× for confidence] × ` +
    `${proof.toFixed(2)} [track record of ${profile.txCount} tx] ≈ $${profile.spendLimit}. ` +
    `Premium ${(profile.premiumRate * 100).toFixed(2)}% = 0.5% + (1−trust)×${LOSS_SEVERITY}×(1+CI width).`
  );
}

// ------------------------------------------------------------------ public API (signatures fixed by contract)
export function getProfile(agentId: string, model: string): RiskProfile {
  const existing = read().risk.find((r) => r.agentId === agentId);
  if (existing) return structuredClone(existing);
  return mutate((db) => {
    const again = db.risk.find((r) => r.agentId === agentId);
    if (again) return structuredClone(again);
    const p: RiskProfile = { agentId, model, alpha: 1, beta: 1, trustScore: 0.5, lower: 0, upper: 1, spendLimit: BASE_LIMIT, premiumRate: 0.05, txCount: 0, failCount: 0, history: [] };
    const prior = derive(p, db);
    p.history.push(point(p, `created from ${prior.source}`));
    db.risk.push(p);
    return structuredClone(p);
  });
}

export function quote(agentId: string, model: string, amount: number): RiskQuote {
  const p = getProfile(agentId, model);
  const amt = Math.max(0, Number(amount) || 0);
  return {
    agentId, amount: +amt.toFixed(2), premium: +(amt * p.premiumRate).toFixed(2), premiumRate: p.premiumRate,
    spendLimit: p.spendLimit, withinLimit: amt <= p.spendLimit, trustScore: p.trustScore, lower: p.lower, upper: p.upper,
  };
}

/** Called after each completed transaction (good=true) and by the Claims Adjuster on agent fault (good=false). */
export function recordOutcome(agentId: string, model: string, good: boolean, event: string): RiskProfile {
  getProfile(agentId, model);
  const updated = mutate((db) => {
    const p = db.risk.find((r) => r.agentId === agentId)!;
    if (good) p.txCount += 1;
    else {
      p.failCount += 1;
      // A claim normally reclassifies an already-counted transaction; if none was counted, count it now.
      if (p.failCount > p.txCount) p.txCount = p.failCount;
    }
    derive(p, db);
    p.history.push(point(p, event || (good ? "transaction ok" : "claim paid")));
    if (p.history.length > 500) p.history.splice(0, p.history.length - 500);
    return structuredClone(p);
  });
  publish("risk", updated);
  return updated;
}

/** Called by SpendBench ingestion to (re)set model-level priors; re-derives every agent posterior. */
export function recomputeModelPriors(): void {
  const changed = mutate((db) => {
    db.modelPriors ||= {};
    // Derive priors from raw bench results for models SpendBench didn't set explicitly.
    const byModel = new Map<string, { n: number; s: number }>();
    for (const r of db.benchResults || []) {
      const c = byModel.get(r.model) ?? { n: 0, s: 0 };
      c.n += 1;
      if (r.success && !r.scammed && !r.overBudget && !r.wrongItem) c.s += 1;
      byModel.set(r.model, c);
    }
    for (const [model, c] of byModel) {
      const cur = db.modelPriors[model];
      if (!cur || cur.source?.startsWith("risk:")) db.modelPriors[model] = { alpha: 1 + c.s, beta: 1 + (c.n - c.s), source: `risk:spendbench n=${c.n}` };
    }
    const out: RiskProfile[] = [];
    for (const p of db.risk) {
      const before = `${p.alpha}/${p.beta}`;
      derive(p, db);
      if (`${p.alpha}/${p.beta}` !== before) { p.history.push(point(p, "model prior updated (SpendBench)")); out.push(p); }
    }
    return out;
  });
  for (const p of changed) publish("risk", p);
}

/** Convenience for the API: all profiles + priors (with the effective, capped prior per model). */
export function riskSnapshot() {
  const db = read();
  const priors = Object.fromEntries(
    Object.entries(db.modelPriors || {}).map(([m, p]) => {
      const eff = modelPrior(m, db);
      return [m, { ...p, mean: +(p.alpha / (p.alpha + p.beta)).toFixed(4), effective: { alpha: +eff.alpha.toFixed(3), beta: +eff.beta.toFixed(3) } }];
    }),
  );
  return { profiles: db.risk, priors, population: populationPrior(db) };
}
