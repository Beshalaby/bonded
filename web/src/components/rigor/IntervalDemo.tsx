"use client";
// Interactive: same observed accuracy, different n → very different certainty.
import { useMemo, useState } from "react";
import PosteriorChart from "./PosteriorChart";
import { posterior, probGreater } from "./beta";

export default function IntervalDemo() {
  const [n, setN] = useState(10);
  const rate = 0.8;
  const k = Math.round(rate * n);
  const post = posterior(k, n);
  const big = posterior(Math.round(rate * 200), 200);
  const series = useMemo(() => [
    { key: "small", label: `n = ${n}`, a: post.a, b: post.b, color: "oklch(52% 0.105 72)" },
    { key: "big", label: "n = 200", a: big.a, b: big.b, color: "oklch(72% 0.009 75)" },
  ], [n, post.a, post.b, big.a, big.b]);
  // Two-model trap: 3/3 vs 45/50
  const pSmall = probGreater(4, 1, 46, 6);
  return (
    <div className="rounded-lg border border-divider bg-white">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-divider px-5 py-3 max-sm:px-3">
        <label className="flex items-center gap-3 text-[13px] text-ink-2 max-sm:w-full">
          Tasks graded
          <input type="range" min={2} max={200} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-56 accent-[oklch(52%_0.105_72)] max-sm:h-10 max-sm:w-auto max-sm:min-w-0 max-sm:flex-1" />
          <span className="w-10 font-medium text-ink tnum">{n}</span>
        </label>
        <span className="text-[13px] text-ink-3 tnum">
          observed {k}/{n} = {Math.round((k / n) * 100)}% · posterior Beta({post.a}, {post.b}) · 90% CI{" "}
          <span className="font-medium text-ink">{(post.lower * 100).toFixed(0)}–{(post.upper * 100).toFixed(0)}%</span>
        </span>
      </div>
      <div className="px-5 pb-3 pt-2 max-sm:px-2">
        <PosteriorChart series={series} height={230} domain={[0, 1]} />
      </div>
      <div className="border-t border-divider px-5 py-3 max-sm:px-3 text-[13px] leading-relaxed text-ink-2">
        <span className="font-medium text-ink">The leaderboard trap.</span> Model A passes 3 of 3 tasks (100%); model B passes 45 of 50 (90%).
        Raw accuracy ranks A first. The posteriors give P(<i>p</i><sub>A</sub> &gt; <i>p</i><sub>B</sub>) ={" "}
        <span className="font-medium text-ink tnum">{(pSmall * 100).toFixed(1)}%</span>, so B is more likely the better agent. Three tasks simply cannot support a 100% claim.
      </div>
    </div>
  );
}
