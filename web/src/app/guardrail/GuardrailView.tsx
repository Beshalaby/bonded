"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { RateBars } from "@/components/charts";
import IntervalRail from "@/components/rigor/IntervalRail";
import {
  Badge, Card, CardTitle, EmptyState, ErrorState, GuardrailBadge, LoadingBlock, PageHeader, Section, Table, Td, Th, Tr, cx,
} from "@/components/ui";
import type { GuardrailEval } from "@/lib/guardrail-eval";
import { useApi } from "@/lib/ui/api";
import { modelHref, taskHref, traceHref, usd } from "@/lib/ui/format";

const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
const short = (s: string) => s.replace(/\s*\(sim\)\s*$/i, "");
const usd0 = (n: number) => usd(n, 0);

const REASON_LABEL: Record<string, string> = {
  OVER_BUDGET: "Cart exceeds budget or per-item cap",
  WRONG_QTY: "Quantity differs from the request",
  PROMPT_INJECTION: "Listing text addresses the agent",
  KNOCKOFF: "Brand or product line is a look-alike",
  FAKE_DISCOUNT: "Was-price inflated above market",
  NEW_MERCHANT: "Young or unverified merchant",
  PRICE_ABOVE_MARKET: "Price well above market reference",
  MISMATCH: "Item doesn't match the request",
  EMPTY_CART: "Nothing in the cart",
};

export default function GuardrailView() {
  const [scope, setScope] = useState<"all" | "latest">("all");
  const { data, error, loading, reload } = useApi<GuardrailEval>(`/api/guardrail?scope=${scope}`);

  return (
    <>
      <PageHeader tone="sage"
        eyebrow={<Link href="/methodology#guardrail" className="tap hover:text-ink">Methodology · Guardrail evaluation</Link>}
        title="Guardrail evaluation"
        description="The pre-checkout guardrail is a classifier, and we grade it like one. Ground truth comes from the grader: a purchase should have been stopped if the cart was scammed, over budget or the wrong item. The guardrail never sees the hidden trap labels."
        actions={
          <div className="inline-flex rounded-full bg-white/70 p-1 text-[12.5px] shadow-[inset_0_0_0_1px_oklch(100%_0_0/0.6)] backdrop-blur-md">
            {([["all", "Every checkout"], ["latest", "Latest per model × task"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setScope(k)}
                className={cx("rounded-full px-3 py-1.5 max-lg:min-h-10", scope === k ? "bg-ink text-white" : "text-ink-2 hover:text-ink")}>{l}</button>
            ))}
          </div>
        }
        meta={data && <><span className="tnum">{data.n.toLocaleString()} graded checkouts</span><span className="tnum">{data.excluded.noCheckout} runs never reached checkout (excluded)</span></>}
      />
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data ? <LoadingBlock rows={8} /> : data && data.n === 0 ? (
        <EmptyState title="No checkouts yet" description="Run the benchmark; each graded checkout becomes one labelled example for the guardrail." />
      ) : data && <Body d={data} />}
    </>
  );
}

function Body({ d }: { d: GuardrailEval }) {
  const m = d.metrics;
  const tiles = [
    { label: "Catch rate (recall)", hint: "bad purchases flagged", v: m.recall, good: true },
    { label: "Precision", hint: "flags that were truly bad", v: m.precision, good: true },
    { label: "False-block rate", hint: "good purchases flagged", v: m.falseBlockRate, good: false },
    { label: "F1", hint: "harmonic mean, Dirichlet interval", v: { ...m.f1, k: undefined, n: undefined }, good: true },
  ];
  const enforce = d.policies.find((p) => p.key === "enforce")!;
  const strict = d.policies.find((p) => p.key === "strict")!;

  return (
    <>
      {/* headline metrics */}
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-divider bg-ink-5 gap-px lg:grid-cols-4">
        {tiles.map((t) => {
          const point = t.v.k != null && t.v.n ? t.v.k / t.v.n : t.v.mean;
          return (
            <div key={t.label} className="min-w-0 bg-white px-5 py-4 max-sm:px-4">
              <div className="text-[12px] text-ink-3">{t.label}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-ink tnum">{pct(point, 1)}</span>
                {t.v.k != null && <span className="text-[12px] text-ink-4 tnum">{t.v.k}/{t.v.n}</span>}
              </div>
              <div className="mt-3"><IntervalRail point={point} lower={t.v.lower} upper={t.v.upper} width={220} fluid /></div>
              <div className="mt-1 text-[11.5px] text-ink-3 tnum">90% CI {pct(t.v.lower, 1)} – {pct(t.v.upper, 1)} · {t.hint}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card>
          <CardTitle aside="flagged = ask or block">Confusion matrix</CardTitle>
          <Confusion d={d} />
          <dl className="mt-5 grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-2 border-t border-divider pt-4 text-[12.5px]">
            {([
              ["Accuracy", m.accuracy, "(TP + TN) / n"],
              ["Specificity", m.specificity, "TN / (FP + TN)"],
              ["Recall, block verdicts only", m.blockOnlyRecall, "what enforce mode stops"],
              ["False-block rate, block only", m.blockOnlyFalseBlockRate, "legitimate purchases enforce stops"],
            ] as const).map(([k, v, h]) => (
              <div key={k} className="contents">
                <dt className="text-ink-2">{k} <span className="text-ink-4">· {h}</span></dt>
                <dd className="text-right font-medium text-ink tnum">{pct(v.n ? v.k / v.n : 0, 1)}</dd>
                <dd className="text-right text-[11.5px] text-ink-4 tnum">{pct(v.lower, 1)}–{pct(v.upper, 1)}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <CardTitle aside="same checkouts, different policies">What enforcement would have prevented</CardTitle>
          <p className="mb-4 text-[13.5px] leading-relaxed text-ink-2">
            In <span className="font-medium text-ink">enforce</span> mode the guardrail would have stopped{" "}
            <span className="font-semibold text-pass-ink tnum">{usd0(enforce.badBlockedUsd)}</span> of {usd0(d.totals.badUsd)} bad spend
            ({d.totals.badUsd ? pct(enforce.badBlockedUsd / d.totals.badUsd) : "0%"}) and blocked{" "}
            <span className={cx("font-semibold tnum", enforce.goodBlockedUsd ? "text-amber-ink" : "text-ink")}>{usd0(enforce.goodBlockedUsd)}</span> of legitimate purchases.
            Holding <i>ask</i> verdicts for a person as well raises that to <span className="font-semibold text-pass-ink tnum">{usd0(strict.badBlockedUsd)}</span>.
          </p>
          <PolicyBars d={d} />
          {d.observedEnforce.checkouts > 0 && (
            <div className="mt-4 border-t border-divider pt-3 text-[12.5px] text-ink-3">
              <span className="font-medium text-ink-2">Observed in enforce-mode runs:</span>{" "}
              <span className="tnum">{d.observedEnforce.blocked} of {d.observedEnforce.checkouts} checkouts blocked ({usd0(d.observedEnforce.blockedUsd)}), {d.observedEnforce.blockedBad} of them truly bad.</span>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle aside="caught / bad purchases · 90% CI">Catch rate by what went wrong</CardTitle>
          <RateBars rows={d.byFailure.map((f) => ({ key: f.key, label: f.label, rate: f.rate, k: f.k, n: f.n }))} color="oklch(52% 0.105 72)" valueLabel="Caught" />
        </Card>
        <Card>
          <CardTitle aside="caught / bad purchases · 90% CI">Catch rate by agent</CardTitle>
          <RateBars rows={d.byModel.map((x) => ({ key: x.model, label: <Link href={modelHref(x.model)} className="tap hover:text-accent">{short(x.displayName)}</Link>, rate: x.rate, k: x.caught, n: x.bad }))} color="oklch(52% 0.105 72)" valueLabel="Caught" />
        </Card>
      </div>

      <Section title="Reason codes" description="How often each rule fired, and how often the purchase it fired on was actually bad (precision, with a 90% interval).">
        <Table stickyFirst>
          <thead>
            <tr>
              <Th>Code</Th><Th>Rule</Th><Th align="right">Fired</Th><Th align="right">Truly bad</Th><Th>Precision</Th><Th>Severity</Th>
            </tr>
          </thead>
          <tbody>
            {d.reasons.map((r) => {
              const point = r.fired ? r.truePositive / r.fired : 0;
              return (
                <Tr key={r.code}>
                  <Td mono className="text-ink">{r.code}</Td>
                  <Td className="text-ink-2">{REASON_LABEL[r.code] ?? "—"}</Td>
                  <Td align="right">{r.fired}</Td>
                  <Td align="right">{r.truePositive}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-3">
                      <span className="w-[46px] text-right font-medium text-ink tnum">{pct(point)}</span>
                      <IntervalRail point={point} lower={r.precision.lower} upper={r.precision.upper} width={150} />
                      <span className="text-[11.5px] text-ink-4 tnum">{pct(r.precision.lower)}–{pct(r.precision.upper)}</span>
                    </span>
                  </Td>
                  <Td>
                    <span className="inline-flex gap-1">
                      {r.critical > 0 && <Badge tone="bad">critical {r.critical}</Badge>}
                      {r.warn > 0 && <Badge tone="warn">warn {r.warn}</Badge>}
                      {r.info > 0 && <Badge>info {r.info}</Badge>}
                    </span>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Section>

      <Section title={`Misses (${d.confusion.fn})`} description="The guardrail approved these purchases, and the grader found them bad. Each one is a test case for the next version of the guardrail.">
        {d.misses.length ? <MissTable rows={d.misses} /> : <EmptyState title="No misses" description="Every bad purchase was flagged." />}
      </Section>

      {d.falseBlocks.length > 0 && (
        <Section title={`False blocks (${d.confusion.fp})`} description="The guardrail flagged these, but the grader found nothing wrong with the purchase.">
          <MissTable rows={d.falseBlocks} />
        </Section>
      )}
    </>
  );
}

function Confusion({ d }: { d: GuardrailEval }) {
  const c = d.confusion;
  const P = c.tp + c.fn, N = c.fp + c.tn;
  const Cell = ({ v, of, tone, title, sub }: { v: number; of: number; tone: "good" | "bad" | "warn" | "neutral"; title: string; sub?: React.ReactNode }) => (
    <div className={cx("min-w-0 rounded-md border px-4 py-3 max-sm:px-2.5",
      tone === "good" ? "border-pass/35 bg-pass-soft/60" : tone === "bad" ? "border-coral/35 bg-coral-soft/70" : tone === "warn" ? "border-amber/35 bg-amber-soft/60" : "border-divider bg-ivory/60")}>
      <div className={cx("text-[11.5px] font-medium", tone === "good" ? "text-pass-ink" : tone === "bad" ? "text-coral-ink" : tone === "warn" ? "text-amber-ink" : "text-ink-3")}>{title}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-[28px] max-sm:text-[24px] font-semibold leading-none tracking-[-0.02em] text-ink tnum">{v}</span>
        <span className="text-[12px] text-ink-3 tnum">{of ? pct(v / of) : "—"} of row</span>
      </div>
      {sub && <div className="mt-1.5 text-[11.5px] text-ink-3 tnum">{sub}</div>}
    </div>
  );
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)] gap-2 max-sm:grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] max-sm:gap-1.5">
      <span />
      <div className="pb-0.5 text-center text-[12px] font-medium text-ink-3">Guardrail flagged</div>
      <div className="pb-0.5 text-center text-[12px] font-medium text-ink-3">Guardrail approved</div>
      <div className="flex flex-col justify-center text-[12px] font-medium text-ink-2">Bad purchase<span className="font-normal text-ink-4 tnum">n = {P}</span></div>
      <Cell v={c.tp} of={P} tone="good" title="Caught (TP)" sub={<>{c.tpBlock} block · {c.tpAsk} ask</>} />
      <Cell v={c.fn} of={P} tone="bad" title="Missed (FN)" sub="money moved" />
      <div className="flex flex-col justify-center text-[12px] font-medium text-ink-2">Good purchase<span className="font-normal text-ink-4 tnum">n = {N}</span></div>
      <Cell v={c.fp} of={N} tone="warn" title="False block (FP)" sub={<>{c.fpBlock} block · {c.fpAsk} ask</>} />
      <Cell v={c.tn} of={N} tone="neutral" title="Correctly approved (TN)" />
    </div>
  );
}

function PolicyBars({ d }: { d: GuardrailEval }) {
  const max = Math.max(1, d.totals.badUsd, ...d.policies.map((p) => p.goodBlockedUsd)); // bar width = all bad spend
  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm bg-pass" />bad spend stopped</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm bg-coral" />bad spend through</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3 rounded-sm bg-amber" />legitimate spend blocked</span>
      </div>
      {d.policies.map((p) => (
        <div key={p.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-medium text-ink">{p.label} <span className="font-normal text-ink-3">· {p.description}</span></span>
          </div>
          <div className="flex h-[14px] w-full gap-[2px]" title={`${p.label}: stopped ${usd0(p.badBlockedUsd)} bad, let through ${usd0(p.badPassedUsd)} bad, blocked ${usd0(p.goodBlockedUsd)} legitimate`}>
            {p.badBlockedUsd > 0 && <div className="h-full rounded-l-[3px] bg-pass" style={{ width: `${(p.badBlockedUsd / max) * 100}%` }} />}
            {p.badPassedUsd > 0 && <div className={cx("h-full bg-coral", !p.badBlockedUsd && "rounded-l-[3px]", "rounded-r-[3px]")} style={{ width: `${(p.badPassedUsd / max) * 100}%` }} />}
          </div>
          <div className="mt-1 flex h-[6px] w-full">
            {p.goodBlockedUsd > 0 ? <div className="h-full rounded-[2px] bg-amber" style={{ width: `${Math.max(0.6, (p.goodBlockedUsd / max) * 100)}%` }} /> : null}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-4 text-[11.5px] text-ink-3 tnum">
            <span><span className="text-pass-ink">{usd0(p.badBlockedUsd)}</span> stopped ({p.badBlocked})</span>
            <span><span className="text-coral-ink">{usd0(p.badPassedUsd)}</span> through ({p.badPassed})</span>
            <span><span className={p.goodBlockedUsd ? "text-amber-ink" : "text-ink-2"}>{usd0(p.goodBlockedUsd)}</span> legitimate blocked ({p.goodBlocked})</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MissTable({ rows }: { rows: GuardrailEval["misses"] }) {
  return (
    <Table stickyFirst>
      <thead>
        <tr><Th>Agent</Th><Th>Task</Th><Th>Run</Th><Th>What went wrong</Th><Th>Guardrail</Th><Th>Signals it raised</Th><Th align="right">Spent</Th><Th align="right" /></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={(r.sessionId ?? "") + r.taskId + r.model}>
            <Td className="max-lg:whitespace-nowrap"><Link href={modelHref(r.model)} className="tap text-ink hover:text-accent">{short(r.displayName)}</Link></Td>
            <Td className="max-lg:whitespace-nowrap"><Link href={taskHref(r.taskId)} className="tap font-mono text-[12.5px] text-ink-2 hover:text-accent">{r.taskId}</Link></Td>
            <Td><Link href={`/runs/${encodeURIComponent(r.runId)}`} className="tap font-mono text-[12px] text-ink-3 hover:text-accent">{r.runId.slice(-6)}</Link></Td>
            <Td><span className="flex flex-wrap gap-1">{r.why.map((w) => <Badge key={w} tone={w === "Wrong item" ? "warn" : "bad"}>{w}</Badge>)}</span></Td>
            <Td><GuardrailBadge decision={r.decision} /></Td>
            <Td className="max-w-[260px] truncate text-[12.5px] text-ink-3">{r.reasons.length ? r.reasons.map((x) => x.code).join(", ") : <span className="text-ink-4">none</span>}</Td>
            <Td align="right" mono>{usd(r.amount)}</Td>
            <Td align="right">{r.sessionId && <Link href={traceHref(r.sessionId)} className="inline-flex items-center gap-0.5 text-[12.5px] text-ink-3 hover:text-accent max-lg:min-h-10">trace <ArrowUpRight size={12} /></Link>}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
