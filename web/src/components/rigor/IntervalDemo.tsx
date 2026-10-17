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
    { key: "small", label: `n = ${n}`, a: post.a, b: post.b, color: "#2563eb" },
    { key: "big", label: "n = 200", a: big.a, b: big.b, color: "#a1a1aa" },
  ], [n, post.a, post.b, big.a, big.b]);
  // Two-model trap: 3/3 vs 45/50
  const pSmall = probGreater(4, 1, 46, 6);
  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-zinc-100 px-5 py-3">
        <label className="flex items-center gap-3 text-[13px] text-zinc-700">
          Tasks graded
          <input type="range" min={2} max={200} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-56 accent-[#2563eb]" />
          <span className="w-10 font-medium text-zinc-900 tnum">{n}</span>
        </label>
        <span className="text-[13px] text-zinc-500 tnum">
          observed {k}/{n} = {Math.round((k / n) * 100)}% · posterior Beta({post.a}, {post.b}) · 90% CI{" "}
          <span className="font-medium text-zinc-900">{(post.lower * 100).toFixed(0)}–{(post.upper * 100).toFixed(0)}%</span>
        </span>
      </div>
      <div className="px-5 pb-3 pt-2">
        <PosteriorChart series={series} height={230} domain={[0, 1]} />
      </div>
      <div className="border-t border-zinc-100 px-5 py-3 text-[13px] leading-relaxed text-zinc-600">
        <span className="font-medium text-zinc-900">The leaderboard trap.</span> Model A passes 3 of 3 tasks (100%); model B passes 45 of 50 (90%).
        Raw accuracy ranks A first. The posteriors give P(<i>p</i><sub>A</sub> &gt; <i>p</i><sub>B</sub>) ={" "}
        <span className="font-medium text-zinc-900 tnum">{(pSmall * 100).toFixed(1)}%</span>, so B is more likely the better agent. Three tasks simply cannot support a 100% claim.
      </div>
    </div>
  );
}
