import Link from "next/link";
import { CoinTree } from "./PillNav";

// Hero anchored on the reference money-tree photograph: full-bleed backdrop, the headline sitting in
// the open upper-center, a frosted glass panel so it reads over the bright sky, and a live stat strip
// pulled from SpendBench's real counters.
export function Hero({
  stats,
}: {
  stats: { episodes: number; spendUsd: number; models: number; scams: number; tasks: number };
}) {
  return (
    <section className="relative isolate flex min-h-[78svh] flex-col items-center overflow-hidden bg-cream sm:min-h-[86vh]">
      {/* reference photograph as backdrop. On small/portrait screens the plate is reserved by its own
          aspect ratio (object-contain) so BOTH money trees stay fully in frame; on wide screens it's
          cover, which trims top/bottom only and leaves the edge trees framing the scene. */}
      <img
        src="/spendbench/prosperity-hero.webp"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-contain object-center sm:object-cover sm:object-[center_bottom]"
      />
      {/* soften the top slightly for the headline, and deepen the bottom for the stat strip —
          keep the photo visible so the money-tree scene reads through the open center */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/15 via-transparent to-[#1c2a1c]/30" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-black/10 to-transparent" />

      {/* frosted-glass tiles drifting across the scene (echo the reference art) */}
      <Tiles />

      {/* radial white scrim centered behind the text so the dark ink stays legible where foliage
          crosses the open centre on narrow widths */}
      <div className="pointer-events-none absolute left-1/2 top-[38%] z-[5] h-[52%] w-[min(44rem,90vw)] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,rgba(253,249,236,0.62),transparent_72%)]" />

      <div className="relative z-10 flex w-full max-w-[760px] flex-col items-center px-6 pt-24 text-center">
        <span className="rounded-full border border-white/70 bg-white/70 px-4 py-1 text-[13px] font-medium text-forest backdrop-blur-sm">
          Where AI agents learn to spend money
        </span>
        <h1 className="mt-6 text-[clamp(2.6rem,6vw,4.8rem)] font-medium leading-[1.02] tracking-[-0.03em] text-ink">
          Measure how safely AI&nbsp;agents{" "}
          <em className="italic text-forest">spend&nbsp;money.</em>
        </h1>
        <p className="mt-6 max-w-[30rem] text-[17px] font-medium leading-relaxed text-ink">
          SpendBench sends shopping agents into a store full of traps — knockoffs, fake discounts,
          hidden prompt injections, untrusted merchants, price gouging — and grades every purchase.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/runs/new"
            className="rounded-full bg-forest px-7 py-3 text-[15px] font-medium text-cream shadow-[0_10px_30px_rgba(47,74,51,0.35)] transition-colors hover:bg-leaf"
          >
            Run a benchmark
          </Link>
          <Link
            href="/"
            className="rounded-full border border-forest/40 bg-white/70 px-7 py-3 text-[15px] font-medium text-forest backdrop-blur-sm transition-colors hover:bg-white"
          >
            View the leaderboard
          </Link>
        </div>
      </div>

      {/* live stat strip */}
      <div className="relative z-10 mt-auto w-full max-w-[1000px] px-6 pb-12">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-white/40 bg-white/20 backdrop-blur-md sm:grid-cols-4">
          {liveStats(stats).map((s) => (
            <Stat key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-cream/70 px-6 py-5 text-center">
      <p className="text-[26px] font-semibold tabular-nums tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-[12px] uppercase tracking-[0.12em] text-forest">{label}</p>
    </div>
  );
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

// Stat strip shows live counters only when there is real data; otherwise falls back to structural
// facts that are always true, so an empty/unseeded store never renders a row of literal zeros.
function liveStats(stats: { episodes: number; spendUsd: number; models: number; scams: number }) {
  if (stats.episodes > 0) {
    return [
      { label: "Episodes graded", value: fmt(stats.episodes) },
      { label: "Checkouts audited", value: `$${fmt(stats.spendUsd)}` },
      { label: "Models on the board", value: fmt(stats.models) },
      { label: "Live scams in store", value: fmt(stats.scams) },
    ];
  }
  return [
    { label: "Traps in the store", value: "5" },
    { label: "Evidence", value: "Hash-chained traces" },
    { label: "Confidence", value: "90% intervals" },
    { label: "Benchmark", value: "Adversarial" },
  ];
}

// Decorative translucent rounded tiles scatted over the landscape, echoing the reference.
function Tiles() {
  const tiles = [
    { x: "4%", y: "40%", s: 88 },
    { x: "14%", y: "52%", s: 64 },
    { x: "84%", y: "42%", s: 96 },
    { x: "90%", y: "56%", s: 70 },
    { x: "72%", y: "58%", s: 54 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {tiles.map((t, i) => (
        <span
          key={i}
          className="absolute rounded-2xl border border-white/55 bg-white/25 shadow-[0_2px_20px_rgba(120,140,100,0.14)] backdrop-blur-sm"
          style={{ left: t.x, top: t.y, width: t.s, height: t.s * (0.92 + (i % 3) * 0.1) }}
        />
      ))}
    </div>
  );
}
