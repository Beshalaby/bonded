// Tiny HTML/CSS math typesetting kit (no KaTeX): serif italics, real fractions, big operators with limits.
import type { ReactNode } from "react";

const SERIF = "font-['STIX_Two_Math','Cambria_Math','Latin_Modern_Math','Times_New_Roman',serif]";

/** Display equation block, optionally numbered. */
export function Eq({ children, n, className }: { children: ReactNode; n?: string | number; className?: string }) {
  return (
    <div className={`my-4 flex items-center gap-4 overflow-x-auto ${className ?? ""}`}>
      <div className={`flex-1 text-center text-[17px] leading-[1.6] text-ink ${SERIF}`}>{children}</div>
      {n != null && <span className="shrink-0 text-[13px] text-ink-4 tnum">({n})</span>}
    </div>
  );
}

/** Inline math run. */
export function M({ children }: { children: ReactNode }) {
  return <span className={`whitespace-nowrap text-[1.08em] text-ink ${SERIF}`}>{children}</span>;
}

/** Italic variable. */
export function V({ children }: { children: ReactNode }) {
  return <i className="pr-[0.06em]">{children}</i>;
}

export function Frac({ n, d }: { n: ReactNode; d: ReactNode }) {
  return (
    <span className="mx-[0.15em] inline-flex flex-col items-center align-middle text-[0.9em] leading-[1.25]">
      <span className="border-b border-current px-[0.3em] pb-[0.08em]">{n}</span>
      <span className="px-[0.3em] pt-[0.08em]">{d}</span>
    </span>
  );
}

/** Big operator (∑, ∏, ∫) with limits stacked above/below. */
export function Op({ op = "∑", lower, upper }: { op?: string; lower?: ReactNode; upper?: ReactNode }) {
  return (
    <span className="mx-[0.15em] inline-flex flex-col items-center align-middle leading-none">
      <span className="text-[0.6em]">{upper ?? " "}</span>
      <span className="text-[1.6em] leading-[1.05]">{op}</span>
      <span className="text-[0.6em]">{lower ?? " "}</span>
    </span>
  );
}

export const Sub = ({ children }: { children: ReactNode }) => <sub className="text-[0.7em]">{children}</sub>;
export const Sup = ({ children }: { children: ReactNode }) => <sup className="text-[0.7em]">{children}</sup>;
