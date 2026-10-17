// Design tokens for JS consumers (canvas, SVG, motion). CSS consumers use the --color-* / --shadow-* / --radius-*
// variables from globals.css (Tailwind: bg-canvas, text-ink-3, shadow-tile, rounded-tile ...). Keep the two in sync.

/** Colour roles as OKLCH strings (canvas 2D and SVG both accept oklch() in every evergreen browser). */
export const C = {
  canvas: "oklch(97.2% 0.003 90)",
  canvasSunk: "oklch(94.6% 0.004 90)",
  surface: "oklch(100% 0 0)",
  ink: "oklch(19% 0.006 275)",
  ink2: "oklch(42% 0.008 275)",
  ink3: "oklch(54% 0.008 275)",
  ink4: "oklch(72% 0.006 275)",
  ink5: "oklch(86% 0.005 275)",
  accent: "oklch(55% 0.215 262)",
  accentDot: "oklch(62% 0.19 258)",
  accentSoft: "oklch(96% 0.025 262)",
  sky: "oklch(78% 0.13 230)",
  violet: "oklch(55% 0.24 295)",
  lavender: "oklch(64% 0.1 288)",
  coral: "oklch(68% 0.15 35)",
  coralInk: "oklch(53% 0.17 30)",
  pass: "oklch(66% 0.15 152)",
  passInk: "oklch(50% 0.13 152)",
  amber: "oklch(76% 0.14 75)",
} as const;

/** Hue families for atmospheric elements (Bloom, Orb). [core, mid, highlight] */
export const HUES = {
  blue: ["oklch(58% 0.22 262)", "oklch(72% 0.16 240)", "oklch(88% 0.07 225)"],
  violet: ["oklch(54% 0.25 295)", "oklch(70% 0.17 300)", "oklch(90% 0.06 300)"],
  coral: ["oklch(62% 0.18 32)", "oklch(76% 0.13 45)", "oklch(92% 0.05 60)"],
  green: ["oklch(60% 0.16 152)", "oklch(78% 0.13 160)", "oklch(93% 0.05 165)"],
  ink: ["oklch(30% 0.01 275)", "oklch(60% 0.01 275)", "oklch(92% 0.005 275)"],
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
