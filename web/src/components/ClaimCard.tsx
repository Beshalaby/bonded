import Link from "next/link";
import type { Claim } from "@/lib/types";
import { Chip, money } from "./ui";

const HEAD: Record<Claim["status"], string> = {
  paid: "Claim paid — agent at fault",
  denied: "Claim denied",
  routed_to_merchant: "Routed to merchant",
  open: "Under review",
};

export default function ClaimCard({ claim, compact = false }: { claim: Claim; compact?: boolean }) {
  const v = claim.verdict;
  const border = claim.status === "paid" ? "border-emerald-500/30" : claim.status === "routed_to_merchant" ? "border-sky-500/30" : "border-white/10";
  return (
    <div className={`rounded-xl border ${border} bg-black/20 p-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-white">{HEAD[claim.status]}</span>
        <Chip status={claim.status} />
        {v && <Chip status={v.fault}>{v.fault} fault</Chip>}
        {v && !v.chainValid && <Chip status="broken">chain broken</Chip>}
        <span className="ml-auto text-xl font-semibold tabular text-white">{money(v?.payout ?? 0)}</span>
      </div>
      {!compact && <div className="mt-2 text-xs text-zinc-500">Complaint: “{claim.complaint}”</div>}
      {v && <p className="mt-2 text-sm leading-relaxed text-zinc-300">{v.explanation}</p>}
      {v && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-zinc-500">Evidence:</span>
          {v.evidenceSeqs.map((s) => (
            <Link key={s} href={`/recorder/${claim.sessionId}#seq-${s}`} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-zinc-300 hover:bg-white/10 hover:text-white">#{s}</Link>
          ))}
          <span className="ml-auto text-zinc-600">judge: {v.judge} · <Link href={`/recorder/${claim.sessionId}`} className="hover:text-zinc-300">flight recorder →</Link></span>
        </div>
      )}
    </div>
  );
}
