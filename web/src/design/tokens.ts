// Design tokens for JS consumers (canvas, SVG, motion). CSS consumers use the --color-* / --shadow-* / --radius-*
// variables from globals.css (Tailwind: bg-canvas, text-ink-3, shadow-tile, rounded-tile ...). Keep the two in sync.

/** Colour roles as OKLCH strings (canvas 2D and SVG both accept oklch() in every evergreen browser). */
export const C = {
  canvas: "oklch(99.4% 0.003 90)",
  canvasSunk: "oklch(96.6% 0.006 85)",
  surface: "oklch(100% 0 0)",
  ink: "oklch(20% 0.012 70)",
  ink2: "oklch(41% 0.012 70)",
  ink3: "oklch(52% 0.011 70)",
  ink4: "oklch(72% 0.009 75)",
  ink5: "oklch(87% 0.007 80)",
  gold: "oklch(78% 0.125 84)",
  goldDeep: "oklch(64% 0.13 75)",
  sage: "oklch(70% 0.065 145)",
  sageInk: "oklch(47% 0.06 150)",
  accent: "oklch(52% 0.105 72)",
  accentDot: "oklch(72% 0.13 80)",
  accentSoft: "oklch(96.5% 0.03 85)",
  sky: "oklch(83% 0.07 225)",
  violet: "oklch(50% 0.07 150)",     // legacy name -> sage ink
  lavender: "oklch(64% 0.13 75)",    // legacy name -> deep gold
  coral: "oklch(68% 0.15 35)",
  coralInk: "oklch(53% 0.17 30)",
  pass: "oklch(64% 0.12 152)",
  passInk: "oklch(48% 0.1 152)",
  amber: "oklch(76% 0.14 75)",
} as const;

/** Hue families for atmospheric elements (bursts, Bloom, Orb). [core, mid, highlight]
 *  Legacy keys remap: blue -> gold, violet -> sage, so older call sites inherit the new palette. */
const GOLD = ["oklch(72% 0.14 78)", "oklch(84% 0.1 86)", "oklch(95% 0.04 92)"] as const;
const SAGE = ["oklch(62% 0.08 148)", "oklch(80% 0.06 142)", "oklch(94% 0.025 135)"] as const;
export const HUES = {
  gold: GOLD,
  sage: SAGE,
  sky: ["oklch(66% 0.1 230)", "oklch(82% 0.07 225)", "oklch(95% 0.025 220)"],
  blue: GOLD,
  violet: SAGE,
  coral: ["oklch(62% 0.18 32)", "oklch(76% 0.13 45)", "oklch(92% 0.05 60)"],
  green: ["oklch(60% 0.14 152)", "oklch(78% 0.11 158)", "oklch(93% 0.045 160)"],
  ink: ["oklch(30% 0.012 70)", "oklch(60% 0.01 70)", "oklch(92% 0.006 80)"],
} as const;
export type Hue = keyof typeof HUES;

/** Spacing scale (px). Sections are separated by space (SPACE.section), never by lines. */
export const SPACE = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64, 9: 96, 10: 128, section: 128 } as const;

/** Radii. Rule: nested radius = outer radius − padding (see nested()). */
export const RADIUS = { tile: 28, card: 22, capsule: 20, key: 14, chip: 10, pill: 999 } as const;
export const nested = (outer: number, padding: number) => Math.max(6, outer - padding);

/** Motion: restrained and physical. Use these, not ad-hoc values. */
export const EASE = [0.2, 0.75, 0.15, 1] as const;
export const SPRING = {
  /** UI feedback: presses, toggles, indicators. ~180ms, no overshoot. */
  snappy: { type: "spring", stiffness: 420, damping: 36, mass: 0.8 },
  /** Layout and entrances. ~300ms, a whisper of overshoot. */
  soft: { type: "spring", stiffness: 260, damping: 30 },
  /** Hanging things: pendulum swing that settles in ~1.2s. */
  pendulum: { type: "spring", stiffness: 90, damping: 7, mass: 0.9 },
  /** Card flip. */
  flip: { type: "spring", stiffness: 210, damping: 24 },
} as const;
export const DURATION = { fast: 0.15, base: 0.24, slow: 0.4, entrance: 0.6 } as const;
