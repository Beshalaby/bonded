"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Claim } from "@/lib/types";
import ClaimCard from "./ClaimCard";

export interface TxOption { id: string; label: string; status: string }

export default function ClaimForm({ transactions, defaultTx }: { transactions: TxOption[]; defaultTx?: string }) {
  const router = useRouter();
  const [tx, setTx] = useState(defaultTx ?? transactions[0]?.id ?? "");
  const [complaint, setComplaint] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Claim | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tx) return;
    setBusy(true); setErr(null); setResult(null);
    try {
      const r = await fetch("/api/claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionId: tx, complaint }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setResult(j);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-zinc-400">Transaction</span>
        <select value={tx} onChange={(e) => setTx(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/50">
          {transactions.length === 0 && <option value="">No transactions yet</option>}
          {transactions.map((t) => <option key={t.id} value={t.id}>[{t.status}] {t.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-medium text-zinc-400">What went wrong?</span>
        <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={3} placeholder="e.g. I asked for size M and the agent bought size XL." className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-emerald-500/50" />
      </label>
      <button disabled={busy || !tx} className="w-full rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-300 disabled:opacity-40">
        {busy ? "Adjuster reviewing flight recorder…" : "File claim"}
      </button>
      {err && <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{err}</div>}
      {result && <ClaimCard claim={result} />}
    </form>
  );
}
