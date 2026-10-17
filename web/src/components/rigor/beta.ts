// Pure, dependency-free Beta-distribution math shared by server (lib/compare.ts, lib/guardrail-eval.ts) and the
// browser (posterior plots, methodology widgets). No Node imports, so it is safe in client bundles.

/** log Γ(x), Lanczos approximation (g=7, n=9); ~1e-15 relative error for x > 0. */
export function lgamma(x: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** log B(a, b). */
export const lbeta = (a: number, b: number) => lgamma(a) + lgamma(b) - lgamma(a + b);

/** Beta(a, b) density at x. */
export function betaPdf(x: number, a: number, b: number): number {
  if (x < 0 || x > 1) return 0;
  if (x === 0) return a < 1 ? Infinity : a === 1 ? b : 0;
  if (x === 1) return b < 1 ? Infinity : b === 1 ? a : 0;
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - lbeta(a, b));
}

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

/** Regularized incomplete beta I_x(a, b) = Beta CDF. */
export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(-lbeta(a, b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

export function betaQuantile(p: number, a: number, b: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (betaCdf(mid, a, b) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 90% equal-tailed credible interval of Beta(1+k, 1+n−k) (uniform prior). */
export function posterior(k: number, n: number) {
  const a = 1 + k, b = 1 + Math.max(0, n - k);
  return { a, b, mean: a / (a + b), lower: betaQuantile(0.05, a, b), upper: betaQuantile(0.95, a, b) };
}

/**
 * Exact P(X > Y) for X ~ Beta(a1, b1), Y ~ Beta(a2, b2) when a1 is a positive integer
 * (always true here: a = 1 + successes). Closed form (Evan Miller, 2015):
 *   P(X > Y) = Σ_{i=0}^{a1−1} B(a2+i, b1+b2) / ((b1+i) · B(1+i, b1) · B(a2, b2))
 * evaluated in log space. Falls back to quadrature for non-integer a1.
 */
export function probGreater(a1: number, b1: number, a2: number, b2: number): number {
  if (Number.isInteger(a1) && a1 >= 1 && a1 <= 20000) {
    let total = 0;
    const base = lbeta(a2, b2);
    for (let i = 0; i < a1; i++) {
      total += Math.exp(lbeta(a2 + i, b1 + b2) - Math.log(b1 + i) - lbeta(1 + i, b1) - base);
    }
    return Math.min(1, Math.max(0, total));
  }
  return probGreaterQuadrature(a1, b1, a2, b2);
}

/** ∫ f_X(x) · F_Y(x) dx by composite Simpson on [0,1] (independent cross-check of the closed form). */
export function probGreaterQuadrature(a1: number, b1: number, a2: number, b2: number, n = 2000): number {
  const h = 1 / n;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const x = i * h;
    const f = Number.isFinite(betaPdf(x, a1, b1)) ? betaPdf(x, a1, b1) : 0;
    const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
    s += w * f * betaCdf(x, a2, b2);
  }
  return Math.min(1, Math.max(0, (s * h) / 3));
}

// ------------------------------------------------------------------ seeded Monte Carlo
/** mulberry32: tiny, fast, seeded 32-bit PRNG → [0, 1). */
export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng: () => number) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Gamma(shape, 1) by Marsaglia–Tsang (with the shape<1 boost). */
export function sampleGamma(shape: number, rng: () => number): number {
  if (shape < 1) return sampleGamma(shape + 1, rng) * Math.pow(rng() || 1e-300, 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function sampleBeta(a: number, b: number, rng: () => number): number {
  const x = sampleGamma(a, rng), y = sampleGamma(b, rng);
  return x / (x + y);
}

export const MC_SAMPLES = 20000;
export const MC_SEED = 20251017;

/** Monte Carlo estimate of P(X > Y) with a fixed seed (reproducible). */
export function probGreaterMC(a1: number, b1: number, a2: number, b2: number, samples = MC_SAMPLES, seed = MC_SEED): number {
  const rng = mulberry32(seed);
  let wins = 0;
  for (let i = 0; i < samples; i++) if (sampleBeta(a1, b1, rng) > sampleBeta(a2, b2, rng)) wins++;
  return wins / samples;
}

// ------------------------------------------------------------------ McNemar
/** log C(n, k). */
const lchoose = (n: number, k: number) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);

/**
 * Exact two-sided McNemar test on the discordant pairs: under H0 each discordant task is equally likely to favour
 * either model, so min(b,c) ~ Binomial(b+c, ½). p = min(1, 2·P[X ≤ min(b,c)]).
 */
export function mcnemarExact(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  const k = Math.min(b, c);
  let p = 0;
  for (let i = 0; i <= k; i++) p += Math.exp(lchoose(n, i) - n * Math.LN2);
  return Math.min(1, 2 * p);
}

/** Chi-square McNemar with continuity correction (reported alongside the exact test). */
export function mcnemarChi2(b: number, c: number): { chi2: number; p: number } {
  const n = b + c;
  if (n === 0) return { chi2: 0, p: 1 };
  const chi2 = Math.pow(Math.abs(b - c) - 1, 2) / n;
  // P(χ²₁ > x) = erfc(√(x/2))
  return { chi2, p: erfc(Math.sqrt(chi2 / 2)) };
}

function erfc(x: number): number {
  // Numerical Recipes erfcc (fractional error < 1.2e-7)
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
