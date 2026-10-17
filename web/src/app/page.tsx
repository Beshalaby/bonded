import { headers } from "next/headers";
import { read } from "@/lib/db";
import { computeStats, latestResults } from "@/lib/stats";
import type { BenchResult } from "@/lib/types";
import { MIN_RANKED_N } from "@/lib/ui/rank";
import HomeView, { type Striking } from "./HomeView";

// The striking finding is computed from the live store on every request; the client view calls router.refresh()
// when results land, so it stays current without a dedicated API route.
export const dynamic = "force-dynamic";

/** "1 in 10": readable odds for a rate. */
function oneIn(rate: number) {
  const k = Math.round(1 / rate);
  return k >= 2 ? `1 in ${k}` : `${Math.round(rate * 100)}%`;
}

function evidence(r: BenchResult | undefined) {
  if (!r?.sessionId) return undefined;
  const seq = r.attribution?.evidenceSeqs?.[0];
  return `/traces/${encodeURIComponent(r.sessionId)}${seq != null ? `#seq-${seq}` : ""}`;
}

/**
 * The one finding on the home page: the real (non-simulated) ranked model that fell for scams most often.
 * If no real model was ever scammed, the finding flips to the good news instead.
 */
function striking(): Striking | null {
  const latest = latestResults(read().benchResults);
  if (!latest.length) return null;
  const real = computeStats({ results: latest }).filter((r) => !r.simulated && r.provider !== "MCP" && r.n >= MIN_RANKED_N);
  if (!real.length) return null;
  const worst = [...real].sort((a, b) => b.metrics.scamRate - a.metrics.scamRate || a.score - b.score)[0];
  const name = worst.displayName.replace(/\s*\(sim\)\s*$/i, "");
  if (worst.metrics.scamRate <= 0) {
    const n = real.reduce((s, r) => s + r.n, 0);
    return { tone: "good", figure: "0", unit: `of ${n}`, sentence: `shopping tasks ended in a scam, across all ${real.length} real models.`, href: "/tasks", hrefLabel: "See the traps they faced" };
  }
  const k = Math.round(worst.metrics.scamRate * worst.n);
  const ev = latest.filter((r) => r.model === worst.model && r.scammed).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  return {
    tone: "bad",
    figure: oneIn(worst.metrics.scamRate),
    sentence: `of ${name}'s shopping trips ended with it falling for a scam: ${k} of ${worst.n} tasks.`,
    href: evidence(ev) ?? `/models/${encodeURIComponent(worst.model)}`,
    hrefLabel: ev?.sessionId ? "Watch it happen" : "See the model",
  };
}

export default async function Page() {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || "http";
  return <HomeView striking={striking()} origin={`${proto}://${host}`} />;
}
