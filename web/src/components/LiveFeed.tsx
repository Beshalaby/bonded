"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FeedEvent, LogEntry } from "@/lib/types";
import type { TxView } from "./data";
import { useFeed } from "./useFeed";
import { Chip, money, timeAgo } from "./ui";

const ACTION_LABEL: Record<string, string> = {
  session_start: "started a task",
  search: "searched",
  view: "viewed a product",
  add_to_cart: "added to cart",
  remove_from_cart: "removed from cart",
  checkout_requested: "requested checkout",
  guardian_verdict: "Guardian verdict",
  risk_quote: "priced premium",
  checkout_result: "checkout result",
  claim_decision: "claim decided",
};

function logLine(e: LogEntry) {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const extra = typeof p.q === "string" ? `“${p.q}”` : typeof p.query === "string" ? `“${p.query}”` : typeof p.decision === "string" ? p.decision : typeof p.status === "string" ? p.status : "";
  return `${e.actor} ${ACTION_LABEL[e.action] ?? e.action} ${extra}`.trim();
}

export default function LiveFeed({ initial, limit = 12 }: { initial: TxView[]; limit?: number }) {
  const router = useRouter();
  const seen = useRef<Set<string>>(new Set(initial.map((t) => t.id)));
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [ticker, setTicker] = useState<LogEntry[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const newIds = initial.map((t) => t.id).filter((id) => !seen.current.has(id));
    if (newIds.length) {
      newIds.forEach((id) => seen.current.add(id));
      setFresh(new Set(newIds));
    }
  }, [initial]);

  const connected = useFeed((ev: FeedEvent) => {
    if (ev.type === "log") {
      setTicker((t) => [ev.data as LogEntry, ...t].slice(0, 4));
      return;
    }
    if (timer.current) return;
    timer.current = setTimeout(() => { timer.current = null; router.refresh(); }, 400);
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between px-5 pt-1 text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? "pulse-dot bg-emerald-400" : "bg-zinc-600"}`} />
          {connected ? "streaming /api/feed" : "connecting…"}
        </span>
        <span className="truncate pl-4 font-mono text-zinc-600">{ticker[0] ? logLine(ticker[0]) : ""}</span>
      </div>
      {initial.length === 0 ? (
        <div className="px-5 pb-6 text-center text-sm text-zinc-500">No transactions yet — run the <Link className="text-emerald-300 underline-offset-2 hover:underline" href="/demo">demo</Link> or point an agent at the Arena.</div>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {initial.slice(0, limit).map((t) => (
            <li key={t.id} className={`px-5 py-3 ${fresh.has(t.id) ? "feed-in" : ""}`}>
              <div className="flex items-center gap-3">
                <Chip status={t.status} />
                <Link href={`/recorder/${t.sessionId}`} className="min-w-0 flex-1 truncate text-sm text-zinc-200 hover:text-white">
                  {t.titles.join(", ") || "(empty cart)"}
                </Link>
                <span className="text-sm font-medium tabular text-zinc-100">{money(t.amount)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 pl-[2px] text-xs text-zinc-500">
                <Link href={`/agents/${encodeURIComponent(t.agentId)}`} className="font-mono text-zinc-400 hover:text-zinc-200">{t.agentId}</Link>
                <span>·</span>
                <span className="font-mono">{t.model}</span>
                <span>·</span>
                <span>{timeAgo(t.createdAt)}</span>
                {t.quote && t.status === "approved" && <span className="ml-auto text-zinc-500">premium {money(t.quote.premium)}</span>}
              </div>
              {t.guardian?.reasons?.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {t.guardian.reasons.slice(0, 3).map((r, i) => (
                    <span key={i} title={r.message} className={`max-w-full truncate rounded-md px-1.5 py-0.5 text-[11px] ${r.severity === "critical" ? "bg-rose-500/10 text-rose-300" : r.severity === "warn" ? "bg-amber-500/10 text-amber-300" : "bg-white/5 text-zinc-400"}`}>
                      <b className="font-semibold">{r.code}</b> {r.message}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
