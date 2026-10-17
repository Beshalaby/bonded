"use client";
// Three steps, three objects. Each asset floats gently on its own burst of light.
import Image from "next/image";
import { motion } from "motion/react";

const STEPS = [
  { src: "/hero/coin.png", title: "Give an agent a budget.", body: "A hard limit.", tone: "burst-gold", float: ["8s", "0s", "-12px", "4deg"] },
  { src: "/hero/leaf_money.png", title: "Let it shop a store full of traps.", body: "Knockoffs, injections, fakes.", tone: "burst-sage", float: ["10s", "-3s", "-14px", "3deg"] },
  { src: "/hero/certificate_coin.png", title: "Every step is signed and graded.", body: "Hash-chained and replayable.", tone: "burst-gold", float: ["9s", "-6s", "-12px", "2.5deg"] },
] as const;

const EASE = [0.2, 0.75, 0.15, 1] as const;

export default function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="mx-auto max-w-[1200px] px-5 py-24 sm:px-8 sm:py-36">
      <h2 id="how-title" className="text-center font-[600] leading-[0.98] tracking-[-0.05em] text-ink [font-size:clamp(40px,5.6vw,72px)]">How it works.</h2>
      <ol className="mt-16 grid gap-16 sm:mt-24 md:grid-cols-3 md:gap-10">
        {STEPS.map((s, i) => (
          <motion.li key={s.title} className="flex flex-col items-center text-center"
            initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.9, delay: i * 0.12, ease: EASE }}>
            <div className="relative isolate grid size-[220px] place-items-center sm:size-[260px]">
              <div aria-hidden className={`burst ${s.tone}`} style={{ ["--bs" as string]: "120%" }} />
              <div className="idle-float w-[66%]" style={{ ["--fd" as string]: s.float[0], ["--fdl" as string]: s.float[1], ["--fy" as string]: s.float[2], ["--fr" as string]: s.float[3] }}>
                <Image src={s.src} alt="" width={900} height={900} sizes="180px" priority className="h-auto w-full drop-shadow-[0_20px_24px_oklch(55%_0.09_75/0.16)]" />
              </div>
            </div>
            <span className="mt-4 text-[13px] font-medium tabular-nums tracking-[0.14em] text-ink-4">0{i + 1}</span>
            <h3 className="mt-2 max-w-[16ch] text-[24px] font-[580] leading-[1.15] tracking-[-0.03em] text-ink">{s.title}</h3>
            <p className="mt-2 text-[15px] text-ink-3">{s.body}</p>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
