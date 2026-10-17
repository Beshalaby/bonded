# Bonded design system: "soft instrument"

Calm, abstract, luxurious, and still a precise measuring instrument. Light only.
The home page (`src/app/HomeView.tsx`) is the reference. When in doubt, copy what it does.

```ts
import { Tile, Pill, MicroLabel, SectionHead, Stat, DotBar, ... } from "@/design";
```

Tokens live in two places that must stay in sync:
- **CSS**: `src/app/globals.css`, `@theme` block. This generates Tailwind classes (`bg-canvas`, `text-ink-3`, `shadow-tile`, `rounded-capsule`, ...).
- **JS**: `src/design/tokens.ts` (`C`, `HUES`, `SPACE`, `RADIUS`, `SPRING`, `EASE`). Use it for canvas, SVG fills and motion.

---

## 1. The ten rules

1. **Shadows, not borders.** Surfaces are lifted by `shadow-tile` / `shadow-key`. The 1px ring is part of the shadow. Never use `border border-zinc-200`. The only hairline allowed is `border-divider`, between rows inside a table or list.
2. **Everything is OKLCH.** Use the tokens. Do not write hex. Do not use Tailwind's `zinc-*`, `rose-*` or `emerald-*` palettes in new code; map them to the roles in §2.
3. **The canvas is warm off-white, and content sits on white tiles.** `html` and `body` are already `bg-canvas`. Never put a page section straight on white.
4. **Separate sections with space, not lines.** Use `mt-28` between home sections (`max-sm:mt-20`). `<Section>` from `ui.tsx` uses `mt-16 sm:mt-20`.
5. **Nested radius = outer radius − padding.** See §4.
6. **Tabular numbers everywhere.** This is set globally on `body`. Big numerals are thin (`font-light` or `font-extralight`).
7. **Colour is atmosphere or meaning, never decoration.** Blue and violet appear as blooms and orbs, plus the one interactive hue (links, focus, primary data). Coral means risk. Green means pass.
8. **There is one black pill per view.** That is the primary action (`Pill variant="ink"`, or `buttonClass("primary")`). Everything else is a white key (`surface`) or `ghost`.
9. **Charts are dot-matrix.** Use `DotBar`, `DotHeatmap`, `DotSparkline`, `HalftoneField`, or the `.halftone` fill. There are no solid bars.
10. **Motion is short, physical and optional.** Durations are 150–400ms. Use springs from `SPRING`. Ambient motion pauses offscreen, and everything respects reduced motion (§7).

---

## 2. Colour roles (`globals.css` @theme)

| Role | Class / var | Use |
|---|---|---|
| Canvas | `bg-canvas` `oklch(97.2% .003 90)` | Page background (also on `<html>`). Also cells and wells *inside* a white tile. |
| Canvas sunk | `bg-canvas-sunk` | Tracks, inputs, skeletons. |
| Surface | `bg-surface` (white) | Tiles, capsules, keys. |
| Glass | `bg-glass` + `backdrop-blur-xl` | Nav, tooltips, popovers. |
| Ink | `text-ink` | Primary text and numerals. |
| Ink 2 | `text-ink-2` | Secondary text, row labels. |
| Ink 3 | `text-ink-3` | Muted text and micro-labels. This is the lightest tone that passes 4.5:1. |
| Ink 4 / 5 | `text-ink-4`, `bg-ink-5` | Decorative only: axis ticks, off-dots, "–". Never put essential text in these. |
| Divider | `border-divider` | Table/list row separators only. |
| Accent (blue) | `text-accent`, `bg-accent`, `bg-accent-soft`, `--color-accent-dot` | Links, focus ring, the primary data series, "running". |
| Violet | `text-violet`, `bg-violet-soft` | A secondary atmosphere hue: blooms, idle orbs, head-to-head dot. |
| Lavender | `text-lavender` | **Only** the second line of a two-tone headline. |
| Coral | `bg-coral` (dots and fills), `text-coral-ink` (text), `bg-coral-soft` | Risk: scammed, fooled, failed, over budget. |
| Pass | `bg-pass`, `text-pass-ink`, `bg-pass-soft` | Pass, success, "Live" dot. |
| Amber | `bg-amber`, `text-amber-ink`, `bg-amber-soft` | Warn: flagged, wrong item. |

Status colour always ships with a word or icon (`StatusCheck`, `Badge`), never colour alone.

## 3. Type

| Style | How |
|---|---|
| Display (one per page, hero only) | `<DisplayTitle size="display" as="h1" line1 line2 animate />`. 40–76px, −0.045em, weight 560. Line 2 is lavender. |
| Section title | `<SectionHead title={["Leaderboard.", "Ranked, with uncertainty."]} note label />`. 30–44px, two-tone. End line 1 with a full stop. |
| Page title (inner pages) | `<PageHeader>` in `ui.tsx`: 40px, −0.035em. |
| Card / tile title | 15–21px, `font-[540–560]`, `tracking-[-0.015em … -0.03em]`. |
| Body | 13.5–16px, `text-ink-3` for prose next to big type, `leading-relaxed`. |
| Micro-label | `<MicroLabel dot="pass">` or the `.micro` class: 11px uppercase +0.12em. Use it for eyebrows, column headers and captions. Smaller variant: `className="!text-[10px]"`. |
| KPI numeral | `<Stat size="md / lg / xl">`: 34, 48 or 64px, `font-light`, tight tracking, micro-label below. |
| Mono | Only for ids, hashes and money-per-task (`font-mono text-[11.5–12.5px]`). |

`h1`–`h4` get `text-wrap: balance` and `p`/`li` get `pretty` automatically. Big headings use `.optical-left` (−0.055em) so the glyph's side-bearing lines up with the text edge below. `DisplayTitle` already does this.

## 4. Spacing, radius and shadow

**Spacing scale (px):** 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128. Tile padding is 24 (inner pages) to 28–36 (hero/KPI). Gaps between tiles are 16 (`gap-4`). Sections are 112 apart on home (`mt-28`).

**Radius:**

| Token | px | Use |
|---|---|---|
| `rounded-tile` | 28 | Top-level tiles (home). `ui.Card` and `ui.Table` use 24. |
| `rounded-card` | 22 | Hanging cards, nested cards, phone list cards. |
| `rounded-capsule` | 20 | List rows (`CapsuleRow`, leaderboard, runs). |
| `rounded-key` | 14 | Icon tiles, small square buttons. |
| `rounded-chip` | 10 | Heatmap and matrix cells. |
| `rounded-full` | – | Pills, buttons, inputs, badges, tickers. |

**Nested radius rule:** inner radius = outer radius − padding. `<Tile radius={28} pad={8}>` sets `--r` and `--p`, so a child with `.r-nested` gets 20px. In JS, use `nested(28, 8)`. A text-only tile with padding ≥ radius has square-ish inner content. That is correct; don't round its children.

**Shadow levels:**

| Class | When |
|---|---|
| `shadow-key` | Small things on a tile or on the canvas: capsule rows, icon tiles, white pills, round buttons. |
| `shadow-tile` | Resting tiles. |
| `shadow-raised` | Hover state of interactive tiles/rows, hanging cards, the hero figure. |
| `shadow-float` | Things above the page: nav, drawer, tooltips. |
| `shadow-well` | Inset wells: tickers, empty states, tracks. |
| `shadow-ink` | Black pill buttons. |

Hover = `shadow-key → shadow-raised` (plus at most a 1px lift). Do not scale tiles.

## 5. Components (`@/design`)

### Surfaces and layout
- **`Tile`** `{ as?, pad=24, radius=28, level="tile"|"raised"|"float"|"flat", interactive?, grain?, className, style }`. Use it for every content block. With `interactive` it lifts on hover. `grain` adds noise; use it only over gradients.
- **`SectionHead`** `{ title: [line1, line2?], note?, label?, dot?, actions?, id? }`. Use it as the head of every major section. Put `id` on it and `aria-labelledby` on the section.
- **`DisplayTitle`** `{ line1, line2?, as, size="display"|"title", tone2="lavender"|"grey", animate? }`. With `animate` it uses a clip-path rise. Use it for the hero only.
- **`MicroLabel`** `{ children, dot?: "pass"|"accent"|"coral"|"violet"|"amber"|"ink"|"muted", pulse? }`. A pulsing dot means *live*.
- **`ScrollFade`** `{ children, fade=40, label?, className, innerClassName }`. Wrap every horizontally scrollable area in it, for example wide tables below `lg`. Edges fade only when there is more to scroll.

### Controls
- **`Pill`** `{ href? | onClick?, variant="ink"|"surface"|"soft"|"ghost"|"accent", size="sm"|"md"|"lg" }`. `pillClass(variant, size)` gives you the class string.
- **`ArrowButton`** `{ href? | onClick?, label (required, aria), size=32, tone="ink"|"surface", direction="up-right"|"right" }`. Its hit area is 44px.
- **`PlusButton`** `{ onClick, label }`: a round-cornered "+" key.
- **`IconTile`** `{ children (lucide icon ~18px), size=44, tone }`: a square white key for list leading icons.
- **`CapsuleRow`** `{ href?, leading?, title, subtitle?, trailing?, children? }`: list rows like reference 1/3. Use it for task lists, trace lists, guardrail decisions and red-team scams.
- **`StatusCheck`** `{ tone="pass"|"fail"|"warn"|"neutral", children }` renders "✓ Passed" or "✕ Scammed" as coloured text. Prefer it over a badge when the status sits in a row's trailing slot.
- **`Stat`** `{ label, value, sub?, size, tone?: "pass"|"coral"|"accent", labelPosition }`. Wrap a group of them in `<dl>`. `ui.Stat` (smaller, label-above) still exists for dense pages.
- **`Mark`**: the logo glyph.

### Live and atmosphere
- **`Bloom`** `{ tone="blue-violet"|"dusk"|"blue"|"violet"|"coral"|"green"|"ink", placement="top"|"top-right"|"bottom"|"center"|"bottom-left", intensity=1, drift }`. It fills the nearest positioned ancestor at `-z-10`, so the parent needs `relative isolate`. Use at most **one per page**, behind the page hero. For full bleed, wrap it in `absolute left-1/2 w-screen -translate-x-1/2`. `html` and `body` clip x-overflow.
- **`Orb` / `GlassSphere`** `{ size=200, hue, active?, label?, children }`. Use it **only for live state**: run in progress (`active`, blue), idle (violet), benchmark health. Put one short line plus one number inside. Don't use it as decoration or as an avatar.
- **`OrbDot`** is a tiny orb for inline live indicators.

### Data
- **`HalftoneField`** `{ ridges: Ridge[], domain=[0,1], axisTicks, axisLabel, rowHeight, overlap=2.1, spacing, format, valueLabel }` renders a canvas dot-matrix ridgeline.
  - Ridge type: `{ key, label, sub?, href?, beta?: {a,b} | pdf?: (x)=>number, interval: {mean,lower,upper}, n?, tone? }`.
  - Use `betaFromMean(mean, n)` to rebuild the Beta(1+s, 1+f) posterior from `ModelStats.reliability`.
  - Encoding: height ∝ √density on a shared scale; the dense core is the interval, pale skirts are the tails, the dotted ink stem is the mean. Hovering dims the other ridges and shows a tooltip. Labels are real links.
  - Use it for any distribution-per-entity view, such as a model page's posterior or a red-team round's score landscape.
- **`DotBar`** `{ value 0–1, interval?, dots=30, pitch=5, rows=1–3, tone="accent"|"coral"|"pass"|"violet"|"ink", label (aria) }` replaces every progress bar, CI bar and meter in new code.
- **`DotCell` / `DotHeatmap` / `DotScaleLegend`**: a rate as ordered-dither density (32 dots). `charts.Heatmap` and `charts.ScaleLegend` already render these.
- **`DotSparkline`** `{ values, base?, height, pitch, tone, endLabel, label }`: columns of dots, with the last column in ink.
- **`.halftone` CSS class** gives a dot-screen fill for any div. Set `--dot` (colour) and `--dot-size`. `charts.RateBars` and `charts.CountBars` use it.
- **`HangingCards`** `{ cards: HangingCard[] }`, where a card is `{ key, eyebrow, index, title, subtitle?, body?, back, href?, hrefLabel?, iridescent? }`. It is a podium or showcase for 3–5 items. Exactly one card is `iridescent` (the #1). Use it once per page at most; it is a moment, not a list.

### Hooks
`useInView(ref)`, `useSize()`, `useReducedMotionPref()`, `usePageVisible()`.

### Legacy (`components/ui.tsx`, `components/charts.tsx`)
All names and props are unchanged and restyled onto these tokens. They are fine to keep using: `Card`, `Section`, `PageHeader`, `Table`/`Th`/`Td`/`Tr`, `Badge`, `Chip`, `buttonClass`, `CIBar`, `Heatmap`, `RateBars`, `LineChart`, and the rest. When you touch a page, prefer upgrading to `Tile`, `SectionHead`, `CapsuleRow`, `DotBar` and `Pill`.

## 6. Do / don't

| Do | Don't |
|---|---|
| Put a white tile on the canvas, and canvas-coloured cells inside the tile. | Use grey tiles, or white-on-white without a shadow. |
| Use one black pill per view. | Use blue filled buttons (`bg-accent`) for primary actions. |
| Use a micro-label for every eyebrow and column header. | Use bold 12px grey headers. |
| Use a thin 48–64px numeral with a micro-label under it. | Use semibold KPI numbers. |
| Use dots for magnitude (`DotBar`, `.halftone`). | Use solid rectangles, gradients-as-data or rainbow ramps. |
| Use coral only for risk outcomes. | Use coral for a "series 4" or for emphasis. |
| Use a bloom behind a hero, at low intensity. | Use blooms behind data, or several per page. |
| Use `ScrollFade` around overflow-x areas. | Show bare scrollbars on wide content. |
| Make capsule rows whole-row links (stretched `after:absolute after:inset-0`). | Nest links inside links. |
| Give hit targets ≥ 40–44px (`.hit`, `.tap`). | Use 24px icon buttons without padding. |

## 7. Motion

- Use these springs (`SPRING` in tokens.ts): `snappy` for toggles and indicators (~180ms), `soft` for layout and entrances (~300ms), `pendulum` for hanging things only, and `flip` for card flips. The CSS ease is `var(--ease-out-soft)`; the JS ease is `EASE`.
- Entrances are one fade/rise of ≤8–16px, 500–700ms, with a stagger of 50–80ms. Never bounce text.
- Ambient motion runs as CSS keyframes, which cost nothing per frame. Orbs breathe slowly (6s idle, 3.2s active), blooms drift over 22s, and cards sway at ±0.5°. `HalftoneField` breathes on canvas at about 30fps and only while visible.
- Pause offscreen: `useInView`, then add the `.paused` class or skip the rAF loop. Canvas also stops when the tab is hidden.
- Reduced motion has three layers:
  - The global CSS media query kills keyframes and transitions.
  - `<MotionProvider>` (in the root layout) sets `MotionConfig reducedMotion="user"`.
  - Canvas code checks `useReducedMotionPref()` and draws one static frame.
- Do **not** branch render output on `useReducedMotion()` during SSR; it causes hydration mismatches. Let the provider handle it.
- Numbers roll (`components/home/RollingNumber`), and live tickers swap with a 10px slide (`AnimatePresence mode="popLayout"`).

## 8. Craft checklist (reference 6), and where each item lives

| Item | Where |
|---|---|
| OKLCH | `@theme`, `tokens.ts` |
| Noise grain | `.grain` (masked to the bloom, iridescent card) |
| Shadows not borders | `--shadow-*` |
| Nested radius | `Tile` `--r`/`--p` + `.r-nested`, `nested()` |
| Tabular numbers | `body` |
| Optical alignment | `.optical-left` |
| Letter spacing | display −0.045em, micro +0.12em |
| Text wrapping | base layer |
| Hit areas | `.hit` (44px), `.tap` (40px below lg) |
| HTML background | `html { background: canvas }` + `viewport.themeColor` |
| clip-path | `.rise-in` headline reveal |
| Scroll fades | `ScrollFade` + `.scroll-fade` |

## 9. Gotchas

- Custom utilities (`.micro`, `.grain`, `.hit`, `.halftone`, …) live in `@layer components`, so Tailwind utilities override them. You can write `className="micro text-ink"` without `!`. (Some home code still uses `!text-[10px]`; it's harmless.)
- `overflow-x-auto` clips shadows vertically. Give scrolling containers `pt-1 pb-3` and a negative margin with matching padding (see `LeaderboardTable`).
- In flex/3D stacks, don't put a top margin on the first child of a transformed wrapper: margins collapse through it and offset absolutely positioned siblings. Use padding.
- The nav switches to the drawer below **1180px** (`DRAWER_MQ` in `Nav.tsx`).
