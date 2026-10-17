"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Claim, LogEntry, Session, Transaction } from "@/lib/types";
import { useFeed } from "./useFeed";
import { Chip, money, shortHash } from "./ui";

interface Data {
  sessionId: string; session: Session | null; transaction: Transaction | null; claims: Claim[];
  entries: LogEntry[]; verify: { valid: boolean; length: number; brokenAt?: number; reason?: string };
}

const ICON: Record<LogEntry["actor"], { i: string; c: string }> = {
  agent: { i: "AI", c: "text-sky-300 ring-sky-500/40" },
  system: { i: "SY", c: "text-zinc-300 ring-zinc-500/40" },
  user: { i: "U", c: "text-violet-300 ring-violet-500/40" },
  guardian: { i: "G", c: "text-amber-300 ring-amber-500/40" },
  risk: { i: "R", c: "text-emerald-300 ring-emerald-500/40" },
  adjuster: { i: "ADJ", c: "text-rose-300 ring-rose-500/40" },
};

function summary(e: LogEntry): string {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  if (p == null || typeof p !== "object") return String(p ?? "");
  const s = (k: string) => (p[k] !== undefined ? String(p[k]) : undefined);
  switch (e.action) {
    case "session_start": {
      const t = (p.task ?? p) as Record<string, unknown>;
      return `“${t.instruction ?? ""}” · budget $${t.budget ?? "?"}${t.constraints && Object.keys(t.constraints as object).length ? ` · ${JSON.stringify(t.constraints)}` : ""}`;
    }
    case "search": return `q=“${s("q") ?? s("query") ?? ""}”${p.count !== undefined ? ` → ${p.count} results` : Array.isArray(p.results) ? ` → ${(p.results as unknown[]).length} results` : ""}`;
    case "view": return `${s("title") ?? s("productId") ?? ""}`;
    case "add_to_cart": case "remove_from_cart": return `${s("title") ?? s("productId") ?? ""}${p.qty !== undefined ? ` × ${p.qty}` : ""}${p.total !== undefined ? ` · cart $${p.total}` : ""}`;
    case "guardian_verdict": {
      const r = (p.reasons as { code: string }[] | undefined) ?? [];
      return `${s("decision") ?? ""}${r.length ? ` — ${r.map((x) => x.code).join(", ")}` : ""}`;
    }
    case "risk_quote": return `premium $${p.premium ?? "?"} · limit $${p.spendLimit ?? "?"} · trust ${typeof p.trustScore === "number" ? (p.trustScore * 100).toFixed(1) + "%" : "?"}`;
    case "checkout_result": return `${s("status") ?? ""}${p.amount !== undefined ? ` · $${p.amount}` : ""}`;
    case "checkout_requested": return `${Array.isArray(p.items) ? (p.items as unknown[]).length : "?"} item(s) · total $${p.total ?? "?"}${p.reasoning ? ` · “${String(p.reasoning).slice(0, 100)}”` : ""}`;
    case "user_confirmation": return p.approve ? "user APPROVED the held purchase" : "user declined";
    case "claim_decision": return `${s("status")} · ${s("fault")} fault · payout $${p.payout ?? 0}`;
    default: {
      const j = JSON.stringify(p);
      return j.length > 140 ? j.slice(0, 140) + "…" : j;
    }
  }
}

export default function RecorderView({ sessionId }: { sessionId: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [tamperSeq, setTamperSeq] = useState<number | null>(null);
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/recorder/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setD(await r.json());
    } catch (e) { setErr((e as Error).message); }
  }, [sessionId]);
  useEffect(() => { load(); }, [load]);
  useFeed((ev) => { if ((ev.data as LogEntry)?.sessionId === sessionId) load(); }, ["log"]);
  useEffect(() => {
    const m = typeof window !== "undefined" && window.location.hash.match(/seq-(\d+)/);
    if (m && d) {
      const n = Number(m[1]);
      setOpen((o) => new Set(o).add(n));
      setTimeout(() => document.getElementById(`seq-${n}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
    }
  }, [d]);

  async function tamper() {
    if (!d?.entries.length) return;
    // Pick the most incriminating entry: guardian verdict / add_to_cart, else the middle one.
    const target = d.entries.find((e) => e.action === "guardian_verdict") ?? d.entries.find((e) => e.action === "add_to_cart") ?? d.entries[Math.floor(d.entries.length / 2)];
    setBusy(true);
    const patch = target.action === "guardian_verdict" ? { decision: "approve", reasons: [], tamperedBy: "someone covering their tracks" } : { qty: 1, tamperedBy: "someone covering their tracks" };
    await fetch("/api/recorder/tamper", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seq: target.seq, patch }) });
    setTamperSeq(target.seq);
    setShake(true); setTimeout(() => setShake(false), 600);
    await load();
    setBusy(false);
  }

  if (err) return <div className="rounded-xl bg-rose-500/10 p-4 text-rose-300">Failed to load: {err}</div>;
  if (!d) return <div className="h-40 animate-pulse rounded-2xl bg-white/[0.03]" />;
  const v = d.verify;
  const task = d.session?.task;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`flex items-center gap-4 rounded-2xl border p-5 lg:col-span-2 ${v.valid ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-rose-500/40 bg-rose-500/[0.08]"} ${shake ? "shake" : ""}`}>
          <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-3xl font-bold ${v.valid ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>{v.valid ? "✓" : "✗"}</div>
          <div className="min-w-0 flex-1">
            <div className={`text-xl font-semibold ${v.valid ? "text-emerald-200" : "text-rose-200"}`}>
              {v.length === 0 ? "No entries" : v.valid ? "Chain verified ✓" : `BROKEN at #${v.brokenAt} ✗`}
            </div>
            <div className="mt-0.5 text-sm text-zinc-400">
              {v.valid ? `${v.length} entries · each SHA-256 hash commits to the previous one — any edit to history is detectable.` : `${v.reason}. Entry #${v.brokenAt} no longer matches its recorded hash; claims on this session are denied pending investigation.`}
            </div>
          </div>
          <button onClick={tamper} disabled={busy || !d.entries.length} className="shrink-0 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-200 hover:bg-rose-500/20 disabled:opacity-40">
            {busy ? "Tampering…" : "Tamper (demo)"}
          </button>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-sm">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">Task</div>
          <div className="mt-1 text-zinc-200">{task?.instruction ?? "—"}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400">
            {task && <span>budget {money(task.budget)}</span>}
            {d.session && <Link className="font-mono hover:text-white" href={`/agents/${encodeURIComponent(d.session.agentId)}`}>{d.session.agentId}</Link>}
            {d.transaction && <Chip status={d.transaction.status}>{d.transaction.status} · {money(d.transaction.amount)}</Chip>}
            {d.claims.map((c) => <Chip key={c.id} status={c.status}>claim {c.status.replace(/_/g, " ")}</Chip>)}
          </div>
          {d.transaction && d.transaction.status !== "blocked" && !d.claims.length && (
            <Link href={`/claims?tx=${d.transaction.id}`} className="mt-3 inline-block text-xs text-emerald-300 hover:underline">File a claim on this transaction →</Link>
          )}
        </div>
      </div>

      <ol className="relative ml-5 border-l border-white/10">
        {d.entries.map((e, idx) => {
          const broken = !v.valid && v.brokenAt !== undefined && e.seq >= v.brokenAt;
          const isBreak = v.brokenAt === e.seq;
          const ic = ICON[e.actor] ?? ICON.system;
          const prev = d.entries[idx - 1];
          const linkOk = idx === 0 ? e.prevHash === "GENESIS" : prev?.hash === e.prevHash;
          return (
            <li key={e.seq} id={`seq-${e.seq}`} className="relative mb-3 pl-8">
              <span className={`absolute -left-[17px] top-2 grid h-8 w-8 place-items-center rounded-full bg-[#07090d] text-[10px] font-bold ring-1 ${ic.c} ${isBreak ? "ring-2 ring-rose-500" : ""}`}>{ic.i}</span>
              <div
                onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(e.seq)) n.delete(e.seq); else n.add(e.seq); return n; })}
                className={`cursor-pointer rounded-xl border px-4 py-2.5 transition-colors ${isBreak ? "border-rose-500/60 bg-rose-500/[0.08]" : broken ? "border-rose-500/20 bg-rose-500/[0.03]" : tamperSeq === e.seq ? "border-amber-500/40" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.035]"}`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-zinc-500">#{e.seq}</span>
                  <span className="text-xs uppercase tracking-wider text-zinc-500">{e.actor}</span>
                  <span className="text-sm font-medium text-zinc-100">{e.action}</span>
                  {isBreak && <Chip status="broken">tampered</Chip>}
                  <span className="ml-auto font-mono text-[11px] text-zinc-600">{new Date(e.ts).toLocaleTimeString()}</span>
                </div>
                <div className="mt-1 truncate text-sm text-zinc-400">{summary(e)}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[10.5px]">
                  <span className={linkOk ? "text-zinc-600" : "text-rose-400"}>prev {shortHash(e.prevHash)}</span>
                  <span className="text-zinc-700">→</span>
                  <span className={isBreak ? "text-rose-400 line-through" : broken ? "text-rose-300/50" : "text-emerald-400/70"}>hash {shortHash(e.hash)}</span>
                </div>
                {open.has(e.seq) && (
                  <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-black/50 p-3 text-[11px] leading-relaxed text-zinc-300">{JSON.stringify(e.payload, null, 2)}</pre>
                )}
              </div>
            </li>
          );
        })}
        {d.entries.length === 0 && <li className="pl-8 text-sm text-zinc-500">No entries for this session.</li>}
      </ol>
    </div>
  );
}
