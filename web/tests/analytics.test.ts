// Sanity tests for the DB-backed analytics (findings, guardrail-as-classifier, pairwise compare) on a small
// synthetic DB with known counts.
import { MIN_RANKED_N } from "@/lib/stats";
import { beforeAll, describe, expect, it } from "vitest";
import { comparePair, pairwiseMatrix } from "@/lib/compare";
import { emptyDb, replace } from "@/lib/db";
import { computeFindings, heroStats } from "@/lib/findings";
import { evaluateGuardrail } from "@/lib/guardrail-eval";
import { leaderboard } from "@/lib/stats";
import type { BenchResult, GuardianDecision } from "@/lib/types";

const TASKS = Array.from({ length: 10 }, (_, i) => `t${i}`);

function mk(model: string, taskId: string, i: number, over: Partial<BenchResult>): BenchResult {
  return {
    runId: "run_syn", model, taskId, success: true, overBudget: false, wrongItem: false, scammed: false, trapTypes: [],
    costUsd: 0.001, latencyMs: 1000, steps: 5, sessionId: `s_${model}_${taskId}`, createdAt: `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`,
    amount: 100, bought: true, tags: ["injection-exposure"], guardrailDecision: "approve", ...over,
  };
}

beforeAll(() => {
  const db = emptyDb();
  // sim/careful: 10/10 success; the guardrail approves 8 and (falsely) asks on 2.
  const good = TASKS.map((t, i) => mk("sim/careful", t, i, { guardrailDecision: (i < 2 ? "ask" : "approve") as GuardianDecision }));
  // sim/gullible: 0/10, all obeyed an injection; the guardrail blocks 7 and misses 3.
  const bad = TASKS.map((t, i) => mk("sim/gullible", t, i + 10, {
    success: false, scammed: true, trapTypes: ["prompt_injection"], guardrailDecision: (i < 7 ? "block" : "approve") as GuardianDecision,
    attribution: { fault: "agent", mode: "obeyed_injection", explanation: "x", evidenceSeqs: [1], judge: "heuristic" },
  }));
  // one result that never reached checkout (guardrail did not run)
  const noBuy = mk("sim/hasty", "t0", 30, { success: false, bought: false, guardrailDecision: undefined, amount: 0 });
  db.benchResults = [...good, ...bad, noBuy];
  db.runs = [{ id: "run_syn", name: "syn", models: ["sim/careful", "sim/gullible", "sim/hasty"], taskIds: TASKS, guardrail: "observe", status: "completed", progress: { done: 21, total: 21 }, createdAt: "2026-01-01T00:00:00Z" }];
  replace(db);
});

describe("leaderboard on synthetic data", () => {
  it("ranks the careful model first with sensible totals", () => {
    const lb = leaderboard();
    expect(lb.rows[0].model).toBe("sim/careful");
    // established models (n >= MIN_RANKED_N) are score-ordered and come before provisional ones
    const established = lb.rows.filter((r) => r.n >= MIN_RANKED_N);
    for (let i = 1; i < established.length; i++) expect(established[i - 1].score).toBeGreaterThanOrEqual(established[i].score);
    const firstProvisional = lb.rows.findIndex((r) => r.n < MIN_RANKED_N);
    if (firstProvisional >= 0) expect(lb.rows.slice(firstProvisional).every((r) => r.n < MIN_RANKED_N)).toBe(true);
    expect(lb.totals).toMatchObject({ models: 3, tasks: 10, results: 21, runs: 1 });
    const gull = lb.rows.find((r) => r.model === "sim/gullible")!;
    expect(gull.byTrap.prompt_injection).toMatchObject({ exposed: 10, fooled: 10 });
    expect(gull.failureModes.obeyed_injection).toBe(10);
  });
});

describe("provisional ranking", () => {
  it("a 1-for-1 model cannot outrank models with real sample sizes", async () => {
    const { computeStats } = await import("@/lib/stats");
    const mk = (model: string, taskId: string, success: boolean) => ({ runId: "r", model, taskId, success, overBudget: false, wrongItem: !success,
      scammed: false, costUsd: 0, latencyMs: 0, steps: 3, bought: true, createdAt: "2026-01-01T00:00:00Z" });
    const results = [
      ...Array.from({ length: 12 }, (_, i) => mk("a/solid", `t${i}`, i !== 0)), // 11/12
      mk("b/lucky", "t0", true),                                                 // 1/1
    ];
    const rows = computeStats({ results: results as never });
    expect(rows.map((r) => r.model)).toEqual(["a/solid", "b/lucky"]);
    expect(rows[1].score).toBeGreaterThan(rows[0].score); // higher raw score, still ranked after
  });
});

describe("evaluateGuardrail", () => {
  it("builds the confusion matrix from checkouts only", () => {
    const ev = evaluateGuardrail();
    expect(ev.n).toBe(20);
    expect(ev.excluded.noCheckout).toBe(1);
    expect(ev.confusion).toMatchObject({ tp: 7, fp: 2, fn: 3, tn: 8, tpBlock: 7, tpAsk: 0, fpAsk: 2, fpBlock: 0 });
    expect(ev.metrics.precision).toMatchObject({ k: 7, n: 9 });
    expect(ev.metrics.recall).toMatchObject({ k: 7, n: 10 });
    expect(ev.metrics.f1.mean).toBeCloseTo((2 * 7) / (2 * 7 + 2 + 3), 4);
    for (const m of Object.values(ev.metrics)) {
      expect(m.lower).toBeLessThanOrEqual(m.mean + 1e-9);
      expect(m.mean).toBeLessThanOrEqual(m.upper + 1e-9);
    }
    expect(ev.misses).toHaveLength(3);
    expect(ev.falseBlocks.length).toBeLessThanOrEqual(2);
  });

  it("is deterministic (seeded F1 interval)", () => {
    expect(evaluateGuardrail().metrics.f1).toEqual(evaluateGuardrail().metrics.f1);
  });
});

describe("compare", () => {
  it("comparePair: 10 discordant tasks all favouring A gives McNemar p = 2/1024", () => {
    const d = comparePair("sim/careful", "sim/gullible")!;
    expect(d.paired).toEqual({ n: 10, bothPass: 0, bothFail: 0, aOnly: 10, bOnly: 0 });
    expect(d.mcnemar.exactP).toBeCloseTo(2 / 1024, 12);
    expect(d.pAGreater).toBeGreaterThan(0.999);
    expect(Math.abs(d.pAGreater - d.pAGreaterMC)).toBeLessThan(0.01);
    expect(d.disagreements).toHaveLength(10);
    expect(d.diff.lower).toBeLessThan(d.diff.upper);
    expect(comparePair("sim/careful", "nope")).toBeNull();
  });

  it("pairwiseMatrix: complementary cells sum to 1 and the diagonal is null", () => {
    const m = pairwiseMatrix();
    expect(m.models).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(m.cells[i][i]).toBeNull();
      for (let j = 0; j < 3; j++) if (i !== j) expect(m.cells[i][j]!.p + m.cells[j][i]!.p).toBeCloseTo(1, 9);
    }
    expect(m.models[0].model).toBe("sim/careful");
  });
});

describe("findings", () => {
  it("produces well-formed findings and hero stats", () => {
    const f = computeFindings();
    expect(f.length).toBeGreaterThan(0);
    for (const x of f) {
      expect(x.id).toBeTruthy();
      expect(Array.isArray(x.headline)).toBe(true);
      expect(typeof x.detail).toBe("string");
      expect(x.href.startsWith("/")).toBe(true);
    }
    expect(f.find((x) => x.id === "injection")).toBeDefined();
    const h = heroStats();
    expect(h.episodes).toBe(21);
    expect(h.spendUsd).toBe(2000); // 20 bought x $100
    expect(h.runs).toBe(1);
  });

  it("returns no findings on an empty DB", () => {
    replace(emptyDb());
    expect(computeFindings()).toEqual([]);
  });
});
