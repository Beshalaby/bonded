// Pure data shaping for the /present deck: picks the rows, pairs, wallets and sentences each slide shows from the
// live API responses. No React, so the copy rules ("the sentence must stay true if a number changes") are testable.
import type { ModelStats, TrapType } from "@/lib/types";
import type { BankWallet } from "@/lib/ui/api";
import { MIN_RANKED_N } from "@/lib/ui/rank";
import { parseShieldModel } from "@/lib/shield/names";

export interface TrapSnippet { type: TrapType; segs: { t: string; hl?: boolean; dim?: boolean }[] }

export const clean = (name: string) => name.replace(/\s*\(sim\)\s*$/i, "");
export const scams = (r: ModelStats) => Math.round(r.metrics.scamRate * r.n);
export const fmtScore = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, "");
export const money = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;

/** Real base models only: no Bonded wrappers, no simulated agents, no MCP self-tests, n ≥ MIN_RANKED_N. Score desc. */
export function baseModels(rows: ModelStats[]): ModelStats[] {
  return rows
    .filter((r) => !r.model.startsWith("bonded/") && !r.simulated && !r.model.startsWith("sim/") && r.provider !== "MCP" && !r.model.startsWith("mcp/") && r.n >= MIN_RANKED_N)
    .sort((a, b) => b.score - a.score);
}

/** The base model that fell for the most scams (count, then rate). Null when no model was scammed. */
export function mostScammed(rows: ModelStats[]): ModelStats | null {
  const s = [...rows].filter((r) => scams(r) > 0).sort((a, b) => scams(b) - scams(a) || b.metrics.scamRate - a.metrics.scamRate);
  return s[0] ?? null;
}

export interface ShieldPair { base: ModelStats; shield: ModelStats }
const PAIR_ORDER = ["openai/gpt-5-mini", "qwen/qwen3-235b-a22b-2507"];

/** Shield rows next to their own base model (real bases, n ≥ MIN_RANKED_N), GPT-5 mini and Qwen3 first. At most 2. */
export function shieldPairs(rows: ModelStats[]): ShieldPair[] {
  const pairs: ShieldPair[] = [];
  for (const r of rows) {
    const s = parseShieldModel(r.model);
    if (!s || s.variant !== "shield" || r.n < MIN_RANKED_N) continue;
    const base = rows.find((x) => x.model === s.base);
    if (!base || base.simulated || base.n < MIN_RANKED_N) continue;
    pairs.push({ base, shield: r });
  }
  const rank = (p: ShieldPair) => { const i = PAIR_ORDER.indexOf(p.base.model); return i < 0 ? 99 : i; };
  return pairs.sort((a, b) => rank(a) - rank(b) || scams(b.base) - scams(a.base)).slice(0, 2);
}

/** The second line of the Shield slide, true to whatever the pairs show. */
export function shieldHeadline(pairs: ShieldPair[]): string {
  if (!pairs.length) return "Same models, one safety layer.";
  const before = pairs.reduce((s, p) => s + scams(p.base), 0);
  const after = pairs.reduce((s, p) => s + scams(p.shield), 0);
  if (before > 0 && after === 0) return "Same models. Scams went to zero.";
  if (after < before) return "Same models. Far fewer scams.";
  return "Same models, one safety layer.";
}

/** "Bonded Shield (GPT-5 mini) is #1 of every agent we measured, at 100." Only when a Shield row really leads. */
export function shieldLeads(rows: ModelStats[]): string | null {
  const ranked = rows.filter((r) => r.n >= MIN_RANKED_N && r.provider !== "MCP" && !r.simulated).sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (!top || !parseShieldModel(top.model) || (ranked[1] && ranked[1].score === top.score)) return null;
  return `${clean(top.displayName)} ranks #1 of every agent we measured, at ${fmtScore(top.score)}.`;
}

export type WalletRole = "overspent" | "careful" | "shield";
export interface PickedWallet { w: BankWallet; role: WalletRole }

/** Up to 3 wallets: the most overspent one, a careful one in the black, and a Shield wallet. */
export function pickWallets(wallets: BankWallet[]): PickedWallet[] {
  const out: PickedWallet[] = [];
  const used = new Set<string>();
  const add = (w: BankWallet | undefined, role: WalletRole) => { if (w && !used.has(w.agentId)) { used.add(w.agentId); out.push({ w, role }); } };
  const neg = wallets.filter((w) => w.balance < 0).sort((a, b) => a.balance - b.balance);
  add(neg[0], "overspent");
  const pos = wallets.filter((w) => w.balance >= 0 && w.purchases > 0 && !w.model.startsWith("bonded/") && !w.model.startsWith("mcp/"));
  add(pos.find((w) => /careful/i.test(w.model)) ?? pos.sort((a, b) => a.spent / Math.max(1, a.funded) - b.spent / Math.max(1, b.funded))[0], "careful");
  const shields = wallets.filter((w) => parseShieldModel(w.model) && w.balance >= 0);
  add(shields.find((w) => w.model.endsWith("openai/gpt-5-mini")) ?? shields[0], "shield");
  const order: WalletRole[] = ["careful", "overspent", "shield"];
  return out.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
}
