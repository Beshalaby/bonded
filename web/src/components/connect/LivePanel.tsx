"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Play } from "lucide-react";
import { cx, outcomeOf, type Outcome } from "@/components/ui";
import { useEvents } from "@/components/useEvents";
import type { FeedEvent, LogEntry } from "@/lib/types";
import "./connect.css";
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
    setTimeout(() => setFresh((s) => { const n = new Set(s); n.delete(id); return n; }), 2600);
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
      const r = e.data as { model?: string; sessionId?: string };
      if (r.model?.startsWith("mcp/")) { if (r.sessionId) setTimeout(() => flash(r.sessionId!), 400); soon(); }
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
    <div className={cx("relative", className)}>
      <div className="flex items-center justify-between gap-4 border-b border-divider pb-4">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-4">Connected agents</h2>
        <span className={cx("inline-flex items-center gap-2 text-[13px]", live ? "text-ink-3" : "text-ink-4")}>
          <span aria-hidden className={cx("inline-block size-[7px] rounded-full", live ? "pulse-dot bg-sage" : "bg-ink-5")} />
          {live ? "Listening" : "Connecting"}
        </span>
      </div>

      {activeClients.length + idleClients.length > 0 && (
        <p className="pt-4 text-[13.5px] text-ink-3">
          {[...activeClients, ...idleClients].slice(0, 3).map((c, i) => (
            <span key={c.id}>
              {i > 0 && <span className="text-ink-5"> · </span>}
              <span className="text-ink-2">{c.displayName}</span>
              {c.clientVersion && <span className="text-ink-4"> v{c.clientVersion}</span>}
              <span className="text-ink-4"> {c.activeTaskId ? `on ${c.activeTaskId}` : c.calls ? `${c.completed} graded` : "connected"}</span>
            </span>
          ))}
        </p>
      )}

      {!data ? (
        <ul aria-hidden className="grid gap-2 pt-4">{[0, 1].map((i) => <li key={i} className="h-[68px] animate-pulse rounded-[20px] bg-canvas-sunk/60" />)}</ul>
      ) : sessions.length === 0 ? (
        <Waiting />
      ) : (
        <ul className="grid pt-2">
          {sessions.slice(0, 5).map((s) => <SessionRow key={s.sessionId} s={s} fresh={fresh.has(s.sessionId)} />)}
        </ul>
      )}
      <p className="mt-6 text-[13px] leading-relaxed text-ink-4">
        Finished agents join the <Link href="/#ranking" className="text-ink-3 underline-offset-4 hover:text-ink hover:underline">ranking</Link> under their client name, like <span className="font-mono text-[12px]">mcp/claude-code</span>.
      </p>
    </div>
  );
}

function Waiting() {
  return (
    <div className="flex items-center gap-4 py-10">
      <span aria-hidden className="relative flex size-3 shrink-0 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-gold/40" />
        <span className="relative size-2 rounded-full bg-gold" />
      </span>
      <p className="text-[19px] tracking-[-0.02em] text-ink-3">Waiting for an agent to call <span className="font-mono text-[0.85em] text-ink-2">start_task</span>.</p>
    </div>
  );
}

const WORD: Record<Outcome, [string, string]> = {
  success: ["Passed", "text-pass-ink"], scammed: ["Scammed", "text-coral-ink"], over_budget: ["Over budget", "text-coral-ink"],
  wrong_item: ["Wrong item", "text-coral-ink"], failed: ["Failed", "text-coral-ink"], no_purchase: ["No purchase", "text-ink-3"], error: ["Error", "text-ink-3"],
};

function SessionRow({ s, fresh }: { s: McpOverview["sessions"][number]; fresh: boolean }) {
  const r = s.result;
  const active = s.status === "active";
  const outcome = r ? outcomeOf({ ...r, error: r.error ?? undefined, attribution: r.failureMode ? { mode: r.failureMode } : undefined }) : null;
  const steps = s.steps;
  const last = steps[steps.length - 1];
  const tone = outcome === "success" ? "sage" : outcome && WORD[outcome][1] === "text-coral-ink" ? "coral" : "gold";

  return (
    <li className={"group relative isolate border-b border-divider py-5 last:border-b-0"}>
      {fresh && <div aria-hidden className={cx("burst lp-burst", `burst-${tone}`)} style={{ ["--bx" as string]: "30%", ["--bs" as string]: "min(620px, 120%)" }} />}
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 truncate text-[18px] font-medium tracking-[-0.02em] text-ink">{s.displayName}</span>
        <span className="ml-auto shrink-0 text-[14px] font-medium">
          {active ? (
            <span className="inline-flex items-center gap-2 text-ink-2"><span aria-hidden className="pulse-dot inline-block size-[7px] rounded-full bg-gold" />Shopping</span>
          ) : outcome ? <span className={WORD[outcome][1]}>{WORD[outcome][0]}</span> : <span className="text-ink-4">Ended</span>}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
        <span className="font-mono text-[12px]">{s.taskId}</span>
        <span className="text-ink-5">·</span>
        <span>{active && last ? last.label : r ? `${r.bought !== false && r.amount != null ? usd(r.amount) : "no purchase"} of ${usd(s.budget, 0)}` : `budget ${usd(s.budget, 0)}`}</span>
        {r && !r.success && r.failureMode && <><span className="text-ink-5">·</span><span className="text-coral-ink">{failureLabel(r.failureMode)}</span></>}
        {r && <><span className="text-ink-5">·</span><span className="tnum">{steps.filter((x) => !["guardrail_verdict", "checkout_result"].includes(x.action)).length} steps · {ms(r.latencyMs)}</span></>}
        <span className="text-ink-5">·</span>
        <span>{ago(s.createdAt)}</span>
        <span className="ml-auto flex items-center gap-4">
          <Link href={traceHref(s.sessionId)} className="tap inline-flex items-center gap-0.5 font-medium text-ink-3 hover:text-ink">
            Trace <ArrowUpRight size={12} aria-hidden />
          </Link>
          <Link href={`/live?replay=${encodeURIComponent(s.sessionId)}`} className="tap inline-flex items-center gap-1 font-medium text-accent hover:text-ink">
            <Play size={10} fill="currentColor" aria-hidden /> Replay
          </Link>
        </span>
      </div>
    </li>
  );
}
