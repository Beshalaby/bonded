"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ArrowUpRight } from "lucide-react";
import PairwiseMatrix from "@/components/rigor/PairwiseMatrix";
import PosteriorChart from "@/components/rigor/PosteriorChart";
import { Eq, Frac, M, Op, Sub, V } from "@/components/rigor/Math";
import type { PairDetail } from "@/lib/compare";
import type { PairwiseMatrixData } from "@/components/rigor/types";
import {
  Card, CardTitle, EmptyState, ErrorState, LoadingBlock, OutcomeBadge, PageHeader, Section, Select, Stat, StatStrip, Table, Td, Th, Tr, cx, type Outcome,
} from "@/components/ui";
import { useApi } from "@/lib/ui/api";
import { modelHref, taskHref, traceHref, usd } from "@/lib/ui/format";

const COLOR_A = "oklch(52% 0.105 72)";
const COLOR_B = "oklch(47% 0.06 150)";
const short = (s: string) => s.replace(/\s*\(sim\)\s*$/i, "");
const pctf = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const fmtPval = (p: number) => (p < 0.0001 ? "< 0.0001" : p < 0.001 ? p.toExponential(1) : p.toFixed(p < 0.01 ? 4 : 3));

interface CompareResponse { matrix: PairwiseMatrixData; pair?: PairDetail | null }

export default function CompareView() {
  const [pick, setPick] = useState<{ a: string; b: string } | null>(null);
  // URL ⇄ state (no Suspense boundary needed)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const a = q.get("a"), b = q.get("b");
    if (a && b) setPick({ a, b });
  }, []);
  const base = useApi<CompareResponse>("/api/compare");
  const models = useMemo(() => base.data?.matrix.models ?? [], [base.data]);
  useEffect(() => {
    if (!pick && models.length >= 2) setPick({ a: models[0].model, b: models[1].model });
  }, [pick, models]);
  useEffect(() => {
    if (!pick) return;
    const u = new URL(window.location.href);
    u.searchParams.set("a", pick.a); u.searchParams.set("b", pick.b);
    window.history.replaceState(null, "", u.toString());
  }, [pick]);
  const detail = useApi<CompareResponse>(pick ? `/api/compare?a=${encodeURIComponent(pick.a)}&b=${encodeURIComponent(pick.b)}` : null);
  const pair = detail.data?.pair;

  const select = (a: string, b: string) => {
    setPick({ a, b });
    document.getElementById("pair")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/methodology#compare" className="tap hover:text-ink">Methodology · Comparing models</Link>}
        title="Head-to-head"
        description="Is one model actually better than another, or is the gap within noise? Each model's success rate has a Beta posterior; we report the probability that one exceeds the other, then check the paired tasks with an exact McNemar test."
      />

      {base.error && <ErrorState error={base.error} onRetry={base.reload} />}

      <Section title="Probability of superiority" description="Each cell is P(row's true success rate > column's), computed exactly from Beta(1+s, 1+f) posteriors. Cells over 95% are marked distinguishable. Click a cell to compare that pair.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Card>
            {base.data ? <PairwiseMatrix data={base.data.matrix} onSelect={select} selected={pick} /> : <LoadingBlock rows={5} />}
          </Card>
          <Card className="text-[13px] leading-relaxed text-ink-2">
            <div className="text-[12px] font-medium uppercase tracking-[0.06em] text-ink-4">How it is computed</div>
            <div className="my-3 rounded-md bg-ivory px-2 py-1">
              <Eq className="!my-1 text-[15px]">
                <M>P(<V>p</V><Sub>A</Sub> &gt; <V>p</V><Sub>B</Sub>) = <Op lower={<><V>i</V>=0</>} upper={<><V>α</V><Sub>A</Sub>−1</>} />
                  <Frac n={<>B(<V>α</V><Sub>B</Sub>+<V>i</V>, <V>β</V><Sub>A</Sub>+<V>β</V><Sub>B</Sub>)</>} d={<>(<V>β</V><Sub>A</Sub>+<V>i</V>) B(1+<V>i</V>, <V>β</V><Sub>A</Sub>) B(<V>α</V><Sub>B</Sub>, <V>β</V><Sub>B</Sub>)</>} /></M>
              </Eq>
            </div>
            <p>Exact for integer α = 1 + successes, summed in log space. A seeded 20,000-draw Monte Carlo estimate is computed alongside as a check{base.data ? <> (largest disagreement {base.data.matrix.method.maxAbsMcError.toFixed(4)})</> : null}.</p>
            <p className="mt-2">Posteriors are independent, so this ignores task pairing. The McNemar test below uses the pairing.</p>
            <Link href="/methodology#bayes" className="tap mt-3 inline-block text-accent hover:underline">Why posteriors, not raw accuracy</Link>
          </Card>
        </div>
      </Section>

      <div id="pair" className="scroll-mt-20" />
      {models.length >= 2 && pick && (
        <Section title="Pair detail"
          actions={
            <div className="flex items-center gap-2 max-sm:w-[calc(100vw-32px)] max-sm:flex-col max-sm:items-stretch">
              <ModelPicker value={pick.a} color={COLOR_A} models={models} onChange={(a) => setPick((p) => (p ? { a, b: a === p.b ? p.a : p.b } : p))} />
              <button type="button" aria-label="Swap models" onClick={() => setPick((p) => (p ? { a: p.b, b: p.a } : p))}
                className="grid size-8 max-lg:size-10 place-items-center rounded-md border border-divider bg-white text-ink-2 shadow-sm hover:bg-ivory max-sm:self-center max-sm:rotate-90">
                <ArrowLeftRight size={14} />
              </button>
              <ModelPicker value={pick.b} color={COLOR_B} models={models} onChange={(b) => setPick((p) => (p ? { b, a: b === p.a ? p.b : p.a } : p))} />
            </div>
          }>
          {detail.error ? <ErrorState error={detail.error} onRetry={detail.reload} />
            : !pair ? (detail.data ? <EmptyState title="No results for one of these models" description="Pick two models that have graded results." /> : <LoadingBlock rows={6} />)
            : <PairBody pair={pair} />}
        </Section>
      )}
      {base.data && models.length < 2 && (
        <EmptyState title="Need two models" description="Run the benchmark on at least two models to compare them." />
      )}
    </>
  );
}

function ModelPicker({ value, onChange, models, color }: { value: string; onChange: (v: string) => void; models: PairwiseMatrixData["models"]; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 max-sm:flex">
      <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <Select value={value} onChange={onChange} label="Model" className="max-sm:min-w-0 max-sm:flex-1">
        {models.map((m) => <option key={m.model} value={m.model}>{short(m.displayName)}</option>)}
      </Select>
    </span>
  );
}

function PairBody({ pair }: { pair: PairDetail }) {
  const { a, b, paired, mcnemar, diff } = pair;
  const p = pair.pAGreater;
  const winner = p >= 0.5 ? a : b;
  const loser = p >= 0.5 ? b : a;
  const pw = Math.max(p, 1 - p);
  const verdict = pw > 0.95 ? "distinguishable" : pw > 0.8 ? "likely better" : "not distinguishable";
  const series = useMemo(() => [
    { key: "a", label: short(a.displayName), a: a.a, b: a.b, color: COLOR_A },
    { key: "b", label: short(b.displayName), a: b.a, b: b.b, color: COLOR_B },
  ], [a, b]);
  const [filter, setFilter] = useState<"all" | "a" | "b">("all");
  const rows = pair.disagreements.filter((d) => filter === "all" || d.winner === filter);

  return (
    <div className="space-y-4">
      {/* verdict sentence */}
      <div className={cx("rounded-lg border px-5 py-4 max-sm:px-4", pw > 0.95 ? "border-accent/30 bg-accent-soft/60" : "border-divider bg-ivory/60")}>
        <p className="text-[15px] leading-relaxed text-ink">
          {pw > 0.5 ? (
            <>There is a <span className="font-semibold text-ink tnum">{pctf(pw)}</span> posterior probability that <span className="font-semibold">{short(winner.displayName)}</span> has a higher true success rate than <span className="font-semibold">{short(loser.displayName)}</span>. </>
          ) : <>The two posteriors are identical. </>}
          <span className={cx("font-medium", pw > 0.95 ? "text-accent" : "text-ink-2")}>
            {verdict === "distinguishable" ? "Statistically distinguishable at the 95% level." : verdict === "likely better" ? "Leaning, but not distinguishable at 95%." : "Not distinguishable: more tasks are needed."}
          </span>
        </p>
      </div>

      <StatStrip cols={4}>
        <Stat label={<>P({short(a.displayName)} &gt; {short(b.displayName)})</>} value={<span className="tnum">{pctf(p, 2)}</span>}
          sub={<span className="tnum">exact closed form · Monte Carlo {pctf(pair.pAGreaterMC, 2)} (20k draws)</span>} />
        <Stat label="Success-rate gap, p_A − p_B" value={<span className="tnum">{diff.mean >= 0 ? "+" : "−"}{Math.abs(diff.mean * 100).toFixed(1)} pts</span>}
          sub={<span className="tnum">90% credible interval {(diff.lower * 100).toFixed(1)} to {(diff.upper * 100).toFixed(1)}</span>} />
        <Stat label="McNemar exact p (paired)" value={<span className="tnum">{fmtPval(mcnemar.exactP)}</span>} tone={mcnemar.exactP < 0.05 ? undefined : undefined}
          sub={<span className="tnum">{paired.aOnly} vs {paired.bOnly} discordant · χ² {mcnemar.chi2.toFixed(2)}, p {fmtPval(mcnemar.chi2P)}</span>} />
        <Stat label="Paired tasks" value={<span className="tnum">{paired.n}</span>}
          sub={<span className="tnum">{paired.bothPass} both pass · {paired.bothFail} both fail</span>} />
      </StatStrip>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardTitle aside="posterior density · 90% credible interval below the axis">Where each model&apos;s true success rate probably lies</CardTitle>
          <PosteriorChart series={series} height={290} />
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-ink-3">
            {[{ m: a, c: COLOR_A }, { m: b, c: COLOR_B }].map(({ m, c }) => (
              <span key={m.model} className="inline-flex items-center gap-1.5 tnum">
                <span className="inline-block h-[2px] w-4 rounded" style={{ background: c }} />
                <Link href={modelHref(m.model)} className="tap text-ink hover:text-accent">{short(m.displayName)}</Link>
                {m.s}/{m.n} · Beta({m.a}, {m.b}) · {pctf(m.mean)} [{pctf(m.lower)}, {pctf(m.upper)}]
              </span>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle>Paired outcomes</CardTitle>
          <Contingency pair={pair} />
          <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
            McNemar uses only the off-diagonal tasks. Under the null, each discordant task is equally likely to favour either model, so
            min(b, c) ~ Binomial(b + c, ½).
          </p>
        </Card>
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4 max-sm:px-4">
          <div>
            <h3 className="text-[14px] font-semibold text-ink">Where they disagree</h3>
            <p className="mt-0.5 text-[12.5px] text-ink-3">Tasks where one model passed and the other failed. Open both traces side by side.</p>
          </div>
          <div className="inline-flex max-w-full overflow-x-auto rounded-md border border-divider p-0.5 text-[12.5px]">
            {([["all", `All ${pair.disagreements.length}`], ["a", `${short(a.displayName)} won ${paired.aOnly}`], ["b", `${short(b.displayName)} won ${paired.bOnly}`]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)}
                className={cx("shrink-0 whitespace-nowrap rounded px-2.5 py-1 max-lg:min-h-10", filter === k ? "bg-ink text-white" : "text-ink-2 hover:text-ink")}>{l}</button>
            ))}
          </div>
        </div>
        {rows.length ? (
          <Table className="rounded-none border-x-0 border-b-0" stickyFirst>
            <thead>
              <tr>
                <Th>Task</Th>
                <Th><span className="inline-flex items-center gap-1.5"><span className="inline-block size-2 rounded-full" style={{ background: COLOR_A }} />{short(a.displayName)}</span></Th>
                <Th><span className="inline-flex items-center gap-1.5"><span className="inline-block size-2 rounded-full" style={{ background: COLOR_B }} />{short(b.displayName)}</span></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <Tr key={d.taskId}>
                  <Td className="whitespace-nowrap"><Link href={taskHref(d.taskId)} className="tap font-mono text-[12.5px] text-ink hover:text-accent">{d.taskId}</Link></Td>
                  <Td><Side s={d.a} /></Td>
                  <Td><Side s={d.b} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : <p className="border-t border-divider px-5 py-8 text-center text-[13px] text-ink-3">No disagreements in this direction.</p>}
      </Card>
    </div>
  );
}

function Side({ s }: { s: PairDetail["disagreements"][number]["a"] }) {
  return (
    <span className="inline-flex items-center gap-2">
      <OutcomeBadge outcome={s.outcome as Outcome} />
      {s.amount != null && <span className="font-mono text-[12px] text-ink-3">{usd(s.amount)}</span>}
      {s.sessionId && (
        <Link href={traceHref(s.sessionId)} className="inline-flex items-center gap-0.5 text-[12.5px] text-ink-3 hover:text-accent max-lg:min-h-10">
          trace <ArrowUpRight size={12} />
        </Link>
      )}
    </span>
  );
}

function Contingency({ pair }: { pair: PairDetail }) {
  const { paired: p, a, b } = pair;
  const cell = (v: number, hl: boolean, label: string) => (
    <div className={cx("flex flex-col items-center justify-center rounded-md py-3", hl ? "bg-ink text-white" : "bg-ivory text-ink-2")}>
      <span className="text-[20px] font-semibold leading-none tnum">{v}</span>
      <span className={cx("mt-1 text-[10.5px]", hl ? "text-white/60" : "text-ink-4")}>{label}</span>
    </div>
  );
  const dot = (c: string) => <span className="inline-block size-2 rounded-full" style={{ background: c }} />;
  return (
    <div>
      <div className="mb-3 space-y-1 text-[12px] text-ink-2">
        <div className="flex items-center gap-1.5">{dot(COLOR_A)} A = {short(a.displayName)}</div>
        <div className="flex items-center gap-1.5">{dot(COLOR_B)} B = {short(b.displayName)}</div>
      </div>
      <div className="grid grid-cols-[52px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5 text-[11.5px]">
        <span />
        <span className="flex items-center justify-center gap-1 text-ink-3">{dot(COLOR_B)} pass</span>
        <span className="flex items-center justify-center gap-1 text-ink-3">{dot(COLOR_B)} fail</span>
        <span className="flex items-center gap-1 text-ink-3">{dot(COLOR_A)} pass</span>
        {cell(p.bothPass, false, "both pass")}
        {cell(p.aOnly, true, "b · A only")}
        <span className="flex items-center gap-1 text-ink-3">{dot(COLOR_A)} fail</span>
        {cell(p.bOnly, true, "c · B only")}
        {cell(p.bothFail, false, "both fail")}
      </div>
    </div>
  );
}
