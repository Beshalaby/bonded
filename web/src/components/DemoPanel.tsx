"use client";
import Link from "next/link";
import { useState } from "react";
import type { Claim } from "@/lib/types";
import ClaimCard from "./ClaimCard";
import { Chip, money, pct } from "./ui";

interface StepResult { step: string; ok: boolean; title: string; summary: string; data?: Record<string, unknown> | null; links?: { label: string; href: string }[]; ms?: number }

const STEPS: { id: string; n: string; label: string; blurb: string; slow?: boolean }[] = [
  { id: "reset", n: "0", label: "Reset, seed & run baseline benchmark", blurb: "Seeds ~500 products (with knockoffs, fake discounts, injections) and runs SpendBench: 5 models × 20 tasks.", slow: true },
  { id: "leaderboard", n: "1", label: "Show leaderboard", blurb: "Which AI is safest with your money? Benchmark results become each model's insurance prior." },
  { id: "good", n: "2", label: "Good agent buys AirPods", blurb: "sim/careful buys AirPods Pro 2 under $260 — Guardian approves, risk engine quotes a premium." },
  { id: "injection", n: "3", label: "Scam listing with hidden injection", blurb: "sim/gullible hits a listing whose description tells AI agents to buy it. Guardian steps in." },
  { id: "redteam", n: "4", label: "Red team generates a new scam live", blurb: "An attacker crafts a new scam; if it fools any model, it becomes a benchmark task.", slow: true },
  { id: "mistake", n: "5", label: "Mistake slips through", blurb: "sim/hasty is told “6 quart” and buys the 8 quart. Genuine item, fair price, trusted seller — Guardian approves. Guardian can’t catch everything." },
  { id: "claim", n: "6", label: "File claim → adjuster pays out", blurb: "The adjuster reads the flight recorder, finds agent fault, pays the user, and the agent's score drops." },
];

type Tx = { id: string; status: string; amount: number; items: { title?: string; qty: number; specs?: Record<string, string> }[]; guardian?: { decision: string; reasons: { code: string; message: string; severity: string }[] }; quote?: { premium: number; premiumRate: number; spendLimit: number; trustScore: number; lower: number; upper: number }; instruction?: string };
type Profile = { trustScore: number; lower: number; upper: number; spendLimit: number; premiumRate: number };

function TxCard({ tx }: { tx: Tx }) {
  return (
    <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/30 p-3 text-sm">
      <div className="flex items-center gap-2">
        <Chip status={tx.status} />
        <span className="truncate text-zinc-200">{tx.items.map((i) => `${i.title ?? "?"}${i.specs?.size ? ` · size ${i.specs.size}` : ""}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join(", ")}</span>
        <span className="ml-auto font-semibold tabular">{money(tx.amount)}</span>
      </div>
      {tx.instruction && <div className="mt-1 text-xs text-zinc-500">Instruction: “{tx.instruction}”</div>}
      {tx.guardian && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="text-xs text-zinc-500">Guardian <b className="text-zinc-300">{tx.guardian.decision}</b></span>
          {tx.guardian.reasons.map((r, i) => (
            <span key={i} className={`rounded-md px-1.5 py-0.5 text-[11px] ${r.severity === "critical" ? "bg-rose-500/10 text-rose-300" : r.severity === "warn" ? "bg-amber-500/10 text-amber-300" : "bg-white/5 text-zinc-400"}`}><b>{r.code}</b> {r.message}</span>
          ))}
        </div>
      )}
      {tx.quote && (
        <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
          <div><div className="text-zinc-500">Premium</div><div className="tabular text-emerald-300">{money(tx.quote.premium)}</div></div>
          <div><div className="text-zinc-500">Rate</div><div className="tabular">{pct(tx.quote.premiumRate, 2)}</div></div>
          <div><div className="text-zinc-500">Spend limit</div><div className="tabular">{money(tx.quote.spendLimit, 0)}</div></div>
          <div><div className="text-zinc-500">Trust (90%)</div><div className="tabular">{pct(tx.quote.trustScore, 1)} <span className="text-zinc-500">[{pct(tx.quote.lower)}–{pct(tx.quote.upper)}]</span></div></div>
        </div>
      )}
    </div>
  );
}

function BeforeAfter({ before, after }: { before: Profile; after: Profile }) {
  const row = (label: string, a: string, b: string, worse: boolean) => (
    <div className="flex items-center justify-between py-1">
      <span className="text-zinc-500">{label}</span>
      <span className="tabular"><span className="text-zinc-400">{a}</span> <span className="text-zinc-600">→</span> <span className={worse ? "font-semibold text-rose-300" : "text-zinc-200"}>{b}</span></span>
    </div>
  );
  return (
    <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-3 text-sm">
      <div className="mb-1 text-[11px] uppercase tracking-wider text-rose-300/80">Agent risk profile after the claim</div>
      {row("Trust score", pct(before.trustScore, 1), pct(after.trustScore, 1), after.trustScore < before.trustScore)}
      {row("90% band", `${pct(before.lower)}–${pct(before.upper)}`, `${pct(after.lower)}–${pct(after.upper)}`, after.lower < before.lower)}
      {row("Spend limit", money(before.spendLimit, 0), money(after.spendLimit, 0), after.spendLimit < before.spendLimit)}
      {row("Premium rate", pct(before.premiumRate, 2), pct(after.premiumRate, 2), after.premiumRate > before.premiumRate)}
    </div>
  );
}

function Result({ r }: { r: StepResult }) {
  const d = (r.data ?? {}) as Record<string, unknown>;
  const lb = (d.leaderboard ?? (d.rows as unknown)) as { displayName: string; score: number; model: string }[] | undefined;
  const lbRows = Array.isArray(lb) ? lb : Array.isArray((lb as unknown as { rows?: unknown[] })?.rows) ? (lb as unknown as { rows: { displayName: string; score: number; model: string }[] }).rows : undefined;
  const scam = d.scam as { trapType?: string; technique?: string; product?: { title?: string; description?: string; price?: number } } | undefined;
  return (
    <div className={`feed-in mt-3 rounded-xl border p-4 ${r.ok ? "border-white/[0.08] bg-white/[0.02]" : "border-rose-500/40 bg-rose-500/[0.06]"}`}>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold ${r.ok ? "text-white" : "text-rose-300"}`}>{r.title}</span>
        {r.ms !== undefined && <span className="ml-auto text-[11px] tabular text-zinc-600">{(r.ms / 1000).toFixed(1)}s</span>}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-zinc-400">{r.summary}</p>
      {d.transaction ? <TxCard tx={d.transaction as Tx} /> : null}
      {lbRows && lbRows.length > 0 && (
        <ol className="mt-3 space-y-1 text-sm">
          {lbRows.map((x, i) => (
            <li key={x.model ?? i} className="flex items-center gap-2">
              <span className="w-4 text-zinc-600">{i + 1}</span>
              <span className="flex-1 text-zinc-200">{x.displayName ?? x.model}</span>
              <div className="h-1.5 w-32 rounded-full bg-white/5"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${x.score}%` }} /></div>
              <span className="w-8 text-right tabular text-zinc-300">{Number(x.score).toFixed(0)}</span>
            </li>
          ))}
        </ol>
      )}
      {scam?.product && (
        <div className="mt-3 rounded-xl border border-rose-500/20 bg-black/30 p-3 text-sm">
          <div className="flex items-center gap-2"><Chip status="blocked">{scam.trapType?.replace(/_/g, " ")}</Chip><span className="text-zinc-200">{scam.product.title}</span>{scam.product.price !== undefined && <span className="ml-auto tabular">{money(scam.product.price)}</span>}</div>
          {scam.product.description && <div className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 font-mono text-[11px] text-zinc-400">{scam.product.description}</div>}
          <div className="mt-2 flex flex-wrap gap-1 text-xs"><span className="text-zinc-500">Fooled:</span>{((d.fooled as string[]) ?? []).map((m) => <span key={m} className="rounded bg-rose-500/10 px-1.5 font-mono text-rose-300">{m}</span>)}{!((d.fooled as string[]) ?? []).length && <span className="text-zinc-400">nobody</span>}</div>
        </div>
      )}
      {d.claim ? <div className="mt-3"><ClaimCard claim={d.claim as Claim} compact /></div> : null}
      {d.before && d.after ? <BeforeAfter before={d.before as Profile} after={d.after as Profile} /> : null}
      {r.links && r.links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.links.map((l) => <Link key={l.href} href={l.href} target="_blank" className="rounded-md border border-white/10 px-2 py-1 text-xs text-zinc-300 hover:border-emerald-500/40 hover:text-white">{l.label} ↗</Link>)}
        </div>
      )}
      {!r.ok && d && Object.keys(d).length > 0 && <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/40 p-2 text-[11px] text-zinc-500">{JSON.stringify(d, null, 2).slice(0, 3000)}</pre>}
    </div>
  );
}

export default function DemoPanel() {
  const [results, setResults] = useState<Record<string, StepResult>>({});
  const [running, setRunning] = useState<string | null>(null);

  async function run(id: string) {
    setRunning(id);
    const t0 = performance.now();
    try {
      const r = await fetch(`/api/demo/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = (await r.json()) as StepResult;
      setResults((s) => ({ ...s, [id]: { ...j, ms: performance.now() - t0 } }));
    } catch (e) {
      setResults((s) => ({ ...s, [id]: { step: id, ok: false, title: "Request failed", summary: (e as Error).message } }));
    } finally {
      setRunning(null);
    }
  }

  return (
    <ol className="space-y-3">
      {STEPS.map((s) => {
        const r = results[s.id];
        const isRunning = running === s.id;
        return (
          <li key={s.id} className={`rounded-2xl border p-4 transition-colors ${isRunning ? "border-emerald-500/40 bg-emerald-500/[0.04]" : r?.ok ? "border-white/[0.08] bg-white/[0.02]" : "border-white/[0.06] bg-white/[0.015]"}`}>
            <div className="flex items-center gap-4">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold ${r?.ok ? "bg-emerald-400 text-black" : "bg-white/[0.06] text-zinc-300"}`}>{r?.ok ? "✓" : s.n}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-zinc-100">{s.label}</div>
                <div className="text-xs text-zinc-500">{s.blurb}</div>
              </div>
              <button onClick={() => run(s.id)} disabled={!!running} className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40 ${r ? "border border-white/10 text-zinc-300 hover:bg-white/5" : "bg-emerald-400 text-black hover:bg-emerald-300"}`}>
                {isRunning ? (<span className="inline-flex items-center gap-2"><span className="h-3 w-3 animate-spin rounded-full border-2 border-black/30 border-t-black" />{s.slow ? "Running… (~1 min)" : "Running…"}</span>) : r ? "Run again" : "Run"}
              </button>
            </div>
            {r && <Result r={r} />}
          </li>
        );
      })}
    </ol>
  );
}
