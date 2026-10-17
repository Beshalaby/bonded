import Link from "next/link";
import type { ReactNode } from "react";
import type { GuardianDecision, TrapType } from "@/lib/types";
import { trapLabel } from "@/lib/ui/format";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ layout */

export function PageHeader({
  title, description, eyebrow, actions, meta,
}: { title: ReactNode; description?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <div className="mb-2 text-[13px] text-zinc-500">{eyebrow}</div>}
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-zinc-900">{title}</h1>
        {description && <p className="mt-2 text-[15px] leading-relaxed text-zinc-600">{description}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-zinc-500">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({
  title, description, actions, children, className,
}: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("mt-12 first:mt-0", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            {title && <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-zinc-900">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-zinc-500">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 text-[13px]">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <div className={cx("rounded-lg border border-zinc-200 bg-white", padded && "p-5", className)}>{children}</div>
  );
}

export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h3 className="text-[14px] font-semibold text-zinc-900">{children}</h3>
      {aside && <div className="text-[12px] text-zinc-500">{aside}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ stat */

export function Stat({
  label, value, sub, tone, className,
}: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" | "warn"; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <div className="text-[12px] text-zinc-500">{label}</div>
      <div className={cx(
        "mt-1 text-[22px] font-semibold leading-none tracking-[-0.02em]",
        tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : tone === "warn" ? "text-amber-700" : "text-zinc-900",
      )}>{value}</div>
      {sub && <div className="mt-1.5 text-[12px] leading-snug text-zinc-500">{sub}</div>}
    </div>
  );
}

/** A row of stats separated by hairlines, in one bordered strip. */
export function StatStrip({ children, cols = 4 }: { children: ReactNode; cols?: number }) {
  const grid: Record<number, string> = {
    3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4", 5: "sm:grid-cols-3 lg:grid-cols-5", 6: "sm:grid-cols-3 lg:grid-cols-6",
  };
  return (
    <div className={cx("grid grid-cols-2 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 gap-px", grid[cols])}>
      {Array.isArray(children)
        ? children.map((c, i) => <div key={i} className="bg-white px-5 py-4">{c}</div>)
        : <div className="bg-white px-5 py-4">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ badges */

type Tone = "neutral" | "good" | "bad" | "warn" | "accent" | "outline";
const TONES: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-700",
  good: "bg-emerald-50 text-emerald-700",
  bad: "bg-rose-50 text-rose-700",
  warn: "bg-amber-50 text-amber-700",
  accent: "bg-accent-soft text-accent",
  outline: "border border-zinc-200 text-zinc-600 bg-white",
};

export function Badge({ children, tone = "neutral", className, title }: { children: ReactNode; tone?: Tone; className?: string; title?: string }) {
  return (
    <span title={title} className={cx(
      "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 text-[11.5px] font-medium leading-none",
      TONES[tone], className,
    )}>{children}</span>
  );
}

export function Dot({ tone }: { tone: "good" | "bad" | "warn" | "neutral" | "accent" }) {
  const c = { good: "bg-emerald-500", bad: "bg-rose-500", warn: "bg-amber-500", neutral: "bg-zinc-400", accent: "bg-accent" }[tone];
  return <span className={cx("inline-block size-1.5 shrink-0 rounded-full", c)} />;
}

export function ProviderBadge({ provider, simulated }: { provider?: string; simulated?: boolean }) {
  if (simulated || provider === "Simulated") return <Badge tone="outline" title="Scripted agent with a fixed policy, used to calibrate the benchmark">Simulated</Badge>;
  if (!provider) return null;
  return <Badge tone="outline">{provider}</Badge>;
}

export type Outcome = "success" | "scammed" | "failed" | "no_purchase" | "over_budget" | "wrong_item" | "error";

export function outcomeOf(r: { success: boolean; scammed?: boolean; overBudget?: boolean; wrongItem?: boolean; bought?: boolean; error?: string; attribution?: { mode: string } }): Outcome {
  if (r.success) return "success";
  if (r.error) return "error";
  if (r.scammed) return "scammed";
  if (r.overBudget) return "over_budget";
  if (r.wrongItem) return "wrong_item";
  if (r.bought === false || r.attribution?.mode === "no_purchase") return "no_purchase";
  return "failed";
}

const OUTCOME: Record<Outcome, { label: string; tone: Tone }> = {
  success: { label: "Pass", tone: "good" },
  scammed: { label: "Scammed", tone: "bad" },
  failed: { label: "Fail", tone: "bad" },
  over_budget: { label: "Over budget", tone: "bad" },
  wrong_item: { label: "Wrong item", tone: "warn" },
  no_purchase: { label: "No purchase", tone: "neutral" },
  error: { label: "Error", tone: "neutral" },
};

export function OutcomeBadge({ outcome, className }: { outcome: Outcome; className?: string }) {
  const o = OUTCOME[outcome];
  return <Badge tone={o.tone} className={className}>{o.label}</Badge>;
}

export function TrapBadge({ type, prefix = true }: { type: TrapType | string; prefix?: boolean }) {
  return <Badge tone="bad">{prefix ? "Trap: " : ""}{trapLabel(type).toLowerCase().replace(/^./, (c) => (prefix ? c : c.toUpperCase()))}</Badge>;
}

export function GuardrailBadge({ decision }: { decision?: GuardianDecision }) {
  if (!decision) return null;
  const t: Record<GuardianDecision, Tone> = { approve: "good", ask: "warn", block: "bad" };
  const l: Record<GuardianDecision, string> = { approve: "Approve", ask: "Flag", block: "Block" };
  return <Badge tone={t[decision]}>{l[decision]}</Badge>;
}

export function RunStatusBadge({ status }: { status: string }) {
  if (status === "running")
    return <Badge tone="accent"><span className="pulse-dot inline-block size-1.5 rounded-full bg-accent" />Running</Badge>;
  if (status === "completed") return <Badge tone="good">Completed</Badge>;
  if (status === "failed") return <Badge tone="bad">Failed</Badge>;
  return <Badge>Queued</Badge>;
}

/* ------------------------------------------------------------------ buttons & links */

export function ButtonLink({ href, children, variant = "primary", className }: { href: string; children: ReactNode; variant?: "primary" | "secondary"; className?: string }) {
  return <Link href={href} className={cx(buttonClass(variant), className)}>{children}</Link>;
}

export function buttonClass(variant: "primary" | "secondary" | "ghost" = "primary") {
  const base = "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  if (variant === "primary") return cx(base, "bg-accent text-white hover:bg-accent-hover");
  if (variant === "secondary") return cx(base, "border border-zinc-200 bg-white text-zinc-800 shadow-sm hover:bg-zinc-50");
  return cx(base, "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900");
}

export function TextLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return <Link href={href} className={cx("text-accent hover:underline underline-offset-2", className)}>{children}</Link>;
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[12.5px]", className)}>{children}</span>;
}

/* ------------------------------------------------------------------ table */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto rounded-lg border border-zinc-200 bg-white", className)}>
      <table className="w-full border-collapse text-[13.5px]">{children}</table>
    </div>
  );
}

export function Th({
  children, align = "left", className, onClick, sorted, title,
}: { children?: ReactNode; align?: "left" | "right" | "center"; className?: string; onClick?: () => void; sorted?: "asc" | "desc" | false; title?: string }) {
  const a = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const inner = onClick ? (
    <button type="button" onClick={onClick} title={title}
      className={cx("inline-flex items-center gap-1 hover:text-zinc-900", align === "right" && "flex-row-reverse", sorted && "text-zinc-900")}>
      {children}
      <span className={cx("text-[10px]", sorted ? "opacity-100" : "opacity-0")}>{sorted === "asc" ? "▲" : "▼"}</span>
    </button>
  ) : <span title={title}>{children}</span>;
  return (
    <th className={cx("h-9 whitespace-nowrap border-b border-zinc-200 bg-zinc-50/60 px-2.5 text-[12px] font-medium text-zinc-500 first:pl-4 last:pr-4", a, className)}>
      {inner}
    </th>
  );
}

export function Td({ children, align = "left", className, mono }: { children?: ReactNode; align?: "left" | "right" | "center"; className?: string; mono?: boolean }) {
  const a = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <td className={cx("h-11 border-b border-zinc-100 px-2.5 align-middle first:pl-4 last:pr-4 tnum", a, mono && "font-mono text-[12.5px]", className)}>
      {children}
    </td>
  );
}

export function Tr({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <tr onClick={onClick} className={cx("transition-colors hover:bg-zinc-50 [&:last-child>td]:border-b-0", onClick && "cursor-pointer", className)}>
      {children}
    </tr>
  );
}

/* ------------------------------------------------------------------ states */

export function EmptyState({ title, description, action, icon, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 text-zinc-400">{icon}</div>}
      <div className="text-[14px] font-medium text-zinc-900">{title}</div>
      {description && <div className="mt-1 max-w-md text-[13px] text-zinc-500">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
      <span>Couldn’t load data: {error}</span>
      {onRetry && <button onClick={onRetry} className="font-medium underline underline-offset-2">Retry</button>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-zinc-100", className)} />;
}

export function LoadingBlock({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10" />)}
    </div>
  );
}

/* ------------------------------------------------------------------ misc */

export function Chip({ active, children, onClick, count }: { active?: boolean; children: ReactNode; onClick?: () => void; count?: number }) {
  return (
    <button type="button" onClick={onClick}
      className={cx(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] transition-colors",
        active ? "border-accent bg-accent-soft text-accent" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
      )}>
      {children}
      {count != null && <span className={cx("tnum text-[11.5px]", active ? "text-accent/70" : "text-zinc-400")}>{count}</span>}
    </button>
  );
}

export function Select({ value, onChange, children, className, label }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string; label?: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
      className={cx("h-8 rounded-md border border-zinc-200 bg-white pl-2.5 pr-7 text-[13px] text-zinc-800 shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/15", className)}>
      {children}
    </select>
  );
}

export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[13px]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-zinc-500">{k}</dt>
          <dd className="min-w-0 text-zinc-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressBar({ done, total, className }: { done: number; total: number; className?: string }) {
  const p = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-zinc-100", className)}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${p * 100}%` }} />
    </div>
  );
}

export function Breadcrumb({ items }: { items: { label: ReactNode; href?: string }[] }) {
  return (
    <nav className="mb-3 flex items-center gap-1.5 text-[13px] text-zinc-500">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-zinc-300">/</span>}
          {it.href ? <Link href={it.href} className="hover:text-zinc-900">{it.label}</Link> : <span className="text-zinc-700">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type="search"
      className={cx("h-8 rounded-md border border-zinc-200 bg-white px-2.5 text-[13px] shadow-sm outline-none placeholder:text-zinc-400 focus:border-accent focus:ring-2 focus:ring-accent/15", className)} />
  );
}
