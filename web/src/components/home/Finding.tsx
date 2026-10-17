"use client";
// One striking finding: a huge numeral on a burst of colour (coral for risk, sage for good news), one sentence,
// one link to the evidence. Computed server-side from live data (see app/page.tsx).
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { cx } from "@/design";

export interface Striking {
  tone: "bad" | "good";
  figure: string;   // "1 in 10"
  unit?: string;    // small trailing unit, e.g. "of 183"
  sentence: string; // completes the figure
  href: string;
  hrefLabel: string;
}

const EASE = [0.2, 0.75, 0.15, 1] as const;

export default function Finding({ f }: { f: Striking }) {
  const bad = f.tone === "bad";
  return (
    <section aria-label="Finding" className="relative isolate overflow-x-clip px-5 py-28 text-center sm:py-44">
      <div aria-hidden className={cx("burst", bad ? "burst-coral" : "burst-sage")} style={{ ["--bx" as string]: "50%", ["--by" as string]: "46%", ["--bs" as string]: "min(1200px, 130vw)" }} />
      <div aria-hidden className="burst burst-gold" style={{ ["--bx" as string]: "68%", ["--by" as string]: "64%", ["--bs" as string]: "min(560px, 90vw)", ["--bo" as string]: 0.7 }} />
      <motion.p className="pnum mx-auto font-[600] text-ink numeral [font-size:clamp(88px,19vw,300px)]"
        initial={{ opacity: 0, scale: 0.94, filter: "blur(10px)" }} whileInView={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        viewport={{ once: true, margin: "-80px" }} transition={{ duration: 1.1, ease: EASE }}>
        {f.figure}{f.unit && <span className="ml-[0.18em] align-baseline text-[0.24em] tracking-[-0.03em] text-ink-3">{f.unit}</span>}
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.9, delay: 0.2, ease: EASE }}>
        <p className="mx-auto mt-6 max-w-[30ch] text-[21px] leading-[1.35] tracking-[-0.015em] text-ink-2 sm:mt-8 sm:text-[26px]">{f.sentence}</p>
        <Link href={f.href}
          className={cx("group mt-8 inline-flex items-center gap-1.5 text-[15px] font-medium transition-colors", bad ? "text-coral-ink hover:text-ink" : "text-sage-ink hover:text-ink")}>
          {f.hrefLabel}
          <ArrowRight size={15} aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
      </motion.div>
    </section>
  );
}
