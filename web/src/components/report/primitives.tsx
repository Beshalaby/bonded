// Report primitives for /research: a quiet, single-column paper layout (768px, 13–14px body, numbered sections).
// Colors are scoped to the report so it can sit on the site canvas without touching the design tokens.
import type { ReactNode } from "react";

export const R = {
  ink: "#20202b",
  fg: "#111",
  muted: "#6f6a60",
  line: "#e6e6ed",
  rule: "rgba(0,0,0,0.15)",
  indigo: "#3f42ab",
  indigoDeep: "#2c2f89",
  hover: "#f8f8fc",
  gold: "#8a6414",      // deep gold (design accent, oklch 52% .105 72): Bonded rows' text
  goldBar: "#dcae45",   // gold (oklch 78% .125 84): Bonded bars and dots
  goldSoft: "rgba(220,174,69,0.16)",
  goldWash: "rgba(220,174,69,0.07)",
} as const;

/** Provider brand colors for bars and dots; anything unknown falls back to ink. */
const PROVIDER_COLOR: Record<string, string> = {
  OpenAI: "#10a37f", Anthropic: "#d97757", Google: "#4285f4", DeepSeek: "#4d6bfe", Qwen: "#615ced",
  Meta: "#0866ff", Mistral: "#fa520f", xAI: "#20202b", Moonshot: "#16191e", MCP: "#6f6a60", Bonded: "#dcae45",
};
export const providerColor = (p: string) => PROVIDER_COLOR[p] ?? R.ink;

export function ProviderDot({ provider, size = 10 }: { provider: string; size?: number }) {
  return <span aria-hidden title={provider} className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: providerColor(provider) }} />;
}

export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav aria-label="Article sections" className="sticky top-16 z-30 -mx-4 mt-6 flex border-y bg-white/95 px-2 backdrop-blur sm:mx-0 sm:px-0" style={{ borderColor: R.line }}>
      {items.map((i) => (
        <a key={i.id} href={`#${i.id}`} className="flex min-h-12 flex-1 items-center justify-center text-[13px] transition-colors hover:underline" style={{ color: R.indigo }}>
          {i.label}
        </a>
      ))}
    </nav>
  );
}

export function Section({ id, n, title, children }: { id: string; n?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-14 scroll-mt-32">
      <h2 className="flex items-baseline gap-3 text-[17px] leading-[1.35] tracking-tight text-balance" style={{ color: R.fg }}>
        {n && <span aria-hidden className="text-[11px]" style={{ color: R.muted }}>{n}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function H3({ children, id }: { children: ReactNode; id?: string }) {
  return <h3 id={id} className="mt-10 scroll-mt-32 text-[15px] leading-[1.4] tracking-tight text-balance" style={{ color: R.fg }}>{children}</h3>;
}

/** Body copy: 14px / 1.7 at 85% ink, with pretty wrapping. */
export function Prose({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mt-3 space-y-4 text-[14px] leading-[1.7] text-pretty text-[#111]/85 [&_strong]:font-[560] [&_strong]:text-[#111] ${className}`}>{children}</div>;
}

export function Figure({ children, caption, label }: { children: ReactNode; caption?: ReactNode; label?: string }) {
  return (
    <figure className="mt-6" aria-label={label}>
      {children}
      {caption && <figcaption className="mt-4 text-[12px] leading-[1.65]" style={{ color: R.muted }}>{caption}</figcaption>}
    </figure>
  );
}

/** A bordered panel with the hard offset shadow, for worked examples. */
export function Panel({ children, labelledBy }: { children: ReactNode; labelledBy?: string }) {
  return (
    <section aria-labelledby={labelledBy} className="mt-6 border bg-white/95 p-5 shadow-[8px_8px_0_0_rgba(17,17,17,0.08)] sm:p-8" style={{ borderColor: R.rule }}>
      {children}
    </section>
  );
}

/** Dense numeric table: hairline rows, muted header, tabular figures. */
export function DataTable({ head, rows, align, caption }: {
  head: ReactNode[]; rows: ReactNode[][]; align?: ("left" | "right")[]; caption?: string;
}) {
  const a = (i: number) => (align?.[i] ?? (i === 0 ? "left" : "right")) === "right" ? "text-right" : "text-left";
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full border-collapse text-[13px] tabular-nums">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="border-b text-[11px] sm:text-[12px]" style={{ borderColor: R.rule, color: R.muted }}>
          <tr>{head.map((h, i) => <th key={i} scope="col" className={`pb-3 font-normal ${i ? "pl-3" : ""} ${a(i)}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, j) => (
            <tr key={j} className="border-b transition-colors hover:bg-[#f8f8fc]" style={{ borderColor: "rgba(0,0,0,0.07)" }}>
              {r.map((c, i) => i === 0
                ? <th key={i} scope="row" className={`py-2.5 pr-3 font-normal ${a(i)}`} style={{ color: R.fg }}>{c}</th>
                : <td key={i} className={`py-2.5 pl-3 ${a(i)}`} style={{ color: R.fg }}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Tags({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-1.5">
      {items.map((t) => <li key={t} className="border px-2 py-1 text-[12px]" style={{ borderColor: R.line, color: R.ink }}>{t}</li>)}
    </ul>
  );
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} className="underline decoration-black/20 underline-offset-4 transition-colors hover:decoration-current" style={{ color: R.indigo }}>{children}</a>;
}
