"use client";
// Home: hero (with the how-it-works scroll stage) → ranking → the traps → one finding → test your own agent.
// Everything else (runs, traces, head-to-head, red team...) lives under Research; infrastructure lives in the Lab.
import { useRef } from "react";
import { useRouter } from "next/navigation";
import ConnectStrip from "@/components/home/ConnectStrip";
import Finding, { type Striking } from "@/components/home/Finding";
import Hero from "@/components/home/Hero";
import Ranking from "@/components/home/Ranking";
import Traps from "@/components/home/Traps";
import TryCheck from "@/components/home/TryCheck";
import { useEvents } from "@/components/useEvents";
import type { FeedEvent } from "@/lib/types";
import { useApi, type LeaderboardResponse } from "@/lib/ui/api";

export type { Striking };

export default function HomeView({ striking, origin }: { striking: Striking | null; origin: string }) {
  const router = useRouter();
  const lb = useApi<LeaderboardResponse>("/api/leaderboard");

  // Live: when results land, refetch the ranking and re-run the server finding (debounced).
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = () => {
    if (t.current) return;
    t.current = setTimeout(() => { t.current = null; lb.reload(); router.refresh(); }, 1500);
  };
  useEvents(["result", "run", "scam"], (e: FeedEvent) => {
    if (e.type === "scam") {
      const d = e.data as { phase?: string };
      if (d.phase && d.phase !== "scam_kept" && d.phase !== "job_end") return;
    }
    refresh();
  });

  return (
    <>
      <Hero />
      <Ranking rows={lb.data?.rows ?? []} loading={lb.loading} tasks={lb.data?.totals.tasks} error={lb.error} onRetry={lb.reload} />
      <TryCheck />
      <Traps />
      {striking && <Finding f={striking} />}
      <ConnectStrip origin={origin} />
    </>
  );
}
