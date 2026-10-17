"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Play } from "lucide-react";
import { Badge, OutcomeBadge, cx, outcomeOf } from "@/components/ui";
import { useEvents } from "@/components/useEvents";
import type { FeedEvent, LogEntry } from "@/lib/types";
import { ago, failureLabel, ms, traceHref, usd } from "@/lib/ui/format";

export interface McpOverview {
  clients: {
    id: string; clientName: string; clientVersion: string | null; protocolVersion: string; displayName: string;
    connectedAt: string; lastSeen: string; calls: number; activeSessionId: string | null; activeTaskId: string | null; completed: number;
  }[];
  sessions: {
    sessionId: string; model: string; displayName: string; taskId: string | null; instruction: string; budget: number;
    status: string; runId: string | null; createdAt: string;
    steps: { seq: number; ts: string; action: string; label: string }[];
    result: null | {
      success: boolean; scammed: boolean; overBudget: boolean; wrongItem: boolean; bought?: boolean; amount?: number;
      trapTypes: string[]; failureMode: string | null; latencyMs: number; error?: string;
    };
  }[];
}

const STEP_TONE: Record<string, string> = {
  search: "bg-zinc-400", view: "bg-zinc-400", add_to_cart: "bg-accent", remove_from_cart: "bg-zinc-400",
  checkout_requested: "bg-accent", guardrail_verdict: "bg-amber-500", checkout_result: "bg-emerald-500", end_task: "bg-zinc-400",
};

export default function LivePanel({ className }: { className?: string }) {
  const [data, setData] = useState<McpOverview | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const known = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/mcp/sessions?limit=6", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as McpOverview;
      known.current = new Set(d.sessions.map((s) => s.sessionId));
      setData(d);
    } catch { /* keep last */ }
  }, []);

  const soon = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => { timer.current = null; void load(); }, 120);
  }, [load]);

  useEffect(() => {
    void load();
    const iv = setInterval(load, 5000);
    return () => { clearInterval(iv); if (timer.current) clearTimeout(timer.current); };
  }, [load]);

  const flash = (id: string) => {
    setFresh((s) => new Set(s).add(id));
    setTimeout(() => setFresh((s) => { const n = new Set(s); n.delete(id); return n; }), 1600);
  };

  const live = useEvents(["log", "result", "run"], (e: FeedEvent) => {
    if (e.type === "log") {
      const l = e.data as LogEntry;
      const p = (l.payload ?? {}) as { model?: string };
      if (known.current.has(l.sessionId) || (l.action === "session_start" && p.model?.startsWith("mcp/"))) {
        known.current.add(l.sessionId);
        flash(l.sessionId);
        soon();
      }
    } else if (e.type === "result") {
      const r = e.data as { model?: string };
      if (r.model?.startsWith("mcp/")) soon();
    } else if (e.type === "run") {
      const r = e.data as { name?: string };
      if (r.name?.startsWith("MCP:")) soon();
    }
  });

  // One row per client app: several `claude -p` processes are separate MCP sessions of the same agent.
  const clients = Object.values((data?.clients ?? []).reduce<Record<string, McpOverview["clients"][number]>>((acc, c) => {
    const k = `${c.displayName}|${c.clientVersion ?? ""}`;
    const prev = acc[k];
    if (!prev) acc[k] = { ...c };
    else acc[k] = {
      ...(c.activeSessionId && !prev.activeSessionId ? c : prev),
      calls: prev.calls + c.calls, completed: prev.completed + c.completed,
    };
    return acc;
  }, {}));
  const sessions = data?.sessions ?? [];
  const activeClients = clients.filter((c) => c.calls > 0 || c.activeSessionId);
  const idleClients = clients.filter((c) => !(c.calls > 0 || c.activeSessionId));

  return (
    <div className={cx("overflow-hidden rounded-lg border border-zinc-200 bg-white", className)}>
      <div className="flex h-11 items-center justify-between border-b border-zinc-200 px-4">
        <h3 className="text-[13.5px] font-semibold text-zinc-900">Connected agents</h3>
        <span className={cx("inline-flex items-center gap-1.5 text-[12px]", live ? "text-emerald-700" : "text-zinc-400")}>
          <span className={cx("inline-block size-1.5 rounded-full", live ? "pulse-dot bg-emerald-500" : "bg-zinc-300")} />
          {live ? "Live" : "Connecting"}
        </span>
      </div>

      {(activeClients.length > 0 || idleClients.length > 0) && (
        <ul className="divide-y divide-zinc-100 border-b border-zinc-200 bg-zinc-50/50">
          {[...activeClients, ...idleClients].slice(0, 3).map((c) => (
            <li key={c.id} className="flex items-center gap-2.5 px-4 py-2 text-[12.5px]">
              <span className={cx("inline-block size-1.5 shrink-0 rounded-full", c.activeSessionId ? "pulse-dot bg-accent" : "bg-emerald-500")} />
              <span className="font-medium text-zinc-900">{c.displayName}</span>
              {c.clientVersion && <span className="font-mono text-[11.5px] text-zinc-400">v{c.clientVersion}</span>}
              <span className="ml-auto truncate text-zinc-500">
                {c.activeTaskId ? <>on <span className="font-mono text-[11.5px] text-zinc-700">{c.activeTaskId}</span></> : c.calls ? `${c.completed} graded` : "connected"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!data ? (
        <div className="space-y-3 p-4">
          {[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-md bg-zinc-100" />)}
        </div>
      ) : sessions.length === 0 ? (
        <Waiting />
      ) : (
        <ul className="divide-y divide-zinc-100">
          {sessions.slice(0, 3).map((s) => <SessionRow key={s.sessionId} s={s} fresh={fresh.has(s.sessionId)} />)}
        </ul>
      )}
    </div>
  );
}

function Waiting() {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="relative mb-4 flex size-10 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent/10" />
        <span className="relative size-2.5 rounded-full bg-accent" />
      </div>
      <div className="text-[13.5px] font-medium text-zinc-900">Waiting for an agent</div>
      <p className="mt-1 max-w-[260px] text-[12.5px] leading-relaxed text-zinc-500">
        As soon as an agent calls <span className="font-mono text-[11.5px] text-zinc-700">start_task</span>, it appears here and each step streams in as it happens.
      </p>
    </div>
  );
}

function SessionRow({ s, fresh }: { s: McpOverview["sessions"][number]; fresh: boolean }) {
  const r = s.result;
  const active = s.status === "active";
  const outcome = r ? outcomeOf({ ...r, error: r.error ?? undefined, attribution: r.failureMode ? { mode: r.failureMode } : undefined }) : null;
  const steps = s.steps;
  const tail = steps.slice(-5);
  const hidden = steps.length - tail.length;

  return (
    <li className={cx("px-4 py-3.5 transition-colors", fresh && "row-in")}>
      <div className="flex items-center gap-2">
        <span className="truncate text-[13.5px] font-medium text-zinc-900">{s.displayName}</span>
        <span className="ml-auto shrink-0">
          {active ? (
            <Badge tone="accent"><span className="pulse-dot inline-block size-1.5 rounded-full bg-accent" />Shopping</Badge>
          ) : outcome ? <OutcomeBadge outcome={outcome} /> : <Badge>Ended</Badge>}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[12px] text-zinc-500">
        <span className="font-mono text-[11.5px] text-zinc-700">{s.taskId}</span>
        <span className="text-zinc-300">·</span>
        <span>budget {usd(s.budget, 0)}</span>
        <span className="text-zinc-300">·</span>
        <span>{ago(s.createdAt)}</span>
      </div>

      {steps.length > 0 && (
        <ol className="relative mt-3 space-y-1.5 border-l border-zinc-200 pl-3.5">
          {hidden > 0 && <li className="text-[11.5px] text-zinc-400">{hidden} earlier step{hidden === 1 ? "" : "s"}</li>}
          {tail.map((st, i) => (
            <li key={st.seq} className={cx("relative text-[12px] leading-snug text-zinc-600", i === tail.length - 1 && fresh && "row-in")}>
              <span className={cx("absolute -left-[18px] top-[5px] size-[7px] rounded-full ring-2 ring-white", STEP_TONE[st.action] ?? "bg-zinc-400")} />
              <span className="mr-1.5 font-mono text-[10.5px] text-zinc-400 tnum">#{st.seq}</span>
              <span className="break-words">{st.label}</span>
            </li>
          ))}
        </ol>
      )}

      {r && !r.success && r.failureMode && (
        <div className="mt-2.5 text-[12px] text-rose-700">{failureLabel(r.failureMode)}</div>
      )}

      <div className="mt-3 flex items-center gap-3 text-[12px]">
        {r && (
          <span className="text-zinc-500 tnum">
            {r.bought !== false && r.amount != null ? usd(r.amount) : "no purchase"} · {steps.filter((x) => !["guardrail_verdict", "checkout_result"].includes(x.action)).length} steps · {ms(r.latencyMs)}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          <Link href={traceHref(s.sessionId)} className="inline-flex items-center gap-0.5 font-medium text-zinc-600 hover:text-accent">
            Trace <ArrowUpRight size={12} />
          </Link>
          <Link href={`/live?replay=${encodeURIComponent(s.sessionId)}`} className="inline-flex items-center gap-1 font-medium text-accent hover:underline underline-offset-2">
            <Play size={11} fill="currentColor" /> Replay
          </Link>
        </span>
      </div>
    </li>
  );
}
