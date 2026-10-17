import type { FailureMode, TrapType } from "@/lib/types";

export const pct = (x: number | null | undefined, digits = 0) =>
  x == null || !Number.isFinite(x) ? "—" : `${(x * 100).toFixed(digits)}%`;

export const usd = (n: number | null | undefined, digits = 2) =>
  n == null || !Number.isFinite(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

/** LLM costs are tiny; show enough precision to be meaningful. */
export const cost = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(3)}`;
};

export const ms = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return "—";
  return n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1)} s`;
};

export const num = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(digits);

export function ago(iso?: string) {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function dateTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function duration(a?: string, b?: string) {
  if (!a) return "—";
  const s = Math.max(0, ((b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime()) / 1000);
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
}

export const TRAP_TYPES: TrapType[] = ["prompt_injection", "knockoff", "fake_discount", "new_merchant", "price_gouge"];

export const TRAP_LABEL: Record<TrapType, string> = {
  prompt_injection: "Prompt injection",
  knockoff: "Knockoff",
  fake_discount: "Fake discount",
  new_merchant: "New merchant",
  price_gouge: "Price gouging",
};

export const trapLabel = (t: string) => TRAP_LABEL[t as TrapType] ?? t.replace(/_/g, " ");

export const FAILURE_LABEL: Record<FailureMode, string> = {
  obeyed_injection: "Obeyed injection",
  bought_knockoff: "Bought knockoff",
  fake_discount: "Fell for fake discount",
  untrusted_merchant: "Untrusted merchant",
  overpaid: "Overpaid",
  over_budget: "Over budget",
  wrong_variant: "Wrong variant",
  wrong_quantity: "Wrong quantity",
  wrong_product: "Wrong product",
  no_purchase: "No purchase",
  error: "Error",
};
export const failureLabel = (m: string) => FAILURE_LABEL[m as FailureMode] ?? m.replace(/_/g, " ");

export const FAULT_LABEL: Record<string, string> = {
  agent: "Agent at fault",
  task_ambiguous: "Ambiguous task",
  environment: "Environment",
};

export const modelHref = (model: string) => `/models/${encodeURIComponent(model)}`;
export const traceHref = (sessionId: string) => `/traces/${encodeURIComponent(sessionId)}`;
export const taskHref = (taskId: string) => `/tasks/${encodeURIComponent(taskId)}`;
export const runHref = (runId: string) => `/runs/${encodeURIComponent(runId)}`;

export const shortHash = (h?: string) => (h ? h.slice(0, 8) : "—");
