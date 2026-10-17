import Link from "next/link";
import AutoRefresh from "@/components/AutoRefresh";
import LeaderboardTable from "@/components/LeaderboardTable";
import LiveFeed from "@/components/LiveFeed";
import { agentRows, overview, recentTransactions } from "@/components/data";
import { Card, Chip, Empty, Kpi, TrustBar, compactMoney, money, pct, timeAgo } from "@/components/ui";
import { listClaims } from "@/lib/claims";

export const dynamic = "force-dynamic";

export default function Home() {
  const o = overview();
  const txs = recentTransactions(15);
  const claims = listClaims().slice(0, 5);
  const agents = agentRows().slice(0, 8);
  return (
    <div className="space-y-6">
      <AutoRefresh types={["claim", "risk", "bench"]} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Insurance for AI agents that spend money</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-zinc-400">
            Every agent purchase is benchmarked, screened by Guardian, priced by a Bayesian risk model, recorded on a tamper-evident flight recorder, and insured — so when an agent screws up, the user gets paid.
          </p>
        </div>
        <Link href="/demo" className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-black shadow-[0_0_24px_rgba(52,211,153,0.35)] hover:bg-emerald-300">Run the live demo →</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Agents insured" value={o.agents} sub={`${o.txCount} transactions`} />
        <Kpi label="Insured volume" value={compactMoney(o.volume)} sub="approved purchases" />
        <Kpi label="Premiums collected" value={money(o.premiums)} tone="good" sub={o.volume ? `${pct(o.premiums / o.volume, 1)} avg rate` : "—"} />
        <Kpi label="Scams blocked" value={o.blocked} tone={o.blocked ? "warn" : "default"} sub={`${o.held} held for user`} />
        <Kpi label="Claims paid" value={o.claimsPaid} tone={o.claimsPaid ? "bad" : "default"} sub={`${money(o.payouts)} of ${o.claimsTotal} filed`} />
        <Kpi label="Loss ratio" value={o.premiums ? pct(o.lossRatio, 0) : "—"} tone={o.lossRatio > 1 ? "bad" : o.lossRatio > 0.6 ? "warn" : "good"} sub="payouts / premiums" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card title="Which AI is safest with your money?" subtitle="SpendBench — agents shopping a live store full of knockoffs, fake discounts and prompt injections" pad={false}>
            <LeaderboardTable limit={5} />
          </Card>
          <Card title="Insured agents" subtitle="Trust score = posterior P(good transaction); bar shows 90% credible band" pad={false}
            action={<Link href="/agents" className="text-xs text-zinc-400 hover:text-white">All agents →</Link>}>
            {agents.length === 0 ? <div className="p-5"><Empty>No agents yet.</Empty></div> : (
              <ul className="divide-y divide-white/[0.04]">
                {agents.map((a) => (
                  <li key={a.id}>
                    <Link href={`/agents/${encodeURIComponent(a.id)}`} className="flex items-center gap-4 px-5 py-2.5 hover:bg-white/[0.02]">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-sm text-zinc-200">{a.id}</div>
                        <div className="truncate text-xs text-zinc-500">{a.model} · {a.txCount} tx · limit {money(a.profile.spendLimit, 0)} · premium {pct(a.profile.premiumRate, 1)}</div>
                      </div>
                      <TrustBar score={a.profile.trustScore} lower={a.profile.lower} upper={a.profile.upper} width="w-36" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6 lg:col-span-2">
          <Card title="Live transactions" subtitle="Guardian verdicts in real time" pad={false}
            action={<Link href="/recorder" className="text-xs text-zinc-400 hover:text-white">Flight recorder →</Link>}>
            <LiveFeed initial={txs} limit={10} />
          </Card>
          <Card title="Claims queue" pad={false} action={<Link href="/claims" className="text-xs text-zinc-400 hover:text-white">File / view claims →</Link>}>
            {claims.length === 0 ? <div className="p-5"><Empty>No claims filed.</Empty></div> : (
              <ul className="divide-y divide-white/[0.04]">
                {claims.map((c) => (
                  <li key={c.id} className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Chip status={c.status} />
                      {c.verdict && <Chip status={c.verdict.fault}>{c.verdict.fault} fault</Chip>}
                      <span className="ml-auto text-sm font-medium tabular text-zinc-100">{c.verdict?.payout ? money(c.verdict.payout) : "—"}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-zinc-400">“{c.complaint}”</div>
                    <div className="mt-0.5 text-[11px] text-zinc-600">{c.agentId} · {timeAgo(c.createdAt)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
