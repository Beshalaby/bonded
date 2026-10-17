import Link from "next/link";
import type { ReactNode } from "react";

export const money = (n: number | undefined | null, digits = 2) =>
  n == null || Number.isNaN(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const compactMoney = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `$${(n / 1e3).toFixed(1)}k` : money(n, n >= 1000 ? 0 : 2);
export const pct = (n: number | undefined | null, digits = 0) => (n == null || Number.isNaN(n) ? "—" : `${(n * 100).toFixed(digits)}%`);
export const shortHash = (h?: string) => (!h ? "—" : h === "GENESIS" ? "GENESIS" : `${h.slice(0, 6)}…${h.slice(-4)}`);

export function timeAgo(iso?: string) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function Card({ title, subtitle, action, children, className = "", pad = true }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.035] to-white/[0.015] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.05] px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone = "default" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "default" | "good" | "bad" | "warn" }) {
  const color = { default: "text-white", good: "text-emerald-300", bad: "text-rose-300", warn: "text-amber-300" }[tone];
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold tabular tracking-tight ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500 tabular">{sub}</div>}
    </div>
  );
}

const CHIP: Record<string, string> = {
  approved: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  approve: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  paid: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  blocked: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  block: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  held: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  ask: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  denied: "bg-zinc-500/10 text-zinc-300 ring-zinc-500/30",
  routed_to_merchant: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
  open: "bg-violet-500/10 text-violet-300 ring-violet-500/30",
  agent: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  user: "bg-zinc-500/10 text-zinc-300 ring-zinc-500/30",
  merchant: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
  valid: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  broken: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
};
export function Chip({ status, children }: { status: string; children?: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${CHIP[status] ?? "bg-white/5 text-zinc-300 ring-white/10"}`}>
      {children ?? status.replace(/_/g, " ")}
    </span>
  );
}

export function TrustBar({ score, lower, upper, width = "w-40" }: { score: number; lower: number; upper: number; width?: string }) {
  const color = score >= 0.85 ? "bg-emerald-400" : score >= 0.65 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div className={`relative h-2 ${width} rounded-full bg-white/[0.06]`} title={`90% band ${pct(lower)}–${pct(upper)}`}>
        <div className="absolute inset-y-0 rounded-full bg-white/15" style={{ left: `${lower * 100}%`, width: `${Math.max(1, (upper - lower) * 100)}%` }} />
        <div className={`absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full ${color} shadow`} style={{ left: `calc(${score * 100}% - 2px)` }} />
      </div>
      <span className="w-10 text-right text-xs tabular text-zinc-300">{pct(score)}</span>
    </div>
  );
}

export function Empty({ children, cta }: { children: ReactNode; cta?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 px-6 py-10 text-center text-sm text-zinc-500">
      <div>{children}</div>
      {cta && (
        <Link href={cta.href} className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25">
          {cta.label}
        </Link>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
