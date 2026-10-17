// Atmospheric elements: Bloom (blurred gradient light, refs 4 + 5) and Orb / GlassSphere (glass with an inner glow, ref 3).
// Pure CSS: radial gradients + layered inset shadows + a CSS keyframe "breath". No images, no canvas, no JS per frame.
import type { CSSProperties, ReactNode } from "react";
import { HUES, type Hue } from "./tokens";
import { cx } from "./primitives";

/* ------------------------------------------------------------------ Bloom */

type BloomPlacement = "top" | "bottom" | "center" | "top-right" | "bottom-left";
const ANCHOR: Record<BloomPlacement, [string, string]> = {
  top: ["50%", "-10%"], bottom: ["50%", "110%"], center: ["50%", "50%"], "top-right": ["82%", "-5%"], "bottom-left": ["12%", "105%"],
};

/**
 * Soft blurred colour light behind a hero or section. Absolutely fills its nearest positioned ancestor and
 * sits behind content (-z-10, so give the parent `isolate`). Very soft by default; grain prevents banding.
 *   tone: one hue, or "blue-violet" (blue core, violet flank) / "dusk" (violet top, blue base)
 */
export function Bloom({
  tone = "blue-violet", placement = "top", intensity = 1, className, drift = true, style,
}: {
  tone?: Hue | "blue-violet" | "dusk"; placement?: BloomPlacement; intensity?: number; className?: string; drift?: boolean; style?: CSSProperties;
}) {
  const [ax, ay] = ANCHOR[placement];
  const a = tone === "blue-violet" || tone === "dusk" ? HUES.blue : HUES[tone];
  const b = tone === "blue-violet" ? HUES.violet : tone === "dusk" ? HUES.violet : HUES[tone];
  const o = (x: number) => Math.max(0, Math.min(1, x * intensity));
  return (
    <div aria-hidden className={cx("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)} style={style}>
      <div className={cx("absolute inset-[-20%] will-change-transform", drift && "[animation:bloom-drift_22s_ease-in-out_infinite]")}
        style={{
          background: [
            `radial-gradient(40% 44% at ${ax} ${ay}, ${a[0]} 0%, transparent 70%)`,
            `radial-gradient(34% 40% at calc(${ax} - 18%) calc(${ay} + 6%), ${b[0]} 0%, transparent 72%)`,
            `radial-gradient(58% 55% at calc(${ax} + 6%) ${ay}, ${a[1]} 0%, transparent 70%)`,
            `radial-gradient(75% 70% at ${ax} ${ay}, ${a[2]} 0%, transparent 78%)`,
          ].join(","),
          opacity: o(tone === "dusk" ? 0.6 : 0.55),
          filter: "blur(32px) saturate(1.1)",
        }} />
      {/* grain only where there is colour, so the plain canvas stays clean */}
      <div className="grain absolute inset-0"
        style={{ maskImage: `radial-gradient(55% 60% at ${ax} ${ay}, #000 0%, transparent 80%)`, WebkitMaskImage: `radial-gradient(55% 60% at ${ax} ${ay}, #000 0%, transparent 80%)` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ Orb / GlassSphere */

/**
 * A glass sphere with an inner gradient glow, for LIVE states only: agent shopping, run in progress,
 * benchmark health. `active` adds the dotted spinner and a faster breath; idle orbs breathe slowly.
 * Children render centred inside the glass (keep it to a short label + one number).
 */
export function Orb({
  size = 200, hue = "blue", active = false, children, className, label,
}: { size?: number; hue?: Hue; active?: boolean; children?: ReactNode; className?: string; label?: string }) {
  const [core, mid, hi] = HUES[hue];
  const s = size;
  return (
    <div role={label ? "img" : undefined} aria-label={label}
      className={cx("relative isolate shrink-0 rounded-full", className)}
      style={{
        width: s, height: s,
        boxShadow: `0 ${s * 0.16}px ${s * 0.28}px -${s * 0.14}px color-mix(in oklch, ${core} 55%, transparent), 0 0 0 1px oklch(19% 0.012 70 / 0.05)`,
      }}>
      {/* glass body: tinted sky at the top, a pale horizon, then the glowing core (ref 3, in daylight) */}
      <div className="absolute inset-0 overflow-hidden rounded-full"
        style={{ background: `linear-gradient(180deg, color-mix(in oklch, ${mid} 38%, white) 0%, oklch(99% 0.004 250) 46%, color-mix(in oklch, ${hi} 80%, white) 70%, color-mix(in oklch, ${mid} 55%, white) 100%)` }}>
        {/* inner glow: the breathing light, with a warm rim like a horizon at dusk */}
        <div className="absolute inset-0 will-change-transform"
          style={{
            background: `radial-gradient(40% 25% at 50% 77%, color-mix(in oklch, ${core} 75%, oklch(30% 0.06 60)) 0%, ${core} 38%, oklch(80% 0.12 55 / 0.9) 60%, transparent 82%)`,
            filter: `blur(${Math.max(2, s * 0.03)}px)`,
            animation: `orb-breathe ${active ? 3.2 : 6}s ease-in-out infinite`,
            transformOrigin: "50% 77%",
          }} />
        {/* specular highlight */}
        <div className="absolute inset-0"
          style={{ background: "radial-gradient(36% 22% at 36% 14%, oklch(100% 0 0 / 0.95) 0%, oklch(100% 0 0 / 0) 100%)" }} />
      </div>
      {/* rim light */}
      <div className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          boxShadow: [
            "inset 0 0 0 1px oklch(100% 0 0 / 0.7)",
            `inset 0 ${s * 0.03}px ${s * 0.06}px oklch(100% 0 0 / 0.9)`,
            `inset 0 -${s * 0.04}px ${s * 0.1}px color-mix(in oklch, ${core} 35%, transparent)`,
            `inset 0 0 ${s * 0.02}px ${s * 0.005}px oklch(100% 0 0 / 0.5)`,
          ].join(","),
        }} />
      {(children || active) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-[14%] pb-[16%] text-center">
          {active && <OrbSpinner />}
          {children}
        </div>
      )}
    </div>
  );
}
/** Alias: the reference calls it a glass sphere. */
export const GlassSphere = Orb;

function OrbSpinner() {
  return (
    <span aria-hidden className="relative mb-2 block size-4 [animation:orb-spin_1.8s_linear_infinite]">
      {Array.from({ length: 8 }).map((_, i) => (
        <span key={i} className="absolute left-1/2 top-1/2 size-[2.5px] rounded-full bg-ink"
          style={{ transform: `rotate(${i * 45}deg) translateY(-7px)`, opacity: 0.25 + (i / 8) * 0.75, marginLeft: -1.25, marginTop: -1.25 }} />
      ))}
    </span>
  );
}

/** A tiny orb for inline live indicators (status lines, tickers). */
export function OrbDot({ size = 22, hue = "blue", active = true, className }: { size?: number; hue?: Hue; active?: boolean; className?: string }) {
  return <Orb size={size} hue={hue} active={false} className={cx(!active && "opacity-60 saturate-50", className)} />;
}
