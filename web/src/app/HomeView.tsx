"use client";
// Home: one idea per screen. Hero → ranking → one finding → how it works → test your own agent.
// Everything else (runs, traces, heatmaps, head-to-head, red team...) lives in the Lab (nav + footer).
import { useRef } from "react";
import { useRouter } from "next/navigation";
import ConnectStrip from "@/components/home/ConnectStrip";
import Finding, { type Striking } from "@/components/home/Finding";
import Hero from "@/components/home/Hero";
import HowItWorks from "@/components/home/HowItWorks";
import Ranking from "@/components/home/Ranking";
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
      {striking && <Finding f={striking} />}
      <HowItWorks />
      <ConnectStrip origin={origin} />
    </>
  );
}
