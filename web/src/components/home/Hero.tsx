"use client";
// Hero: one rounded ivory panel holding the headline, and below it the scroll stage (Showcase), which peeks up
// from the bottom of the first screen and then takes over the viewport as you scroll.
import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import Showcase from "./Showcase";

const EASE = [0.2, 0.75, 0.15, 1] as const;
const rise = (delay: number) => ({
  initial: { opacity: 0, y: 18, filter: "blur(8px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 1, delay, ease: EASE },
});

export default function Hero() {
  return (
    <section aria-labelledby="hero-title" className="px-2 pt-[64px] sm:px-3 sm:pt-[68px]">
      {/* no overflow clipping here: the stage inside is position: sticky */}
      <div className="relative isolate rounded-[28px] bg-[oklch(96.6%_0.008_85)] sm:rounded-[40px]">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] overflow-hidden rounded-t-[28px] sm:rounded-t-[40px]">
          <div className="burst burst-gold" style={{ ["--bx" as string]: "50%", ["--by" as string]: "8%", ["--bs" as string]: "min(1100px, 140vw)", ["--bo" as string]: 0.55 }} />
        </div>

        {/* Fills the first screen minus --peek, so the top of the stage always shows below the fold line */}
        <div className="flex min-h-[calc(100svh-64px-var(--peek))] flex-col items-center justify-center px-5 py-10 text-center [--peek:clamp(88px,15svh,150px)] sm:min-h-[calc(100svh-68px-var(--peek))] sm:py-12">
          <h1 id="hero-title" className="font-display font-normal leading-[0.92] tracking-[-0.025em] [font-size:clamp(50px,min(8vw,12.5svh),124px)]">
            <motion.span className="block text-ink" {...rise(0.06)}>Would you trust an AI</motion.span>
            <motion.span className="block pb-[0.06em] text-ink-3" {...rise(0.16)}>with your wallet?</motion.span>
          </h1>

          <motion.p className="mt-6 max-w-[46ch] text-[15px] leading-[1.6] text-ink-3 sm:mt-7 sm:text-[17px]" {...rise(0.28)}>
            We give AI agents a real card, a hard budget and a store full of scams, then grade every decision they make.
          </motion.p>

          <motion.div className="mt-9 flex flex-col items-center gap-6" {...rise(0.4)}>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Link href="/live"
                className="group inline-flex h-[50px] items-center gap-2.5 rounded-[14px] bg-ink pl-6 pr-5 text-[15px] font-medium tracking-[-0.01em] text-white shadow-[0_0_0_1px_var(--color-ink),0_14px_28px_-12px_oklch(20%_0.012_70/0.6),inset_0_1px_0_oklch(100%_0_0/0.14)] transition-transform active:scale-[0.97]">
                Watch an agent shop
                <ArrowUpRight size={16} aria-hidden className="opacity-80 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
              <Link href="/connect"
                className="inline-flex h-[50px] items-center rounded-[14px] bg-white px-6 text-[15px] font-medium tracking-[-0.01em] text-ink shadow-[0_0_0_1px_oklch(20%_0.012_70/0.1),0_6px_16px_-8px_oklch(20%_0.012_70/0.2)] transition-transform active:scale-[0.97]">
                Test your own agent
              </Link>
            </div>
            <Link href="#ranking" className="group inline-flex items-center gap-2.5 text-[13.5px] text-ink-3 transition-colors hover:text-ink">
              <span className="flex -space-x-2" aria-hidden>
                {["/hero/coin.png", "/hero/dollar_coin.png", "/hero/certificate_coin.png"].map((src) => (
                  <span key={src} className="grid size-7 place-items-center overflow-hidden rounded-full bg-gold-soft ring-2 ring-[oklch(96.6%_0.008_85)]">
                    <Image src={src} alt="" width={56} height={56} className="size-6 object-contain" />
                  </span>
                ))}
              </span>
              Every model graded on the same scams
            </Link>
          </motion.div>
        </div>

        <Showcase />
      </div>
    </section>
  );
}
