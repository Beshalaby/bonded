import Link from "next/link";
import AutoRefresh from "@/components/AutoRefresh";
import ClaimCard from "@/components/ClaimCard";
import ClaimForm from "@/components/ClaimForm";
import { recentTransactions } from "@/components/data";
import { Card, Empty, Kpi, PageHeader, money, timeAgo } from "@/components/ui";
import { listClaims } from "@/lib/claims";

export const dynamic = "force-dynamic";

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ tx?: string }> }) {
  const { tx } = await searchParams;
  const claims = listClaims();
  const txs = recentTransactions(200).filter((t) => t.status !== "blocked" || t.id === tx);
  const options = txs.map((t) => ({ id: t.id, status: t.status, label: `${money(t.amount)} · ${t.titles.join(", ").slice(0, 60)} · ${t.agentId}` }));
  const paid = claims.filter((c) => c.status === "paid");
  return (
    <div className="space-y-6">
      <AutoRefresh types={["claim"]} />
      <PageHeader title="Claims" subtitle="The AI adjuster reads the tamper-evident flight recorder and decides who is at fault: the agent (we pay), the user (denied), or the merchant (routed)." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Claims filed" value={claims.length} />
        <Kpi label="Paid" value={paid.length} sub={money(paid.reduce((s, c) => s + (c.verdict?.payout ?? 0), 0))} tone={paid.length ? "bad" : "default"} />
        <Kpi label="Denied" value={claims.filter((c) => c.status === "denied").length} />
        <Kpi label="Routed to merchant" value={claims.filter((c) => c.status === "routed_to_merchant").length} />
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="File a claim" className="lg:col-span-2 lg:self-start">
          <ClaimForm transactions={options} defaultTx={tx} />
        </Card>
        <Card title="Queue" subtitle="Newest first" className="lg:col-span-3" pad={false}>
          {claims.length === 0 ? <div className="p-5"><Empty>No claims yet.</Empty></div> : (
            <ul className="space-y-3 p-4">
              {claims.map((c) => (
                <li key={c.id}>
                  <div className="mb-1 flex items-center gap-2 px-1 text-[11px] text-zinc-500">
                    <span className="font-mono">{c.id}</span>·
                    <Link className="font-mono hover:text-zinc-300" href={`/agents/${encodeURIComponent(c.agentId)}`}>{c.agentId}</Link>·
                    <span className="truncate">{c.transaction ? `${money(c.transaction.amount)} ${c.transaction.items.join(", ")}` : c.transactionId}</span>
                    <span className="ml-auto whitespace-nowrap">{timeAgo(c.createdAt)}</span>
                  </div>
                  <ClaimCard claim={c} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
