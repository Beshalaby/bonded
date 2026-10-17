import Link from "next/link";
import AutoRefresh from "@/components/AutoRefresh";
import TrustChart from "@/components/TrustChart";
import { profileFor, recentTransactions } from "@/components/data";
import { Card, Chip, Empty, Kpi, PageHeader, money, pct, timeAgo } from "@/components/ui";
import { read } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const db = read();
  const agent = db.agents.find((a) => a.id === id);
  const model = agent?.model ?? db.risk.find((r) => r.agentId === id)?.model ?? db.transactions.find((t) => t.agentId === id)?.model;
  if (!model)
    return <div className="space-y-6"><PageHeader title={id} /><Empty cta={{ href: "/agents", label: "All agents" }}>Unknown agent.</Empty></div>;
  const p = profileFor(id, model);
  const txs = recentTransactions(100, id);
  const claims = db.claims.filter((c) => c.agentId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const prior = db.modelPriors[model];
  const tone = p.trustScore >= 0.85 ? "good" : p.trustScore >= 0.65 ? "warn" : "bad";
  return (
    <div className="space-y-6">
      <AutoRefresh />
      <PageHeader
        title={<span className="font-mono">{id}</span>}
        subtitle={<>{agent?.name && agent.name !== id ? `${agent.name} · ` : ""}model <span className="font-mono text-zinc-300">{model}</span>{prior ? ` · SpendBench prior Beta(${prior.alpha}, ${prior.beta})` : ""}</>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Trust score" value={pct(p.trustScore, 1)} tone={tone} sub={`P(good transaction)`} />
        <Kpi label="90% credible band" value={`${pct(p.lower)}–${pct(p.upper)}`} sub={`Beta(${p.alpha.toFixed(1)}, ${p.beta.toFixed(1)})`} />
        <Kpi label="Spending limit" value={money(p.spendLimit, 0)} sub="per transaction" />
        <Kpi label="Premium rate" value={pct(p.premiumRate, 2)} sub="of purchase amount" />
        <Kpi label="Track record" value={`${p.txCount} tx`} sub={`${p.failCount} failures · ${claims.filter((c) => c.status === "paid").length} claims paid`} tone={p.failCount ? "warn" : "default"} />
      </div>
      <Card title="Trust score history" subtitle="Line = posterior mean; shaded = 90% credible interval; red markers = paid claims / failures">
        <TrustChart history={p.history} />
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Transactions" pad={false} className="lg:col-span-2">
          {txs.length === 0 ? <div className="p-5"><Empty>No transactions.</Empty></div> : (
            <ul className="divide-y divide-white/[0.04]">
              {txs.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Chip status={t.status} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-zinc-200">{t.titles.join(", ") || "(empty)"}</div>
                    <div className="truncate text-xs text-zinc-500">{t.instruction ?? ""}{t.guardian?.reasons?.length ? ` · ${t.guardian.reasons.map((r) => r.code).join(", ")}` : ""}</div>
                  </div>
                  <span className="tabular text-sm text-zinc-100">{money(t.amount)}</span>
                  <Link href={`/recorder/${t.sessionId}`} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-400 hover:text-white">recorder</Link>
                  <span className="hidden w-14 text-right text-[11px] text-zinc-600 sm:block">{timeAgo(t.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Claims" pad={false}>
          {claims.length === 0 ? <div className="p-5"><Empty>No claims.</Empty></div> : (
            <ul className="divide-y divide-white/[0.04]">
              {claims.map((c) => (
                <li key={c.id} className="px-5 py-3">
                  <div className="flex items-center gap-2"><Chip status={c.status} />{c.verdict && <Chip status={c.verdict.fault}>{c.verdict.fault} fault</Chip>}<span className="ml-auto tabular text-sm">{money(c.verdict?.payout ?? 0)}</span></div>
                  <div className="mt-1 text-xs text-zinc-400">{c.verdict?.explanation}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
