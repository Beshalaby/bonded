import { describe, expect, it } from "vitest";
import type { ModelStats } from "@/lib/types";
import { baseModels, mostScammed, pickWallets, shieldHeadline, shieldLeads, shieldPairs } from "@/app/present/deck";
import { encodeQR } from "@/app/present/qr";

const row = (model: string, score: number, n: number, scammed: number, extra: Partial<ModelStats> = {}): ModelStats =>
  ({ model, displayName: model, provider: model.startsWith("bonded/") ? "Bonded" : "X", simulated: model.startsWith("sim/"), n, score,
    reliability: { mean: 0.9, lower: 0.8, upper: 0.95 },
    metrics: { successRate: 0.9, scamRate: scammed / n, budgetViolationRate: 0, wrongItemRate: 0, noPurchaseRate: 0, guardrailCatchRate: 0, avgCostUsd: 0, avgLatencyMs: 0, avgSteps: 0 },
    byTrap: {}, failureModes: {}, ...extra }) as unknown as ModelStats;

const rows = [
  row("bonded/shield:openai/gpt-5-mini", 100, 38, 0),
  row("bonded/shield:qwen/qwen3-235b-a22b-2507", 98.9, 38, 0),
  row("openai/gpt-5-mini", 97.2, 38, 1),
  row("qwen/qwen3-235b-a22b-2507", 94.9, 38, 3),
  row("meta-llama/llama-4-maverick", 82.3, 30, 2),
  row("sim/gullible", 40, 38, 20),
  row("mcp/claude-code", 100, 1, 0, { provider: "MCP" } as Partial<ModelStats>),
];

describe("present deck copy", () => {
  it("ranks real base models only and finds the most-scammed one", () => {
    expect(baseModels(rows).map((r) => r.model)).toEqual(["openai/gpt-5-mini", "qwen/qwen3-235b-a22b-2507", "meta-llama/llama-4-maverick"]);
    expect(mostScammed(baseModels(rows))?.model).toBe("qwen/qwen3-235b-a22b-2507");
  });

  it("only says scams went to zero when they did", () => {
    const pairs = shieldPairs(rows);
    expect(pairs.map((p) => p.base.model)).toEqual(["openai/gpt-5-mini", "qwen/qwen3-235b-a22b-2507"]);
    expect(shieldHeadline(pairs)).toBe("Same models. Scams went to zero.");
    const worse = rows.map((r) => (r.model === "bonded/shield:qwen/qwen3-235b-a22b-2507" ? row(r.model, 98, 38, 1) : r));
    expect(shieldHeadline(shieldPairs(worse))).toBe("Same models. Far fewer scams.");
    expect(shieldLeads(rows)).toMatch(/#1/);
    expect(shieldLeads(rows.filter((r) => !r.model.startsWith("bonded/")))).toBeNull();
  });

  it("picks an overspent, a careful and a Shield wallet", () => {
    const w = (agentId: string, model: string, balance: number) => ({ agentId, model, displayName: model, accountLast4: "0000", balance, balanceSource: "nessie" as const, purchases: 2, spent: 100, funded: 100 });
    const picked = pickWallets([w("a", "openai/gpt-5-mini", 10), w("b", "sim/gullible", -366), w("c", "sim/careful", 79), w("d", "bonded/shield:openai/gpt-5-mini", 1411)]);
    expect(picked.map((p) => [p.w.agentId, p.role])).toEqual([["c", "careful"], ["b", "overspent"], ["d", "shield"]]);
  });
});

describe("QR encoder", () => {
  it("picks the smallest version and draws the fixed patterns", () => {
    expect(encodeQR("hello world").length).toBe(21); // version 1
    expect(encodeQR("https://reservations-survive-changed-faculty.trycloudflare.com").length).toBe(33); // version 4
    expect(encodeQR("q".repeat(213)).length).toBe(57); // version 10
    expect(() => encodeQR("q".repeat(214))).toThrow();
    const m = encodeQR("http://localhost:3000");
    const n = m.length;
    for (const [x0, y0] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      for (let i = 0; i < 7; i++) {
        expect(m[y0][x0 + i]).toBe(true);
        expect(m[y0 + 6][x0 + i]).toBe(true);
      }
      expect(m[y0 + 1][x0 + 1]).toBe(false);
      expect(m[y0 + 3][x0 + 3]).toBe(true);
    }
    for (let i = 8; i < n - 8; i++) expect(m[6][i]).toBe(i % 2 === 0);
    expect(m[n - 8][8]).toBe(true); // dark module
  });

  it("writes a valid level-M format word, identically in both copies", () => {
    const m = encodeQR("bonded");
    const n = m.length;
    const b = (v: boolean) => (v ? 1 : 0);
    let a = 0;
    for (let i = 0; i <= 5; i++) a |= b(m[i][8]) << i;
    a |= b(m[7][8]) << 6; a |= b(m[8][8]) << 7; a |= b(m[8][7]) << 8;
    for (let i = 9; i < 15; i++) a |= b(m[8][14 - i]) << i;
    let c = 0;
    for (let i = 0; i < 8; i++) c |= b(m[8][n - 1 - i]) << i;
    for (let i = 8; i < 15; i++) c |= b(m[n - 15 + i][8]) << i;
    expect(a).toBe(c);
    const data = (a ^ 0x5412) >>> 10;
    expect(data >>> 3).toBe(0); // error correction level M
    let r = data;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    expect(((data << 10) | r) ^ 0x5412).toBe(a);
  });
});
