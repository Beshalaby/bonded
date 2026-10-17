// Server-side view-model helpers for dashboard pages (read-only over the JSON DB).
import { read } from "@/lib/db";
import { getProfile } from "@/lib/risk";
import type { RiskProfile, Transaction } from "@/lib/types";

export function profileFor(agentId: string, model: string): RiskProfile {
  const stored = read().risk.find((r) => r.agentId === agentId);
  if (stored) return stored;
  try {
    return getProfile(agentId, model);
  } catch {
    return { agentId, model, alpha: 1, beta: 1, trustScore: 0.5, lower: 0.05, upper: 0.95, spendLimit: 0, premiumRate: 0, txCount: 0, failCount: 0, history: [] };
  }
}

export type TxView = Transaction & { titles: string[]; instruction?: string };

export function txView(t: Transaction): TxView {
  const db = read();
  return {
    ...t,
    titles: t.items.map((i) => db.products.find((p) => p.id === i.productId)?.title ?? i.productId),
    instruction: db.sessions.find((s) => s.id === t.sessionId)?.task?.instruction,
  };
}

export function recentTransactions(n = 20, agentId?: string): TxView[] {
  return [...read().transactions]
    .filter((t) => !agentId || t.agentId === agentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, n)
    .map(txView);
}

export function overview() {
  const db = read();
  const approved = db.transactions.filter((t) => t.status === "approved");
  const volume = approved.reduce((s, t) => s + (t.amount || 0), 0);
  const premiums = approved.reduce((s, t) => s + (t.quote?.premium || 0), 0);
  const blocked = db.transactions.filter((t) => t.status === "blocked").length;
  const held = db.transactions.filter((t) => t.status === "held").length;
  const paid = db.claims.filter((c) => c.status === "paid");
  const payouts = paid.reduce((s, c) => s + (c.verdict?.payout || 0), 0);
  const agentIds = new Set([...db.agents.map((a) => a.id), ...db.risk.map((r) => r.agentId)]);
  return {
    agents: agentIds.size,
    volume, premiums, blocked, held,
    txCount: db.transactions.length,
    claimsPaid: paid.length, payouts,
    claimsTotal: db.claims.length,
    lossRatio: premiums > 0 ? payouts / premiums : 0,
    products: db.products.length,
  };
}

export function agentRows() {
  const db = read();
  const ids = new Map<string, string>();
  for (const a of db.agents) ids.set(a.id, a.model);
  for (const r of db.risk) if (!ids.has(r.agentId)) ids.set(r.agentId, r.model);
  return [...ids].map(([id, model]) => {
    const p = profileFor(id, model);
    const txs = db.transactions.filter((t) => t.agentId === id);
    const agent = db.agents.find((a) => a.id === id);
    return {
      id, model, name: agent?.name ?? id, profile: p,
      txCount: txs.length,
      volume: txs.filter((t) => t.status === "approved").reduce((s, t) => s + t.amount, 0),
      blocked: txs.filter((t) => t.status === "blocked").length,
      claims: db.claims.filter((c) => c.agentId === id).length,
      lastTs: txs.map((t) => t.createdAt).sort().pop() ?? agent?.createdAt,
    };
  }).sort((a, b) => (b.lastTs ?? "").localeCompare(a.lastTs ?? ""));
}
