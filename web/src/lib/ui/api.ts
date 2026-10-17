"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BenchResult, EvalRun, LogEntry, ModelStats, Product, RedTeamScam, Session,
} from "@/lib/types";

export interface Task {
  id: string;
  instruction: string;
  budget: number;
  constraints?: Record<string, string | number>;
  expected?: unknown;
  tags: string[];
  adversarial: boolean;
  baseTaskId?: string;
}

export interface LeaderboardResponse {
  rows: ModelStats[];
  totals: { models: number; tasks: number; results: number; runs: number; scams: number; trapListings: number };
  updatedAt: string;
}
export interface ModelResponse {
  stats: ModelStats;
  results: BenchResult[];
  failures: BenchResult[];
  history: { runId: string; createdAt: string; score: number; successRate: number }[];
}
export interface RunsResponse { runs: EvalRun[] }
export interface RunResponse { run: EvalRun; results: BenchResult[]; leaderboard: ModelStats[] }
export interface TasksResponse { tasks: Task[]; tags: { tag: string; count: number }[] }
export interface TaskResponse { task: Task; results: BenchResult[] }
export interface TraceSummary {
  sessionId: string; model: string; taskId?: string; runId?: string; instruction: string;
  createdAt: string; steps: number; outcome: "success" | "failed" | "no_purchase" | "ungraded"; amount?: number;
}
export interface TracesResponse { traces: TraceSummary[] }
export interface TraceResponse {
  session: Session;
  entries: LogEntry[];
  integrity: { valid: boolean; length: number; brokenAt?: number; reason?: string };
  result?: BenchResult;
  products: Record<string, Product>;
}
export interface RedTeamResponse {
  scams: RedTeamScam[];
  growth: { ts: string; tasks: number }[];
  byTrap: { trapType: string; count: number; fooledModels: number | string[] }[];
  running?: boolean;
  last?: unknown;
}

export interface BankWallet {
  agentId: string; model: string; displayName: string; accountLast4: string;
  balance: number; balanceSource: "nessie" | "ledger"; purchases: number; spent: number; funded: number;
}
export interface BankResponse { provider: "capital_one_nessie" | "simulated_ledger"; simulated: boolean; live: boolean; wallets: BankWallet[] }
export interface BankPurchase { id: string; merchantId: string; merchantName: string; amount: number; date: string; status?: string; description: string; sessionId?: string }
export interface BankWalletResponse { provider: string; simulated: boolean; live: boolean; wallet: BankWallet; purchases: BankPurchase[]; source: "nessie" | "ledger" }

export async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try { const j = await r.json(); if (j?.error) msg = String(j.error); } catch {}
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

export async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error ? String(j.error) : `${r.status} ${r.statusText}`);
  return j as T;
}

/** Fetch JSON from the API; `reload()` refetches while keeping the previous data on screen. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!url) return;
    const my = ++seq.current;
    setLoading(true);
    try {
      const d = await getJSON<T>(url);
      if (my === seq.current) { setData(d); setError(undefined); }
    } catch (e) {
      if (my === seq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload };
}
