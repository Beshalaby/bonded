"use client";
// One striking finding, in a full-width colour panel (coral for risk, sage for good news): a huge numeral and one
// sentence on a white card, one link to the evidence. Computed server-side from live data (see app/page.tsx).
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
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
    <section aria-labelledby="finding-title" className="px-2 sm:px-3">
      <div className="relative isolate overflow-hidden rounded-[28px] px-4 py-20 sm:rounded-[40px] sm:px-8 sm:py-32">
        <div aria-hidden className={cx("mesh -z-10", bad ? "mesh-coral" : "mesh-sage")} />
        <div className="text-center">
          <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-ink-2">What we found</p>
          <h2 id="finding-title" className="mx-auto mt-4 max-w-[18ch] font-[600] leading-[1] tracking-[-0.045em] text-ink [font-size:clamp(36px,4.8vw,60px)]">
            {bad ? "Scams still work on AI agents." : "The agents held the line."}
          </h2>
        </div>

        <motion.div className="mx-auto mt-12 grid max-w-[920px] items-center gap-8 rounded-[28px] bg-[oklch(99.4%_0.003_90)] p-7 shadow-[0_40px_80px_-40px_oklch(30%_0.06_40/0.5)] sm:mt-16 sm:rounded-[34px] sm:p-12 md:grid-cols-[auto_minmax(0,1fr)] md:gap-14"
          initial={{ opacity: 0, y: 40, scale: 0.97 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 1, ease: EASE }}>
          <p className="pnum numeral font-[600] text-ink [font-size:clamp(72px,11vw,150px)]">
            {f.figure}{f.unit && <span className="ml-[0.18em] align-baseline text-[0.24em] tracking-[-0.03em] text-ink-3">{f.unit}</span>}
          </p>
          <div>
            <p className="font-display text-[26px] leading-[1.2] tracking-[-0.01em] text-ink sm:text-[32px]">{f.sentence}</p>
            <Link href={f.href}
              className={cx("group mt-7 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-medium transition-colors",
                bad ? "bg-coral-soft text-coral-ink hover:bg-coral-ink hover:text-white" : "bg-sage-soft text-sage-ink hover:bg-sage-ink hover:text-white")}>
              {f.hrefLabel}
              <ArrowUpRight size={15} aria-hidden className="transition-transform duration-300 group-hover:-translate-y-px group-hover:translate-x-px" />
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
