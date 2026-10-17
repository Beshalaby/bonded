import Link from "next/link";
import AutoRefresh from "@/components/AutoRefresh";
import { Card, Chip, Empty, PageHeader, money, timeAgo } from "@/components/ui";
import { read } from "@/lib/db";
import { verify } from "@/lib/recorder";

export const dynamic = "force-dynamic";

export default function RecorderIndex() {
  const db = read();
  const sessions = [...db.sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
  return (
    <div className="space-y-6">
      <AutoRefresh types={["transaction", "claim"]} />
      <PageHeader title="Flight recorder" subtitle="Black box for agent purchases: per-session SHA-256 hash chains. Click a session to inspect or tamper with it." />
      <Card pad={false}>
        {sessions.length === 0 ? <div className="p-5"><Empty>No sessions recorded yet.</Empty></div> : (
          <ul className="divide-y divide-white/[0.04]">
            {sessions.map((s) => {
              const v = verify(s.id);
              const tx = db.transactions.find((t) => t.sessionId === s.id);
              return (
                <li key={s.id}>
                  <Link href={`/recorder/${s.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-white/[0.02]">
                    <Chip status={v.valid ? "valid" : "broken"}>{v.valid ? `✓ ${v.length}` : `✗ #${v.brokenAt}`}</Chip>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-zinc-200">{s.task?.instruction}</div>
                      <div className="truncate font-mono text-[11px] text-zinc-500">{s.id} · {s.agentId} · {s.model}</div>
                    </div>
                    {tx && <Chip status={tx.status}>{tx.status} {money(tx.amount)}</Chip>}
                    <span className="w-16 text-right text-[11px] text-zinc-600">{timeAgo(s.createdAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
