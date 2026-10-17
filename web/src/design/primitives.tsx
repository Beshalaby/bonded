// Static primitives of the "soft instrument" system. No client state, so they render on the server too.
// Spec and usage rules: ./README.md
import Link from "next/link";
import type { CSSProperties, ElementType, ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Check, Minus, Plus, X } from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ Tile */

const LEVEL = { tile: "shadow-tile", raised: "shadow-raised", float: "shadow-float", flat: "" } as const;
export type TileLevel = keyof typeof LEVEL;

/**
 * The white surface everything sits on. Lifted by layered shadows, never a border.
 * Sets --r / --p so children can use `.r-nested` (radius = r − p).
 */
export function Tile({
  as: As = "div", pad = 24, radius = 28, level = "tile", interactive, grain, className, style, children, ...rest
}: {
  as?: ElementType; pad?: number; radius?: number; level?: TileLevel; interactive?: boolean; grain?: boolean;
  className?: string; style?: CSSProperties; children?: ReactNode;
} & Record<string, unknown>) {
  return (
    <As
      {...rest}
      className={cx(
        "relative bg-surface", LEVEL[level],
        interactive && "transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:shadow-raised",
        grain && "grain", className,
      )}
      style={{ borderRadius: radius, padding: pad, ["--r" as string]: `${radius}px`, ["--p" as string]: `${pad}px`, ...style }}
    >
      {children}
    </As>
  );
}

/* ------------------------------------------------------------------ MicroLabel */

const DOT = {
  pass: "bg-pass", accent: "bg-accent", coral: "bg-coral", violet: "bg-violet", amber: "bg-amber", ink: "bg-ink", muted: "bg-ink-4",
} as const;
export type DotTone = keyof typeof DOT;

/** 11px tracked uppercase label, optionally led by a status dot. */
export function MicroLabel({
  children, dot, pulse, className, as: As = "span",
}: { children: ReactNode; dot?: DotTone; pulse?: boolean; className?: string; as?: ElementType }) {
  return (
    <As className={cx("micro inline-flex items-center gap-2", className)}>
      {dot && <span aria-hidden className={cx("size-1.5 shrink-0 rounded-full", DOT[dot], pulse && "pulse-dot")} />}
      {children}
    </As>
  );
}

/* ------------------------------------------------------------------ Display title (two-tone) */

/**
 * Editorial headline: line 1 in ink, line 2 in a muted tone. Balanced wrap, tight tracking, optical left edge.
 * size="display" for the one page hero (40–76px), "title" for section heads (30–44px).
 */
export function DisplayTitle({
  line1, line2, as: As = "h2", size = "title", tone2 = "lavender", className, animate, id,
}: {
  id?: string; line1: ReactNode; line2?: ReactNode; as?: ElementType; size?: "display" | "title";
  tone2?: "lavender" | "grey"; className?: string; animate?: boolean;
}) {
  return (
    <As id={id} className={cx(size === "display" ? "text-display font-[560]" : "text-title font-[560]", "optical-left text-ink", className)}>
      <span className={cx("block", animate && "rise-in")}>{line1}</span>
      {line2 && (
        <span className={cx("block", tone2 === "lavender" ? "text-lavender" : "text-ink-4", animate && "rise-in")}
          style={animate ? { animationDelay: "90ms" } : undefined}>{line2}</span>
      )}
    </As>
  );
}

/** Section header in the reference-2 layout: two-tone title left; muted note + micro-label right. */
export function SectionHead({
  label, dot = "pass", title, note, actions, className, id,
}: {
  label?: ReactNode; dot?: DotTone; title: [ReactNode, ReactNode?]; note?: ReactNode; actions?: ReactNode; className?: string; id?: string;
}) {
  return (
    <header className={cx("mb-8 grid gap-x-12 gap-y-5 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)] md:items-end", className)}>
      <div className="min-w-0">
        <DisplayTitle id={id} line1={title[0]} line2={title[1]} />
      </div>
      {(note || label || actions) && (
        <div className="flex min-w-0 flex-col gap-3 md:items-start md:pb-1.5">
          {note && <p className="max-w-[340px] text-[13.5px] leading-relaxed text-ink-3">{note}</p>}
          {(label || actions) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {label && <MicroLabel dot={dot}>{label}</MicroLabel>}
              {actions}
            </div>
          )}
        </div>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ Pill buttons */

const PILL_VARIANT = {
  ink: "bg-ink text-white shadow-ink hover:bg-[oklch(28%_0.008_275)]",
  surface: "bg-surface text-ink shadow-key hover:shadow-raised",
  soft: "bg-canvas-sunk text-ink-2 hover:text-ink hover:bg-[oklch(92.5%_0.004_90)]",
  ghost: "text-ink-2 hover:bg-[oklch(19%_0.006_275/0.05)] hover:text-ink",
  accent: "bg-accent text-white shadow-[0_0_0_1px_var(--color-accent),0_6px_14px_-6px_oklch(55%_0.215_262/0.6),inset_0_1px_0_oklch(100%_0_0/0.2)] hover:bg-accent-hover",
} as const;
const PILL_SIZE = {
  sm: "h-8 px-3.5 text-[12.5px] gap-1.5",
  md: "h-10 px-4.5 text-[13.5px] gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
} as const;
export type PillVariant = keyof typeof PILL_VARIANT;

export function pillClass(variant: PillVariant = "ink", size: keyof typeof PILL_SIZE = "md") {
  return cx(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full font-medium tracking-[-0.005em]",
    "transition-[background-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-45",
    PILL_VARIANT[variant], PILL_SIZE[size],
  );
}

/** Capsule button. `href` renders a Link. Use `ink` for the one primary action per view. */
export function Pill({
  href, onClick, variant = "ink", size = "md", children, className, type = "button", title, disabled, ...aria
}: {
  href?: string; onClick?: () => void; variant?: PillVariant; size?: keyof typeof PILL_SIZE; children: ReactNode;
  className?: string; type?: "button" | "submit"; title?: string; disabled?: boolean; "aria-label"?: string;
}) {
  const cls = cx(pillClass(variant, size), className);
  if (href) return <Link href={href} className={cls} title={title} {...aria}>{children}</Link>;
  return <button type={type} onClick={onClick} className={cls} title={title} disabled={disabled} {...aria}>{children}</button>;
}

/* ------------------------------------------------------------------ Round buttons */

/** Round dark arrow button (reference 2). 32px visual, 44px hit area. */
export function ArrowButton({
  href, onClick, label, size = 32, tone = "ink", direction = "up-right", className,
}: {
  href?: string; onClick?: () => void; label: string; size?: number; tone?: "ink" | "surface";
  direction?: "up-right" | "right"; className?: string;
}) {
  const Icon = direction === "right" ? ArrowRight : ArrowUpRight;
  const cls = cx(
    "hit group/arrow inline-flex shrink-0 items-center justify-center rounded-full transition-[transform,box-shadow,background-color] duration-200 ease-out active:scale-95",
    tone === "ink" ? "bg-ink text-white shadow-ink hover:bg-[oklch(30%_0.01_275)]" : "bg-surface text-ink shadow-key hover:shadow-raised",
    className,
  );
  const icon = <Icon size={Math.round(size * 0.47)} strokeWidth={2} aria-hidden
    className="transition-transform duration-200 ease-out group-hover/arrow:translate-x-[1px] group-hover/arrow:-translate-y-[1px]" />;
  if (href) return <Link href={href} aria-label={label} className={cls} style={{ width: size, height: size }}>{icon}</Link>;
  return <button type="button" onClick={onClick} aria-label={label} className={cls} style={{ width: size, height: size }}>{icon}</button>;
}

/** Circular "+" (reference 1). */
export function PlusButton({ onClick, label, size = 36, className }: { onClick?: () => void; label: string; size?: number; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className={cx("hit inline-flex shrink-0 items-center justify-center rounded-[12px] bg-surface text-ink shadow-key transition-shadow hover:shadow-raised active:scale-95", className)}
      style={{ width: size, height: size }}>
      <Plus size={Math.round(size * 0.46)} strokeWidth={2} aria-hidden />
    </button>
  );
}

/* ------------------------------------------------------------------ IconTile */

const ICON_TONE = {
  neutral: "text-ink-2", blue: "text-accent", violet: "text-violet", coral: "text-coral-ink", green: "text-pass-ink",
} as const;

/** Square white key with rounded corners holding an icon or a tiny glyph (reference 1). */
export function IconTile({ children, size = 44, tone = "neutral", className }: { children: ReactNode; size?: number; tone?: keyof typeof ICON_TONE; className?: string }) {
  return (
    <span aria-hidden className={cx("inline-flex shrink-0 items-center justify-center bg-surface shadow-key", ICON_TONE[tone], className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ CapsuleRow */

/**
 * A list row as a soft capsule (reference 3). leading = IconTile/rank, title + subtitle, trailing = status/value/arrow.
 * With `href` the whole row is a link; keep interactive children out of it (or pass `trailing` outside via grid).
 */
export function CapsuleRow({
  href, leading, title, subtitle, trailing, children, className, as: As = "div",
}: {
  href?: string; leading?: ReactNode; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; children?: ReactNode;
  className?: string; as?: ElementType;
}) {
  const body = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium tracking-[-0.01em] text-ink">{title}</div>
        {subtitle && <div className="mt-0.5 truncate text-[13px] text-ink-3">{subtitle}</div>}
      </div>
      {children}
      {trailing && <div className="flex shrink-0 items-center gap-3">{trailing}</div>}
    </>
  );
  const cls = cx(
    "flex min-h-[64px] items-center gap-4 rounded-capsule bg-surface px-3 py-2.5 pr-4 shadow-key",
    href && "transition-[box-shadow,transform] duration-200 ease-out hover:shadow-raised active:scale-[0.995]",
    className,
  );
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  return <As className={cls}>{body}</As>;
}

/* ------------------------------------------------------------------ Stat (huge thin numerals) */

const STAT_SIZE = {
  md: "text-[34px] tracking-[-0.03em]",
  lg: "text-[48px] max-sm:text-[38px] tracking-[-0.04em]",
  xl: "text-[64px] max-sm:text-[44px] tracking-[-0.045em]",
} as const;

/** KPI numeral: thin (300), tabular, tight. Label is a micro-label above or below. */
export function Stat({
  label, value, sub, size = "lg", tone, className, labelPosition = "below", title,
}: {
  label: ReactNode; value: ReactNode; sub?: ReactNode; size?: keyof typeof STAT_SIZE; tone?: "pass" | "coral" | "accent";
  className?: string; labelPosition?: "above" | "below"; title?: string;
}) {
  const v = (
    <dd className={cx("font-light leading-none tabular-nums", STAT_SIZE[size],
      tone === "pass" ? "text-pass-ink" : tone === "coral" ? "text-coral-ink" : tone === "accent" ? "text-accent" : "text-ink")}>{value}</dd>
  );
  const l = <dt className="micro">{label}</dt>;
  return (
    <div className={cx("flex min-w-0 flex-col", labelPosition === "above" ? "gap-3" : "gap-3", className)} title={title}>
      {labelPosition === "above" ? <>{l}{v}</> : <>{v}{l}</>}
      {sub && <div className="text-[12.5px] leading-snug text-ink-3">{sub}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ StatusCheck */

/** "✓ Passed" in green text (reference 1). Icon + word, never colour alone. */
export function StatusCheck({ tone = "pass", children, className }: { tone?: "pass" | "fail" | "warn" | "neutral"; children: ReactNode; className?: string }) {
  const Icon = tone === "pass" ? Check : tone === "fail" ? X : Minus;
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium",
      tone === "pass" ? "text-pass-ink" : tone === "fail" ? "text-coral-ink" : tone === "warn" ? "text-amber-ink" : "text-ink-3", className)}>
      <Icon size={14} strokeWidth={2.4} aria-hidden />
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ Glyph: the Bonded mark */

/** Logo mark: a black squircle with a rising 3-step dot matrix. */
export function Mark({ size = 24, className }: { size?: number; className?: string }) {
  const d = [[0, 2], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      <rect width="24" height="24" rx="7.5" fill="var(--color-ink)" />
      {d.map(([c, r]) => <circle key={`${c}${r}`} cx={7 + c * 5} cy={7 + r * 5} r={1.7} fill="white" opacity={r === 0 ? 0.55 : 1} />)}
    </svg>
  );
}
