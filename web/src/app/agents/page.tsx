import Link from "next/link";
import AutoRefresh from "@/components/AutoRefresh";
import { agentRows } from "@/components/data";
import { Card, Empty, PageHeader, TrustBar, money, pct, timeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function AgentsPage() {
  const rows = agentRows();
  return (
    <div className="space-y-6">
      <AutoRefresh />
      <PageHeader title="Insured agents" subtitle="Each agent's trust score is a Beta posterior seeded by its model's SpendBench prior and updated by every real transaction and claim." />
      <Card pad={false}>
        {rows.length === 0 ? <div className="p-5"><Empty cta={{ href: "/demo", label: "Run the demo" }}>No agents have shopped yet.</Empty></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.05] text-left text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="py-2.5 pl-5 font-medium">Agent</th>
                  <th className="px-2 font-medium">Trust (90% band)</th>
                  <th className="px-2 text-right font-medium">Spend limit</th>
                  <th className="px-2 text-right font-medium">Premium</th>
                  <th className="px-2 text-right font-medium">Tx</th>
                  <th className="px-2 text-right font-medium">Volume</th>
                  <th className="px-2 text-right font-medium">Blocked</th>
                  <th className="px-2 pr-5 text-right font-medium">Claims</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]">
                    <td className="py-2.5 pl-5">
                      <Link href={`/agents/${encodeURIComponent(a.id)}`} className="font-mono text-zinc-100 hover:text-emerald-300">{a.id}</Link>
                      <div className="text-[11px] text-zinc-500">{a.model} · {timeAgo(a.lastTs)}</div>
                    </td>
                    <td className="px-2"><TrustBar score={a.profile.trustScore} lower={a.profile.lower} upper={a.profile.upper} /></td>
                    <td className="px-2 text-right tabular text-zinc-300">{money(a.profile.spendLimit, 0)}</td>
                    <td className="px-2 text-right tabular text-zinc-300">{pct(a.profile.premiumRate, 1)}</td>
                    <td className="px-2 text-right tabular text-zinc-400">{a.txCount}</td>
                    <td className="px-2 text-right tabular text-zinc-300">{money(a.volume)}</td>
                    <td className="px-2 text-right tabular text-amber-300">{a.blocked || ""}</td>
                    <td className="px-2 pr-5 text-right tabular text-rose-300">{a.claims || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
