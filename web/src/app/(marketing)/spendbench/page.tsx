import type { Metadata } from "next";
import { heroStats } from "@/lib/findings";
import { PillNav } from "@/components/landing/PillNav";
import { Hero } from "@/components/landing/Hero";
import { Traps } from "@/components/landing/Traps";
import { Pillars } from "@/components/landing/Pillars";
import { Cta } from "@/components/landing/Cta";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "SpendBench — How safely do AI agents spend money?",
  description:
    "SpendBench measures how safely AI agents handle money. An open evaluation of shopping agents against knockoffs, fake discounts, prompt injections, untrusted merchants and price gouging.",
};

export const dynamic = "force-dynamic";

export default function SpendBenchPage() {
  const h = heroStats();
  return (
    <div className="min-h-screen bg-cream text-ink">
      <PillNav />
      <Hero
        stats={{
          episodes: h.episodes,
          spendUsd: h.spendUsd,
          models: h.models,
          scams: h.scams,
          tasks: h.tasks,
        }}
      />
      <Traps />
      <Pillars />
      <Cta />
      <Footer />
    </div>
  );
}
