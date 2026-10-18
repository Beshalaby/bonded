// Shared page primitives, restyled on the "soft instrument" system (src/design/README.md).
// Every export name and prop here is load-bearing for 15+ pages: change the look, never the contract.
// New work should reach for src/design (Tile, Pill, CapsuleRow, MicroLabel, ...) directly.
import Link from "next/link";
import type { ReactNode } from "react";
import type { GuardianDecision, TrapType } from "@/lib/types";
import { trapLabel } from "@/lib/ui/format";
import { HeroPanel, type HeroTone } from "./HeroPanel";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ layout */

export function PageHeader({
  title, description, eyebrow, actions, meta, tone = "gold", art = true,
}: { title: ReactNode; description?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; meta?: ReactNode; tone?: HeroTone; art?: boolean }) {
  return (
    <HeroPanel tone={tone} art={art} inner="py-12 sm:py-16">
      <header className="min-w-0 max-w-[680px]">
        {eyebrow && (
          <div className="hero-rise mb-5 inline-flex items-center rounded-full bg-white/55 px-3 py-1 text-[12px] font-medium uppercase tracking-[0.14em] text-ink-2 shadow-[inset_0_0_0_1px_oklch(100%_0_0/0.6)] backdrop-blur-md">
            {eyebrow}
          </div>
        )}
        <h1 className="hero-rise font-[600] leading-[0.98] tracking-[-0.05em] text-ink [font-size:clamp(40px,6vw,80px)] [text-wrap:balance]" style={{ ["--d" as string]: "0.06s" }}>{title}</h1>
        {description && <p className="hero-rise mt-5 max-w-[56ch] text-[16px] leading-[1.6] text-ink-2 [text-wrap:pretty] sm:text-[17px]" style={{ ["--d" as string]: "0.16s" }}>{description}</p>}
        {meta && <div className="hero-rise mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-2" style={{ ["--d" as string]: "0.24s" }}>{meta}</div>}
        {actions && <div className="hero-rise mt-7 flex flex-wrap items-center gap-2" style={{ ["--d" as string]: "0.3s" }}>{actions}</div>}
      </header>
    </HeroPanel>
  );
}

export function Section({
  title, description, actions, children, className,
}: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("mt-16 first:mt-0 sm:mt-20", className)}>
      {(title || actions) && (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            {title && <h2 className="text-[22px] font-[560] leading-tight tracking-[-0.025em] text-ink">{title}</h2>}
            {description && <p className="mt-1.5 max-w-[720px] text-[13.5px] leading-relaxed text-ink-3">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 text-[13px] max-sm:min-w-0 max-sm:max-w-full max-sm:flex-wrap">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** A tile: white, radius 24, lifted by layered shadow. `padded` = 24px (nested radius for children: 0–8px). */
export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <div className={cx("rounded-[24px] bg-surface shadow-tile", padded && "p-6 max-sm:p-5", className)}>{children}</div>
  );
}

export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h3 className="text-[15px] font-[560] tracking-[-0.015em] text-ink">{children}</h3>
      {aside && <div className="text-[12px] text-ink-3">{aside}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ stat */

export function Stat({
  label, value, sub, tone, className,
}: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" | "warn"; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <div className="micro">{label}</div>
      <div className={cx(
        "mt-2 text-[30px] font-light leading-none tracking-[-0.035em] tabular-nums",
        tone === "good" ? "text-pass-ink" : tone === "bad" ? "text-coral-ink" : tone === "warn" ? "text-amber-ink" : "text-ink",
      )}>{value}</div>
      {sub && <div className="mt-2 text-[12.5px] leading-snug text-ink-3">{sub}</div>}
    </div>
  );
}

/** A row of stats in one tile, separated by space (no hairlines). */
export function StatStrip({ children, cols = 4 }: { children: ReactNode; cols?: number }) {
  const grid: Record<number, string> = {
    3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4", 5: "sm:grid-cols-3 lg:grid-cols-5", 6: "sm:grid-cols-3 lg:grid-cols-6",
  };
  return (
    <div className={cx("grid grid-cols-2 gap-x-6 gap-y-7 rounded-[24px] bg-surface px-6 py-6 shadow-tile max-sm:px-5", grid[cols])}>
      {Array.isArray(children)
        ? children.map((c, i) => <div key={i} className="min-w-0">{c}</div>)
        : <div className="min-w-0">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ badges */

type Tone = "neutral" | "good" | "bad" | "warn" | "accent" | "outline";
const TONES: Record<Tone, string> = {
  neutral: "bg-canvas-sunk text-ink-2",
  good: "bg-pass-soft text-pass-ink",
  bad: "bg-coral-soft text-coral-ink",
  warn: "bg-amber-soft text-amber-ink",
  accent: "bg-accent-soft text-accent",
  outline: "bg-surface text-ink-3 shadow-[0_0_0_1px_var(--color-divider)]",
};

export function Badge({ children, tone = "neutral", className, title }: { children: ReactNode; tone?: Tone; className?: string; title?: string }) {
  return (
    <span title={title} className={cx(
      "inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-medium leading-none tracking-[0.005em]",
      TONES[tone], className,
    )}>{children}</span>
  );
}

export function Dot({ tone }: { tone: "good" | "bad" | "warn" | "neutral" | "accent" }) {
  const c = { good: "bg-pass", bad: "bg-coral", warn: "bg-amber", neutral: "bg-ink-4", accent: "bg-accent" }[tone];
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

/** Pill buttons. primary = the black ink pill (one per view), secondary = white key, ghost = text. */
export function buttonClass(variant: "primary" | "secondary" | "ghost" = "primary") {
  const base = "inline-flex h-9 max-lg:h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[13px] font-medium tracking-[-0.005em] transition-[background-color,box-shadow,color,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45";
  if (variant === "primary") return cx(base, "bg-ink text-white shadow-ink hover:bg-[oklch(28%_0.012_70)]");
  if (variant === "secondary") return cx(base, "bg-surface text-ink shadow-key hover:shadow-raised");
  return cx(base, "text-ink-2 hover:bg-[oklch(19%_0.012_70/0.05)] hover:text-ink");
}

export function TextLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return <Link href={href} className={cx("font-medium text-accent underline-offset-[3px] decoration-accent/30 hover:underline", className)}>{children}</Link>;
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[12.5px]", className)}>{children}</span>;
}

/* ------------------------------------------------------------------ table */

/** Below lg, `stickyFirst` pins the first column while the rest scrolls horizontally. */
const STICKY_FIRST = "max-lg:[&_tr>*:first-child]:sticky max-lg:[&_tr>*:first-child]:left-0 max-lg:[&_tr>*:first-child]:z-[1] max-lg:[&_tbody_td:first-child]:bg-surface max-lg:[&_thead_th:first-child]:bg-surface max-lg:[&_tr>*:first-child]:shadow-[inset_-1px_0_0_var(--color-divider)]";
export function Table({ children, className, stickyFirst }: { children: ReactNode; className?: string; stickyFirst?: boolean }) {
  return (
    <div className={cx("overflow-x-auto rounded-[24px] bg-surface px-2 pb-1.5 shadow-tile", className)}>
      <table className={cx("w-full border-collapse text-[13.5px]", stickyFirst && STICKY_FIRST)}>{children}</table>
    </div>
  );
}

export function Th({
  children, align = "left", className, onClick, sorted, title,
}: { children?: ReactNode; align?: "left" | "right" | "center"; className?: string; onClick?: () => void; sorted?: "asc" | "desc" | false; title?: string }) {
  const a = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const inner = onClick ? (
    <button type="button" onClick={onClick} title={title}
      className={cx("inline-flex min-h-8 items-center gap-1 hover:text-ink", align === "right" && "flex-row-reverse", sorted && "text-ink")}>
      {children}
      <span className={cx("text-[9px]", sorted ? "opacity-100" : "opacity-0")}>{sorted === "asc" ? "▲" : "▼"}</span>
    </button>
  ) : <span title={title}>{children}</span>;
  return (
    <th aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
      className={cx("h-12 whitespace-nowrap border-b border-divider px-2.5 text-[12px] font-medium text-ink-3 first:pl-4 last:pr-4", a, className)}>
      {inner}
    </th>
  );
}

export function Td({ children, align = "left", className, mono }: { children?: ReactNode; align?: "left" | "right" | "center"; className?: string; mono?: boolean }) {
  const a = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <td className={cx("h-12 border-b border-divider px-2.5 align-middle first:pl-4 last:pr-4 tnum", a, mono && "font-mono text-[12.5px]", className)}>
      {children}
    </td>
  );
}

export function Tr({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <tr onClick={onClick} className={cx("transition-colors hover:bg-canvas/80 [&:last-child>td]:border-b-0", onClick && "cursor-pointer", className)}>
      {children}
    </tr>
  );
}

/* ------------------------------------------------------------------ states */

export function EmptyState({ title, description, action, icon, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cx("relative flex flex-col items-center justify-center overflow-hidden rounded-[24px] bg-surface/60 px-6 py-14 text-center shadow-well", className)}>
      <div aria-hidden className="halftone absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(60%_70%_at_50%_50%,#000,transparent)]"
        style={{ ["--dot" as string]: "var(--color-ink-5)", ["--dot-size" as string]: "8px" }} />
      <div className="relative">
        {icon && <div className="mb-3 flex justify-center text-ink-4">{icon}</div>}
        <div className="text-[15px] font-medium tracking-[-0.01em] text-ink">{title}</div>
        {description && <div className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-ink-3">{description}</div>}
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[20px] bg-coral-soft px-5 py-3.5 text-[13px] text-coral-ink shadow-[0_0_0_1px_oklch(68%_0.15_35/0.18)]">
      <span className="min-w-0 break-anywhere">Couldn’t load data: {error}</span>
      {onRetry && <button onClick={onRetry} className="shrink-0 font-medium underline underline-offset-2 max-lg:min-h-10">Retry</button>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-[14px] bg-canvas-sunk", className)} />;
}

export function LoadingBlock({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-12 rounded-[20px]" />)}
    </div>
  );
}

/* ------------------------------------------------------------------ misc */

export function Chip({ active, children, onClick, count }: { active?: boolean; children: ReactNode; onClick?: () => void; count?: number }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cx(
        "inline-flex h-8 max-lg:h-10 max-lg:px-3.5 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-[background-color,box-shadow,color] duration-150",
        active ? "bg-ink text-white shadow-ink" : "bg-surface text-ink-2 shadow-key hover:text-ink hover:shadow-raised",
      )}>
      {children}
      {count != null && <span className={cx("tnum text-[11.5px] font-normal", active ? "text-white/60" : "text-ink-4")}>{count}</span>}
    </button>
  );
}

const FIELD = "h-9 max-lg:h-11 max-md:text-[16px] rounded-full bg-surface text-[13px] text-ink shadow-key outline-none transition-shadow focus:shadow-[0_0_0_1px_var(--color-accent),0_0_0_4px_oklch(52%_0.105_72/0.14)]";

export function Select({ value, onChange, children, className, label }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string; label?: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
      className={cx(FIELD, "pl-3.5 pr-8", className)}>
      {children}
    </select>
  );
}

export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2.5 text-[13px]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="min-w-0 text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressBar({ done, total, className }: { done: number; total: number; className?: string }) {
  const p = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-canvas-sunk shadow-well", className)}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${p * 100}%` }} />
    </div>
  );
}

export function Breadcrumb({ items }: { items: { label: ReactNode; href?: string }[] }) {
  return (
    <nav className="mb-4 flex min-w-0 flex-wrap items-center gap-1.5 text-[13px] text-ink-3">
      {items.map((it, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          {i > 0 && <span className="text-ink-5">/</span>}
          {it.href ? <Link href={it.href} className="hover:text-ink max-lg:inline-flex max-lg:min-h-10 max-lg:items-center">{it.label}</Link> : <span className="min-w-0 truncate text-ink-2">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type="search"
      className={cx(FIELD, "px-4 placeholder:text-ink-4", className)} />
  );
}
