"use client";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { ModelStats } from "@/lib/types";
import { cx } from "@/components/ui";
import { modelHref } from "@/lib/ui/format";

const ACCENT = "#2563eb";
const EASE = [0.2, 0.75, 0.15, 1] as const;

/**
 * Forest plot of P(success) per model: 90% credible interval band + posterior mean, sorted by rank.
 * The x-domain zooms to the data (floored to 10%) and says so on the axis, so overlap between intervals reads.
 */
export default function ReliabilityForest({ rows, className, size = "md", delay = 0.3 }: { rows: ModelStats[]; className?: string; size?: "md" | "lg"; delay?: number }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  if (!rows.length) return null;
  const lo = Math.max(0, Math.floor(Math.min(...rows.map((r) => r.reliability.lower)) * 10) / 10);
  const span = 1 - lo;
  const x = (v: number) => `${((v - lo) / span) * 100}%`;
  // label the ends and, when there is room, one round value in the middle
  const mid = (lo + 1) / 2;
  const labels = span >= 0.3 ? [lo, mid, 1] : [lo, 1];
  const lg = size === "lg";
  return (
    <div className={className}>
      <div className={cx("grid items-center", lg ? "grid-cols-[28px_200px_1fr_80px] gap-x-4" : "grid-cols-[14px_118px_1fr_58px] gap-x-3")}>
        {rows.map((r, i) => {
          const name = r.displayName.replace(/\s*\(sim\)\s*$/i, "");
          const on = hover === r.model;
          return (
            <Link key={r.model} href={modelHref(r.model)} onMouseEnter={() => setHover(r.model)} onMouseLeave={() => setHover(null)}
              title={`${name}: P(success) ${Math.round(r.reliability.mean * 100)}% · 90% CI ${Math.round(r.reliability.lower * 100)}–${Math.round(r.reliability.upper * 100)}% · n=${r.n}`}
              className={cx("contents")}>
              <span className={cx("tnum text-zinc-400", lg ? "text-[15px]" : "text-[12px]")}>{i + 1}</span>
              <span className={cx("truncate", lg ? "py-3 text-[19px]" : "py-[7px] text-[13px]", on ? "text-accent" : i === 0 ? "font-medium text-zinc-900" : "text-zinc-700")}>{name}</span>
              <span className={cx("relative", lg ? "h-6" : "h-4")}>
                {labels.map((t) => <span key={t} className="absolute inset-y-0 w-px bg-zinc-100" style={{ left: x(t) }} />)}
                <motion.span className={cx("absolute top-1/2 -translate-y-1/2 rounded-full", lg ? "h-3" : "h-2")}
                  style={{ left: x(r.reliability.lower), background: ACCENT, opacity: on ? 0.38 : 0.22 }}
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${((r.reliability.upper - r.reliability.lower) / span) * 100}%` }}
                  transition={{ duration: 0.8, delay: delay + i * 0.07, ease: EASE }} />
                <motion.span className={cx("absolute top-1/2 rounded-full border-2 border-white", lg ? "size-4" : "size-3")}
                  style={{ left: x(r.reliability.mean), background: ACCENT, translateX: "-50%", translateY: "-50%", boxShadow: "0 0 0 1px rgba(37,99,235,.2)" }}
                  initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 22, delay: delay + 0.35 + i * 0.07 }} />
              </span>
              <span className={cx("text-right tnum", lg ? "text-[19px]" : "text-[13px]")}>
                <span className="font-medium text-zinc-900">{Math.round(r.reliability.mean * 100)}%</span>
                <span className={cx("ml-1 text-zinc-400", lg ? "text-[13px]" : "text-[11px]")}>±{Math.round(((r.reliability.upper - r.reliability.lower) / 2) * 100)}</span>
              </span>
            </Link>
          );
        })}
        <span /><span />
        <span className={cx("relative mt-1.5 text-zinc-400 tnum", lg ? "h-5 text-[13px]" : "h-4 text-[10.5px]")}>
          {labels.map((t, k) => (
            <span key={t} className={cx("absolute", k === 0 ? "" : k === labels.length - 1 ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: x(t) }}>{Math.round(t * 100)}%</span>
          ))}
        </span>
        <span />
      </div>
    </div>
  );
}
