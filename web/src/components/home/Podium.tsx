"use client";
// The podium: the top models by composite score as cards hanging from a wire (design/HangingCards).
// Front: score + reliability dots. Back (click to flip): the numbers a buyer would ask about.
import { MIN_RANKED_N } from "@/lib/ui/rank";
import { useMemo } from "react";
import type { ModelStats } from "@/lib/types";
import { cost, modelHref, num, pct } from "@/lib/ui/format";
import { DotBar, HangingCards, StatusCheck, cx, type HangingCard } from "@/design";

const clean = (s: string) => s.replace(/\s*\(sim\)\s*$/i, "");

export default function Podium({ rows, count = 4 }: { rows: ModelStats[]; count?: number }) {
  const cards = useMemo<HangingCard[]>(() => [...rows].filter((r) => r.n >= MIN_RANKED_N).sort((a, b) => b.score - a.score).slice(0, count).map((r, i) => {
    const rel = r.reliability;
    return {
      key: r.model,
      eyebrow: i === 0 ? "Top score" : "SpendBench",
      index: `#${String(i + 1).padStart(2, "0")}`,
      title: clean(r.displayName),
      subtitle: `${r.simulated ? "Simulated" : r.provider} · n=${r.n}`,
      href: modelHref(r.model),
      hrefLabel: "View model",
      iridescent: i === 0,
      body: (
        <div className="flex h-full flex-col justify-end">
          <div className="text-[54px] font-extralight leading-none tracking-[-0.05em] text-ink tabular-nums">{num(r.score, 1)}</div>
          <div className="micro mt-2 !text-[10px]">Composite score</div>
          <div className="mt-5 flex items-center justify-between gap-2">
            <DotBar value={rel.mean} interval={rel} dots={26} pitch={5}
              label={`Reliability ${Math.round(rel.mean * 100)}%, 90% interval ${Math.round(rel.lower * 100)} to ${Math.round(rel.upper * 100)}%`} />
            <span className="text-[12.5px] text-ink-2 tabular-nums">{Math.round(rel.mean * 100)}%</span>
          </div>
        </div>
      ),
      back: (
        <dl className="grid gap-[9px] text-[12.5px]">
          <Row k="Success">
            {r.metrics.successRate >= 0.5 ? <StatusCheck className="!text-[12.5px]">{pct(r.metrics.successRate)}</StatusCheck> : <span className="text-ink tabular-nums">{pct(r.metrics.successRate)}</span>}
          </Row>
          <Row k="Scammed"><span className={cx("tabular-nums", r.metrics.scamRate > 0 ? "font-medium text-coral-ink" : "text-ink-4")}>{pct(r.metrics.scamRate)}</span></Row>
          <Row k="Over budget"><span className={cx("tabular-nums", r.metrics.budgetViolationRate > 0 ? "text-coral-ink" : "text-ink-4")}>{pct(r.metrics.budgetViolationRate)}</span></Row>
          <Row k="Wrong item"><span className="tabular-nums text-ink">{pct(r.metrics.wrongItemRate)}</span></Row>
          <Row k="90% interval"><span className="tabular-nums text-ink">{Math.round(rel.lower * 100)}–{Math.round(rel.upper * 100)}%</span></Row>
          <Row k="Avg cost"><span className="font-mono text-[12px] text-ink">{cost(r.metrics.avgCostUsd)}</span></Row>
          <Row k="Avg steps"><span className="tabular-nums text-ink">{num(r.metrics.avgSteps, 1)}</span></Row>
        </dl>
      ),
    };
  }), [rows, count]);

  if (!cards.length) return null;
  return <HangingCards cards={cards} />;
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-3">{k}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
