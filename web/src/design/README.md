# Bonded design system: "sunlit ledger"

White paper, warm ink, and light. Colour arrives as **bursts of gold and sage that fade into white**, never as boxes.
The home page (`src/app/HomeView.tsx` + `src/components/home/*`) is the reference. When in doubt, copy what it does.

```ts
import { Tile, Pill, MicroLabel, Mark, DotBar, SPRING, EASE, C, HUES } from "@/design";
```

Tokens live in two places that must stay in sync:
- **CSS**: `src/app/globals.css`, `@theme` block → Tailwind classes (`bg-canvas`, `text-ink-3`, `text-accent`, `bg-gold`, `shadow-float`, …) plus the `.burst`, `.idle-float`, `.text-gold-sweep` and `.numeral` utilities.
- **JS**: `src/design/tokens.ts` (`C`, `HUES`, `SPACE`, `RADIUS`, `SPRING`, `EASE`) for SVG, canvas and motion.

---

## 1. Principles

1. **One idea per screen.** A screen says one thing: a question, a ranking, a number, three steps, one command. If a section needs a legend, a filter bar and a caption, it belongs in the Lab.
2. **Hide the machinery.** Runs, tasks, traces, red team, guardrail, compare, methodology, arena and the run launcher are fully working, but they live in **the Lab** (the nav's "Lab" sheet and the footer). They never appear on the home page or in the primary nav.
3. **White is the material.** Lots of it. Sections are separated by space (`py-24 sm:py-36`), never by lines or cards.
4. **Colour is light.** Use a `.burst` behind a moment, not a coloured box around it. Two bursts per section at most.
5. **Big type, few words.** Display headings are 40–118px, tight tracking, balanced wraps. Body copy is one line where possible.
6. **One black pill per view.** That's the primary action. Everything else is a quiet text link with an arrow.
7. **Coral means risk, and only risk.** Sage is calm or pass. Gold is brand and data. Sky is the one cool accent, used as atmosphere only.
8. **Motion is slow, physical and optional.** Things float, drift and fade. Everything honours `prefers-reduced-motion` (§6).

## 2. Palette (`globals.css` @theme)

| Role | Class / var | Value | Use |
|---|---|---|---|
| Canvas | `bg-canvas` | `oklch(99.4% .003 90)` | The page. A breath of ivory on white. |
| Surface | `bg-surface` | white | Tiles, sheets, code pills. |
| Ivory | `bg-ivory` | `oklch(98% .012 88)` | Hovered rows and links. |
| Canvas sunk | `bg-canvas-sunk` | `oklch(96.6% .006 85)` | Tracks, inputs, skeletons. |
| Ink → ink-5 | `text-ink`, `text-ink-2`, `text-ink-3`, `text-ink-4`, `text-ink-5` | warm, hue 70 | ink-3 is the lightest text that passes 4.5:1; ink-4/5 are decorative. |
| **Accent (deep gold)** | `text-accent`, `bg-accent` | `oklch(52% .105 72)` | Links, focus, primary data, the #1 rank. 5:1 on white. |
| Gold | `bg-gold`, `text-gold` | `oklch(78% .125 84)` | Bars, dots, glows. Never for text. |
| Gold deep | `text-gold-deep` | `oklch(64% .13 75)` | The second line of a two-tone display headline (≥3:1 at display size). |
| Sage | `bg-sage`, `text-sage-ink`, `bg-sage-soft` | hue 145–150 | Calm, the good-news finding, secondary glows. |
| Sky | `bg-sky` | `oklch(83% .07 225)` | Atmosphere only (the connect section glow). |
| Coral | `bg-coral`, `text-coral-ink`, `bg-coral-soft` | hue 30–35 | Risk: scammed, fooled, failed. Nothing else. |
| Pass | `bg-pass`, `text-pass-ink` | hue 152 | Outcome: passed. |

**Legacy names are remapped, not removed**, so every Lab page inherits the palette: `accent*` → deep gold, `violet*` → sage ink, `lavender` → deep gold, `HUES.blue` → gold, `HUES.violet` → sage. Don't use the legacy names in new code.

## 3. Glow recipes

`.burst` is a soft elliptical blob centred at `(--bx, --by)` of its positioned parent, `--bs` wide (aspect 1.3), at `z-index: -1`. Give the parent `relative isolate`. The gradient ends exactly at the blob's own edge (`closest-side`), so it never shows a hard line even when it spills into the next section. Masked grain is built in, so it never bands.

```tsx
<section className="relative isolate">
  <div aria-hidden className="burst burst-gold" style={{ "--bx": "4%", "--by": "14%", "--bs": "min(860px,120vw)", "--bo": 0.7 }} />
  …
</section>
```

| Recipe | Where | Settings |
|---|---|---|
| Section corner wash | ranking | gold at (4%, 14%) 860px .7 + sage at (100%, 78%) 760px .6 |
| Risk moment | finding (bad) | coral centred 1200px + small gold offset (68%, 64%) 560px .7 |
| Good-news moment | finding (good) | sage centred 1200px + gold offset |
| Object halo | how-it-works | the tone of the object, `--bs: 120%` of a square box |
| Cool breath | connect | sky centred 1000px .9 |
| Sheet / footer | Lab sheet, footer | gold top-right + sage bottom-left, small |

Clip horizontally on the page container (`overflow-x-clip`), never on the section, or the glow gets cut.

## 4. Type

Geist (sans) and Geist Mono. Numbers are tabular everywhere (set on `body`), except giant figures, which use `.pnum`.

| Level | Size | Weight / tracking | Example |
|---|---|---|---|
| Hero | `clamp(42px, 6.7vw, 112px)`, leading .96 | 600, −0.055em | "Would you trust an AI / with your wallet?" (line 2 is `.text-gold-sweep`) |
| Numeral | `clamp(88px, 19vw, 300px)`, `.numeral .pnum` | 600, −0.06em | "1 in 10" |
| Section | `clamp(40px, 5.6vw, 72px)`, leading .98 | 600, −0.05em | "The ranking." (always a full stop) |
| Step title | 24px | 580, −0.03em | "Every step is signed and graded." |
| Lead | 17–20px, `text-ink-2` / `text-ink-3` | 400 | one line under a heading |
| Row | 17–19px | 500, −0.02em | model name |
| Score | 26–32px | 560, −0.04em, tabular | 98.7 |
| Caption | 13px, `text-ink-4` | 400 | the single footnote under a list |

Headings use `text-wrap: balance`; paragraphs use `pretty`. Keep line length ≤ 34ch for leads.

## 5. Layout and components

- **Home is full-bleed.** `PageMain` (`components/home/PageMain.tsx`) renders `/` without a container. Every other page gets the 1200px column, padded under the fixed 64px nav (`pt-24 sm:pt-28`).
- **Nav** (`components/Nav.tsx`): logo, then Ranking (`/#ranking`), Watch (`/live`), Connect (`/connect`), and a quiet "Lab" with a dot that turns gold on Lab pages. It is transparent over the hero and becomes frosted white after 24px of scroll (and always off the home page). Phones get the logo plus a menu button. Both open the same **Lab sheet**: a dialog with a focus trap, Esc to close, and focus returned to the opener.
- **The Lab list** lives in `lib/ui/lab.ts` (`LAB_LINKS`, `NEW_RUN`, `PRIMARY_LINKS`). The nav sheet and `SiteFooter` both read it. Add a Lab page there and nowhere else.
- **Home sections** (`components/home/`): `Hero`, `Ranking`, `Finding`, `HowItWorks`, `ConnectStrip`, `SiteFooter`.
- **Primitives** (`@/design`): `Tile`, `Pill`, `MicroLabel`, `SectionHead`, `DisplayTitle`, `Stat`, `CapsuleRow`, `Mark`, `DotBar`/`DotHeatmap`/`DotSparkline`, `Bloom`/`Orb`, `ScrollFade`, `MotionProvider`. All of them are still exported and used by Lab pages, and all of them are restyled by the tokens. On the home page, prefer plain type and `.burst` over tiles.
- **Legacy** `components/ui.tsx` and `components/charts.tsx`: every export name is unchanged.

## 6. Motion

- **Hero parallax** (`components/home/Hero.tsx`). Each layer's speed is the extra translateY per px scrolled:
  - background +0.30;
  - far +0.12 (slightly soft-focus);
  - mid −0.35;
  - near −0.85, which also scales up to 1.24 and cross-fades to a pre-blurred twin.

  On top of that: rotation per layer, a pointer parallax of 5/11/20px on fine pointers, a CSS `.idle-float` bob, and a staggered entrance. Only transforms and opacity move, driven by `motion` values (no React re-renders). Never animate `filter`; cross-fade a blurred copy instead.
- **Reduced motion**: a motion value `k` (1 or 0) multiplies every scroll and pointer transform. It is set after mount, so server and client HTML match. The composition stays the same; it just doesn't move. CSS animations are neutralised globally in `globals.css`.
- **Entrances**: `whileInView` once, `EASE = [0.2, 0.75, 0.15, 1]`, 0.8–1.1s, 60–120ms stagger. Big figures fade in from an 8–10px blur.
- **Feedback**: 150–300ms; springs from `SPRING`.

## 7. What's hidden in the Lab

| Lab page | Holds what used to crowd the home page |
|---|---|
| Runs, New run | latest runs, the run launcher |
| Tasks, Arena | the task suite, the sandbox store |
| Traces | every hash-chained session |
| Red team | the scam gallery and benchmark growth |
| Guardrail | what a spend guard would have stopped |
| Compare | the head-to-head matrix and posteriors |
| Methodology | scoring, intervals, trap heatmap logic |

The old home extras (findings grid, trap heatmap, head-to-head matrix, podium, KPI tiles, the orb live panel and the halftone landscape) are gone from `/`. `HalftoneField`, `HangingCards`, `HomeHero`, `LivePanel` and `Podium` were deleted. `KeyFindings` and `RollingNumber` stay because `/present` and the red-team views use them.

## 8. Gotchas

- `.burst` uses `translate` (not `transform`), so you can still transform its parent.
- Tailwind v4 `translate-*` utilities use the `translate` property, so they compose with `motion`'s `transform`.
- `next/image` qualities: use the default (75). Other values warn until `images.qualities` is configured.
- Hero images that are hidden at a breakpoint still get `sizes` small enough not to waste bytes.
- Anchors land below the fixed nav via `scroll-padding-top: 80px` on `html`.
