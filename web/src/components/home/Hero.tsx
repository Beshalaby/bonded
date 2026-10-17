"use client";
// Full-bleed parallax hero. One sentence, one button; the scene does the rest.
//
// Depth model (scroll speed is extra px of translateY per px scrolled; the page itself already moves at -1):
//   background  +0.30  (moves slower than the page: the far distance)
//   far         +0.12  small, slightly soft-focus: sits "behind" the headline plane
//   mid         -0.35  drifts up past the headline
//   near        -0.85  big, scales up and cross-fades to a pre-blurred copy as it rushes past the viewer
// Every moving property is a transform or opacity on its own composited layer (will-change: transform), driven by
// motion values, so scrolling never re-renders React or touches layout. prefers-reduced-motion gets the same
// composition, static. Phones get four smaller layers instead of six.
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue,
} from "motion/react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { cx } from "@/design";

type Depth = "far" | "mid" | "near";
const DEPTH: Record<Depth, { speed: number; pointer: number; scale: number; fade: number }> = {
  far: { speed: 0.12, pointer: 5, scale: 0.04, fade: 900 },
  mid: { speed: -0.35, pointer: 11, scale: 0.1, fade: 800 },
  near: { speed: -0.85, pointer: 20, scale: 0.24, fade: 650 },
};

interface Asset {
  key: string;
  src: string;
  alt: string;
  depth: Depth;
  /** position + size: Tailwind classes for phone and ≥sm. Sizes are in vw with px clamps. */
  className: string;
  sizes: string;
  /** degrees of rotation per 1000px scrolled */
  spin: number;
  /** idle float: period (s), delay (s), amplitude (px), sway (deg) */
  float: [number, number, number, number];
  delay: number;
}

// Placement rules: nothing crosses the centred text column (≈ 22%–78% wide, 30%–66% tall at desktop).
// Far pieces hug the headline's upper corners; mid pieces frame it left and right; near pieces anchor the bottom.
const ASSETS: Asset[] = [
  { key: "coin-far", src: "/hero/coin.png", alt: "", depth: "far", spin: 40, float: [8, 0.4, -10, 6], delay: 0.55,
    className: "left-[5%] top-[13%] w-[58px] sm:left-[19%] sm:top-[16%] sm:w-[clamp(54px,5vw,84px)] blur-[0.6px]", sizes: "84px" },
  { key: "dollar-far", src: "/hero/dollar.png", alt: "", depth: "far", spin: -24, float: [10, 1.2, -12, 4], delay: 0.65,
    className: "max-sm:hidden sm:right-[30%] sm:top-[9%] lg:right-[17%] lg:top-[12%] sm:w-[clamp(90px,8.5vw,140px)] blur-[0.5px]", sizes: "140px" },
  { key: "leaf-mid", src: "/hero/leaf_money.png", alt: "", depth: "mid", spin: -30, float: [11, 0.2, -16, 4], delay: 0.35,
    className: "max-sm:hidden sm:left-[1.5%] sm:top-[60%] lg:top-[40%] sm:w-[clamp(150px,16vw,270px)]", sizes: "(max-width: 640px) 1px, 270px" },
  { key: "dollar-coin-mid", src: "/hero/dollar_coin.png", alt: "", depth: "mid", spin: 26, float: [9.5, 0.9, -18, 3], delay: 0.45,
    className: "right-[-7%] top-[9%] w-[148px] sm:right-[3%] sm:top-[17%] lg:right-[1.5%] lg:top-[35%] sm:w-[clamp(160px,15vw,270px)]", sizes: "(max-width: 640px) 148px, 290px" },
  { key: "cert-near", src: "/hero/certificate_coin.png", alt: "", depth: "near", spin: 34, float: [12, 0.6, -14, 2.5], delay: 0.25,
    className: "right-[-12%] top-[73%] w-[200px] sm:right-[-3%] sm:top-[66%] sm:w-[clamp(230px,24vw,400px)]", sizes: "(max-width: 640px) 200px, 400px" },
  { key: "leaf-near", src: "/hero/leaf_money.png", alt: "", depth: "near", spin: -40, float: [10.5, 1.4, -12, 3], delay: 0.3,
    className: "left-[-14%] top-[71%] w-[168px] sm:hidden", sizes: "168px" },
  { key: "coin-near", src: "/hero/coin.png", alt: "", depth: "near", spin: -52, float: [9, 0.1, -12, 5], delay: 0.2,
    className: "max-sm:hidden sm:left-[7%] sm:top-[74%] sm:w-[clamp(120px,12.5vw,210px)]", sizes: "210px" },
];

const EASE = [0.2, 0.75, 0.15, 1] as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** k is 1 normally and 0 under prefers-reduced-motion (set after mount, so server and client render identically). */
function Layer({ a, scrollY, px, py, k }: { a: Asset; scrollY: MotionValue<number>; px: MotionValue<number>; py: MotionValue<number>; k: MotionValue<number> }) {
  const d = DEPTH[a.depth];
  const y = useTransform([scrollY, py, k], ([s, p, m]: number[]) => m * (s * d.speed + p * d.pointer));
  const x = useTransform([px, k], ([p, m]: number[]) => m * p * d.pointer);
  const rotate = useTransform([scrollY, k], ([s, m]: number[]) => m * (s / 1000) * a.spin);
  const scale = useTransform([scrollY, k], ([s, m]: number[]) => 1 + m * d.scale * clamp01(s / 900));
  const opacity = useTransform([scrollY, k], ([s, m]: number[]) => (m ? 1 - clamp01((s - d.fade * 0.45) / (d.fade * 0.55)) : 1));
  const blurIn = useTransform([scrollY, k], ([s, m]: number[]) => m * clamp01((s - 60) / 360)); // near layers only

  return (
    <motion.div aria-hidden className={cx("pointer-events-none absolute will-change-transform", a.className)}
      style={{ x, y, rotate, scale, opacity }}>
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.4, delay: a.delay, ease: EASE }}>
        <div className="idle-float relative" style={{ ["--fd" as string]: `${a.float[0]}s`, ["--fdl" as string]: `-${a.float[1] * 4}s`, ["--fy" as string]: `${a.float[2]}px`, ["--fr" as string]: `${a.float[3]}deg` }}>
          <Image src={a.src} alt={a.alt} width={900} height={900} sizes={a.sizes} priority
            className="h-auto w-full select-none drop-shadow-[0_24px_30px_oklch(55%_0.09_75/0.18)]" draggable={false} />
          {a.depth === "near" && (
            // pre-blurred twin, cross-faded in by opacity (never animate filter: it repaints every frame)
            <motion.div className="absolute inset-0 will-change-[opacity]" style={{ opacity: blurIn }}>
              <Image src={a.src} alt="" width={900} height={900} sizes={a.sizes} priority className="h-auto w-full blur-[7px]" draggable={false} />
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Hero() {
  const reduce = useReducedMotion();
  const [still, setStill] = useState(false);
  const k = useMotionValue(1);
  useEffect(() => { setStill(!!reduce); k.set(reduce ? 0 : 1); }, [reduce, k]);
  const { scrollY } = useScroll();
  const rawX = useMotionValue(0), rawY = useMotionValue(0);
  const px = useSpring(rawX, { stiffness: 60, damping: 18, mass: 0.6 });
  const py = useSpring(rawY, { stiffness: 60, damping: 18, mass: 0.6 });

  useEffect(() => {
    if (still || !window.matchMedia("(pointer: fine)").matches) return;
    const on = (e: PointerEvent) => {
      rawX.set((e.clientX / window.innerWidth) * 2 - 1);
      rawY.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", on, { passive: true });
    return () => window.removeEventListener("pointermove", on);
  }, [still, rawX, rawY]);

  const bgY = useTransform([scrollY, k], ([s, m]: number[]) => m * s * 0.3);
  const bgScale = useTransform([scrollY, k], ([s, m]: number[]) => 1.04 + m * 0.06 * clamp01(s / 900));
  const textY = useTransform([scrollY, k], ([s, m]: number[]) => m * s * 0.22);
  const textOpacity = useTransform([scrollY, k], ([s, m]: number[]) => (m ? 1 - clamp01(s / 340) : 1));

  return (
    <section aria-labelledby="hero-title" className="relative isolate h-[100svh] min-h-[600px] w-full overflow-x-clip">
      {/* background: the sunlit terrace, slower than the scroll, fading into the page */}
      <div className="absolute inset-0 -z-20 overflow-hidden">
        <motion.div className="absolute inset-0 will-change-transform" style={{ y: bgY, scale: bgScale }}>
          <Image src="/hero/background.jpg" alt="" fill priority sizes="(max-aspect-ratio: 16/9) 186vh, 100vw"
            className="object-cover object-[50%_58%] [@media(max-aspect-ratio:1/1)]:object-[16%_62%]" />
        </motion.div>
        {/* legibility wash behind the headline, then the fade into white */}
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(46%_34%_at_50%_44%,oklch(100%_0_0/0.72),transparent_75%)] max-lg:bg-[radial-gradient(70%_30%_at_50%_45%,oklch(100%_0_0/0.78),transparent_85%)]" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-b from-transparent via-[oklch(99.4%_0.003_90/0.75)] to-canvas" />
        <div aria-hidden className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[oklch(100%_0_0/0.55)] to-transparent" />
      </div>

      {/* floating money, on three depth planes */}
      <div className="absolute inset-0 -z-10">
        {ASSETS.map((a) => <Layer key={a.key} a={a} scrollY={scrollY} px={px} py={py} k={k} />)}
      </div>

      <motion.div className="flex h-full flex-col items-center justify-center px-5 pb-[9svh] pt-16 text-center will-change-transform"
        style={{ y: textY, opacity: textOpacity }}>
        <h1 id="hero-title" className="font-[600] leading-[0.96] tracking-[-0.055em] text-ink [font-size:clamp(42px,6.7vw,112px)]">
          <motion.span className="block" initial={{ opacity: 0, y: 24, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 1, ease: EASE }}>
            Would you trust an AI
          </motion.span>
          <motion.span className="text-gold-sweep block pb-[0.06em]" initial={{ opacity: 0, y: 24, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 1, delay: 0.12, ease: EASE }}>
            with your wallet?
          </motion.span>
        </h1>
        <motion.p className="mt-6 max-w-[34ch] text-[17px] leading-[1.5] text-ink-2 sm:mt-7 sm:text-[20px]"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.3, ease: EASE }}>
          We give AI agents a budget, a store full of scams, and grade every decision.
        </motion.p>
        <motion.div className="mt-9 flex flex-col items-center gap-5 sm:flex-row sm:gap-7"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.42, ease: EASE }}>
          <Link href="/live"
            className="group inline-flex h-[52px] items-center gap-2 rounded-full bg-ink pl-7 pr-6 text-[16px] font-medium tracking-[-0.01em] text-white shadow-[0_0_0_1px_var(--color-ink),0_10px_30px_-10px_oklch(40%_0.08_70/0.55),inset_0_1px_0_oklch(100%_0_0/0.16)] transition-transform active:scale-[0.97]">
            Watch an agent shop
            <ArrowRight size={17} className="transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <Link href="#ranking" className="group inline-flex items-center gap-1.5 text-[15px] font-medium text-ink-2 transition-colors hover:text-ink">
            See the ranking
            <ArrowDown size={15} className="transition-transform duration-300 group-hover:translate-y-0.5" aria-hidden />
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}
