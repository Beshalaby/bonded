"use client";
// HangingCards (reference 2): cards hanging from a sagging wire. Each card is a pendulum around its pin:
// drag it sideways (mouse/pen) and let go to watch it swing and settle; neighbours feel the wire. Hover the
// iridescent card to move its sheen; click (or Enter/Space) any card to flip it and read its stats.
// Motion is spring-driven (`motion`), idle sway is a CSS keyframe paused offscreen, and everything is still
// under prefers-reduced-motion.
import { motion, useMotionValue, useSpring } from "motion/react";
import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SPRING } from "./tokens";
import { ArrowButton, cx } from "./primitives";
import { useInView, useReducedMotionPref, useSize } from "./hooks";
import { ScrollFade } from "./ScrollFade";

export interface HangingCard {
  key: string;
  /** Top-left micro label, e.g. "Rank · SpendBench". */
  eyebrow: ReactNode;
  /** Top-right index, e.g. "#01". */
  index: string;
  title: string;
  subtitle?: ReactNode;
  /** Front body under the title. */
  body?: ReactNode;
  /** Back face content (stats). */
  back: ReactNode;
  href?: string;
  hrefLabel?: string;
  /** Holographic finish: use for exactly one card (the #1). */
  iridescent?: boolean;
}

const CARD_W = 236, CARD_W_SM = 216, CARD_H = 330;
const STRINGS = [34, 70, 46, 82, 52, 64];

export function HangingCards({ cards, className, hint = true }: { cards: HangingCard[]; className?: string; hint?: boolean }) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const inView = useInView(ref, "0px");
  const reduce = useReducedMotionPref();
  const kicks = useRef<((deg: number) => void)[]>([]);
  const [seen, setSeen] = useState(false);
  useEffect(() => { if (inView) setSeen(true); }, [inView]);

  const n = cards.length;
  const narrow = w > 0 && w < 760;
  const cw = narrow ? CARD_W_SM : CARD_W;
  // desktop: spread across the width; narrow: fixed pitch inside a horizontal scroller
  const innerW = narrow ? n * (cw + 28) + 32 : w;
  const centers = cards.map((_, i) => (narrow ? 16 + (cw + 28) * i + (cw + 28) / 2 : ((i + 0.5) / n) * w));
  const wireY = 18, sag = narrow ? 18 : 26;
  const wy = (x: number) => wireY + sag * 4 * (x / Math.max(1, innerW)) * (1 - x / Math.max(1, innerW));
  const H = wireY + sag + Math.max(...STRINGS.slice(0, n)) + CARD_H + 40;

  const nudge = useCallback((i: number, deg: number) => {
    if (reduce) return;
    [i - 1, i + 1].forEach((j, k) => kicks.current[j]?.(deg * (k === 0 ? 0.35 : -0.35)));
  }, [reduce]);

  const stage = (
    <div className={cx("relative", !inView && "paused")} style={{ width: innerW || "100%", height: H }}>
      <svg aria-hidden className="absolute left-0 top-0 overflow-visible" width={innerW} height={wireY + sag + 4}>
        <path d={`M0 ${wireY} Q ${innerW / 2} ${wireY + sag * 2} ${innerW} ${wireY}`} fill="none" stroke="oklch(72% 0.006 275)" strokeWidth={1.1} />
      </svg>
      {w > 0 && cards.map((c, i) => (
        <Hanger key={c.key} card={c} i={i} x={centers[i]} y={wy(centers[i])} len={STRINGS[i % STRINGS.length]} cw={cw}
          seen={seen} reduce={reduce} register={(fn) => { kicks.current[i] = fn; }} onRelease={(deg) => nudge(i, deg)} />
      ))}
    </div>
  );

  return (
    <div ref={ref} className={cx("relative w-full", className)}>
      {narrow ? <ScrollFade label="Top models" className="-mx-4 px-0" fade={28}>{stage}</ScrollFade> : stage}
      {hint && (
        <div className="mt-2 flex items-center justify-between gap-4">
          <span className="micro !text-[10px] !text-ink-4">{n} models · ranked by composite score</span>
          <span className="micro !text-[10px] !text-ink-4">{narrow ? "Tap to flip" : "Drag to swing · click to flip"}</span>
        </div>
      )}
    </div>
  );
}

function Hanger({
  card, i, x, y, len, cw, seen, reduce, register, onRelease,
}: {
  card: HangingCard; i: number; x: number; y: number; len: number; cw: number; seen: boolean; reduce: boolean;
  register: (fn: (deg: number) => void) => void; onRelease: (deg: number) => void;
}) {
  const target = useMotionValue(0);
  const rot = useSpring(target, SPRING.pendulum);
  const [flipped, setFlipped] = useState(false);
  const drag = useRef<{ x0: number; y0: number; moved: boolean; id: number } | null>(null);
  const suppressClick = useRef(false);
  const sheen = useRef<HTMLDivElement>(null);

  // neighbours call this to pass on a bit of the wire's energy
  useEffect(() => {
    register((deg) => { target.set(deg); setTimeout(() => target.set(0), 90); });
  }, [register, target]);

  // entrance swing, staggered, once
  useEffect(() => {
    if (!seen || reduce) return;
    const t1 = setTimeout(() => target.set(i % 2 ? -7 : 7), 120 + i * 110);
    const t2 = setTimeout(() => target.set(0), 220 + i * 110);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [seen, reduce, i, target]);

  const pinY = y;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" || reduce || e.button !== 0) return;
    drag.current = { x0: e.clientX, y0: e.clientY, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d && d.id === e.pointerId) {
      const dx = e.clientX - d.x0;
      if (!d.moved && Math.abs(dx) > 4) { d.moved = true; e.currentTarget.setPointerCapture(e.pointerId); }
      if (d.moved) {
        const r = e.currentTarget.getBoundingClientRect();
        const arm = Math.max(80, e.clientY - (r.top - len) + 40);
        target.set(Math.max(-22, Math.min(22, (Math.atan2(dx, arm) * 180) / Math.PI)));
      }
    }
    if (card.iridescent && sheen.current) {
      const r = e.currentTarget.getBoundingClientRect();
      sheen.current.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
      sheen.current.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
    }
  };
  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved) { suppressClick.current = true; const v = target.get(); target.set(0); onRelease(v); }
    drag.current = null;
  };
  const onEnter = () => {
    if (reduce || drag.current) return;
    target.set(i % 2 ? 1.6 : -1.6);
    setTimeout(() => { if (!drag.current) target.set(0); }, 110);
  };

  return (
    <>
      {/* pin on the wire */}
      <span aria-hidden className="absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface shadow-key" style={{ left: x, top: pinY }} />
      <motion.div className="absolute" style={{ left: x - cw / 2, top: pinY, width: cw, rotate: rot, transformOrigin: `50% 0px`, zIndex: flipped ? 3 : 1 }}>
        <div className={cx(!reduce && "[animation:card-sway_var(--sway-t)_ease-in-out_infinite]")}
          style={{ transformOrigin: "50% 0", paddingTop: len, ["--sway-t" as string]: `${7 + (i % 3) * 1.3}s`, ["--sway-a" as string]: `${-0.45 - (i % 2) * 0.2}deg`, ["--sway-b" as string]: `${0.45 + (i % 3) * 0.12}deg`, animationDelay: `${-i * 1.7}s` }}>
          {/* string + clip */}
          <span aria-hidden className="absolute left-1/2 top-0 w-px -translate-x-1/2 bg-[oklch(72%_0.006_275)]" style={{ height: len - 4 }} />
          <span aria-hidden className="absolute left-1/2 z-[2] flex h-[13px] w-[20px] -translate-x-1/2 items-start justify-center rounded-t-full bg-[oklch(88%_0.004_275)] pt-[3px] shadow-key" style={{ top: len - 9 }}>
            <span className="size-[5px] rounded-full bg-[oklch(97%_0.003_90)] shadow-[inset_0_1px_1px_oklch(19%_0.006_275/0.25)]" />
          </span>
          <motion.div
            className="relative [perspective:1200px]" style={{ height: CARD_H }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onPointerEnter={onEnter}>
            {/* the whole card is the flip control; the arrow links above it stay clickable */}
            <button type="button" aria-pressed={flipped} aria-label={`${card.title}: ${flipped ? "show front" : "flip to show stats"}`}
              onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } setFlipped((f) => !f); }}
              className="absolute inset-0 cursor-pointer rounded-card focus-visible:outline-offset-4" />
            <motion.div className="pointer-events-none relative h-full w-full [transform-style:preserve-3d]"
              animate={{ rotateY: flipped ? 180 : 0 }} transition={reduce ? { duration: 0 } : SPRING.flip}>
              <Face card={card} sheenRef={sheen} active={!flipped}>
                <div className="flex items-start justify-between">
                  <span className="micro !text-[10px]">{card.eyebrow}</span>
                  <span className="micro !text-[10px] tabular-nums">{card.index}</span>
                </div>
                <div className="mt-5 min-w-0">
                  <h3 className="truncate text-[21px] font-[560] leading-tight tracking-[-0.03em] text-ink">{card.title}</h3>
                  {card.subtitle && <div className="mt-0.5 truncate text-[13px] text-ink-3">{card.subtitle}</div>}
                </div>
                <div className="mt-4 min-w-0 flex-1">{card.body}</div>
                <Footer card={card} label={card.hrefLabel ?? "View model"} active={!flipped} />
              </Face>
              <Face card={card} back active={flipped}>
                <div className="flex items-start justify-between">
                  <span className="micro !text-[10px]">Stats · {card.index.replace("#", "")}</span>
                  <span aria-hidden className="inline-flex size-6 items-center justify-center rounded-full bg-surface/70 text-ink-3 shadow-key"><RotateCcw size={11} /></span>
                </div>
                <div className="mt-3 truncate text-[15px] font-medium tracking-[-0.015em] text-ink">{card.title}</div>
                <div className="mt-3 min-w-0 flex-1">{card.back}</div>
                <Footer card={card} label={card.hrefLabel ?? "View model"} active={flipped} />
              </Face>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>
    </>
  );
}

function Footer({ card, label, active }: { card: HangingCard; label: string; active: boolean }) {
  return (
    <div className="mt-3">
      <div aria-hidden className="halftone h-[3px] opacity-60" style={{ ["--dot" as string]: "oklch(72% 0.006 275)", ["--dot-size" as string]: "4px" }} />
      <div className="mt-3 flex items-center justify-between">
        <span className="micro !text-[10px] !text-ink-2">{label}</span>
        {card.href && <span className={cx("relative", active ? "pointer-events-auto" : "invisible")} aria-hidden={!active}><ArrowButton href={card.href} label={`${label}: ${card.title}`} size={30} /></span>}
      </div>
    </div>
  );
}

function Face({
  card, back, children, sheenRef, active,
}: {
  card: HangingCard; back?: boolean; children: ReactNode; sheenRef?: React.RefObject<HTMLDivElement | null>; active: boolean;
}) {
  return (
    <div aria-hidden={!active}
      className={cx("absolute inset-0 flex flex-col overflow-hidden rounded-card p-[18px] [backface-visibility:hidden]",
        card.iridescent ? "bg-[oklch(97%_0.012_280)]" : "bg-surface")}
      style={{
        transform: back ? "rotateY(180deg)" : undefined,
        boxShadow: "var(--shadow-raised)",
      }}>
      {card.iridescent && (
        <div ref={sheenRef} aria-hidden className="grain pointer-events-none absolute inset-0 transition-[background-position] duration-300 ease-out"
          style={{
            ["--mx" as string]: "30%", ["--my" as string]: "20%",
            background: [
              "radial-gradient(60% 45% at var(--mx) var(--my), oklch(100% 0 0 / 0.75), transparent 70%)",
              "linear-gradient(125deg, oklch(90% 0.06 300) 0%, oklch(93% 0.06 200) 22%, oklch(95% 0.07 110) 42%, oklch(92% 0.06 340) 62%, oklch(90% 0.07 260) 82%, oklch(93% 0.05 180) 100%)",
            ].join(","),
            backgroundSize: "100% 100%, 260% 260%",
            backgroundPosition: "0 0, var(--mx) var(--my)",
            opacity: 0.95,
          }} />
      )}
      <div className="relative z-[2] flex h-full min-w-0 flex-col">{children}</div>
    </div>
  );
}
