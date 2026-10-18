// HeroPanel: the rounded colour-field panel that opens a page, in the language of the home and Penny heroes
// (a drifting .mesh behind, floating money art at the edges). It breaks out to the column's gutters and tucks up
// under the floating nav when it is the first thing on the page.
import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { cx } from "./ui";

export type HeroTone = "gold" | "sage" | "sky" | "dusk" | "coral" | "shield";

type Art = { src: string; className: string; style?: CSSProperties };

// Each tone gets its own pair of floating pieces so the pages don't all look the same.
const ART: Record<HeroTone, Art[]> = {
  gold: [
    { src: "/hero/coin.png", className: "right-[6%] top-[14%] w-[150px]", style: { ["--fr" as string]: "6deg", ["--fd" as string]: "10s" } },
    { src: "/hero/dollar.png", className: "right-[22%] bottom-[-6%] w-[120px]", style: { ["--fr" as string]: "-5deg", ["--fd" as string]: "12s", ["--fdl" as string]: "-4s" } },
  ],
  sage: [
    { src: "/hero/leaf_money.png", className: "right-[4%] top-[6%] w-[200px]", style: { ["--fr" as string]: "4deg", ["--fd" as string]: "11s" } },
    { src: "/hero/dollar_coin.png", className: "right-[24%] bottom-[2%] w-[96px]", style: { ["--fr" as string]: "-7deg", ["--fd" as string]: "9s", ["--fdl" as string]: "-3s" } },
  ],
  sky: [
    { src: "/hero/certificate_coin.png", className: "right-[6%] top-[12%] w-[150px]", style: { ["--fr" as string]: "-5deg", ["--fd" as string]: "10s" } },
    { src: "/hero/coin.png", className: "right-[23%] bottom-[0%] w-[90px]", style: { ["--fr" as string]: "8deg", ["--fd" as string]: "8s", ["--fdl" as string]: "-2s" } },
  ],
  dusk: [
    { src: "/hero/dollar_coin.png", className: "right-[7%] top-[10%] w-[140px]", style: { ["--fr" as string]: "6deg", ["--fd" as string]: "11s" } },
    { src: "/hero/leaf_money.png", className: "right-[21%] bottom-[-8%] w-[150px]", style: { ["--fr" as string]: "-4deg", ["--fd" as string]: "13s", ["--fdl" as string]: "-5s" } },
  ],
  coral: [
    { src: "/hero/dollar.png", className: "right-[6%] top-[10%] w-[150px]", style: { ["--fr" as string]: "-6deg", ["--fd" as string]: "10s" } },
    { src: "/hero/certificate_coin.png", className: "right-[24%] bottom-[-2%] w-[100px]", style: { ["--fr" as string]: "7deg", ["--fd" as string]: "9s", ["--fdl" as string]: "-3s" } },
  ],
  shield: [
    { src: "/hero/certificate_coin.png", className: "left-[5%] top-[16%] w-[130px]", style: { ["--fr" as string]: "-6deg", ["--fd" as string]: "11s" } },
    { src: "/hero/coin.png", className: "right-[6%] top-[22%] w-[110px]", style: { ["--fr" as string]: "7deg", ["--fd" as string]: "9s", ["--fdl" as string]: "-3s" } },
    { src: "/hero/leaf_money.png", className: "right-[12%] bottom-[4%] w-[150px]", style: { ["--fr" as string]: "-4deg", ["--fd" as string]: "13s", ["--fdl" as string]: "-6s" } },
  ],
};

export const isDarkTone = (t: HeroTone) => t === "shield";

export function HeroPanel({ tone = "gold", children, className, inner, art = true, labelledBy }: {
  tone?: HeroTone; children: ReactNode; className?: string; inner?: string; art?: boolean; labelledBy?: string;
}) {
  return (
    <section aria-labelledby={labelledBy}
      className={cx("relative -mx-2 mb-12 first:-mt-9 sm:-mx-5 sm:mb-16 sm:first:-mt-12", className)}>
      <div className="relative isolate overflow-hidden rounded-[28px] sm:rounded-[40px]">
        <div aria-hidden className={`mesh mesh-${tone} -z-10`} />
        {art && (
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden md:block">
            {ART[tone].map((a) => (
              <Image key={a.src} src={a.src} alt="" width={300} height={300} priority={false}
                className={cx("idle-float absolute h-auto drop-shadow-[0_24px_30px_oklch(20%_0.03_70/0.25)]", a.className)} style={a.style} />
            ))}
          </div>
        )}
        <div className={cx("relative px-6 py-14 sm:px-12 sm:py-20", inner)}>{children}</div>
      </div>
    </section>
  );
}
