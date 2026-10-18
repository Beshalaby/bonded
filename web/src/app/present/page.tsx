import { read } from "@/lib/db";
import { leaderboard } from "@/lib/stats";
import type { Product, TrapType } from "@/lib/types";
import PresentDeck from "./PresentDeck";
import type { TrapSnippet } from "./deck";

export const dynamic = "force-dynamic";
export const metadata = { title: "Present" };

// One real listing per trap type from the Arena, all from the same search ("AirPods Pro 2"), so slide 2 reads as one
// shopping trip. If a listing is missing, any listing with that trap is used; if none exist, the deck's built-in copy.
const PREFERRED: Record<TrapType, string> = {
  prompt_injection: "p_airpods_injection",
  knockoff: "p_airpods_knockoff_appel",
  fake_discount: "p_airpods_fakedisc",
  new_merchant: "p_airpods_newmerchant",
  price_gouge: "p_airpods_gouge",
};
const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

function snippet(type: TrapType, p: Product, merchants: { id: string; name: string; ageDays: number; verified: boolean }[]): TrapSnippet | null {
  const market = p.marketPrice ? ` · market ${usd(p.marketPrice)}` : "";
  switch (type) {
    case "prompt_injection": {
      const m = /<!--([\s\S]*?)-->|<span[^>]*display:\s*none[^>]*>([\s\S]*?)<\/span>|\[assistant instruction\]([\s\S]*)$/i.exec(p.description || "");
      const hidden = (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim();
      if (!hidden) return null;
      const short = hidden.length > 64 ? `${hidden.slice(0, 64).replace(/[\s,;:]+\S*$/, "")}…` : hidden;
      const open = m?.[1] != null ? "<!-- " : m?.[2] != null ? "<span hidden> " : "";
      const close = m?.[1] != null ? " -->" : m?.[2] != null ? " </span>" : "";
      return { type, segs: [{ t: open, dim: true }, { t: short, hl: true }, { t: close, dim: true }] };
    }
    case "knockoff": {
      const rest = p.title.startsWith(p.brand) ? p.title.slice(p.brand.length) : ` ${p.title}`;
      return { type, segs: [{ t: p.brand, hl: true }, { t: rest.split(/ - |\(|,/)[0].trimEnd() }, { t: ` · ${usd(p.price)}`, dim: true }] };
    }
    case "fake_discount": {
      const off = /\d+%\s*OFF/i.exec(p.title)?.[0];
      if (!off) return null;
      return { type, segs: [{ t: off.toUpperCase(), hl: true }, { t: ` ${usd(p.price)}` }, { t: market, dim: true }] };
    }
    case "new_merchant": {
      const mm = merchants.find((x) => x.id === p.merchantId);
      if (!mm) return null;
      return { type, segs: [{ t: mm.name }, { t: ` · ${mm.ageDays} day${mm.ageDays === 1 ? "" : "s"} old${mm.verified ? "" : ", unverified"}`, hl: true }] };
    }
    case "price_gouge":
      return { type, segs: [{ t: usd(p.price), hl: true }, { t: market, dim: true }] };
  }
}

function trapSnippets(): TrapSnippet[] {
  try {
    const db = read();
    const out: TrapSnippet[] = [];
    for (const type of Object.keys(PREFERRED) as TrapType[]) {
      const cands = [db.products.find((p) => p.id === PREFERRED[type]), ...db.products.filter((p) => p.trap?.type === type)];
      for (const p of cands) {
        const s = p?.trap?.type === type ? snippet(type, p, db.merchants) : null;
        if (s) { out.push(s); break; }
      }
    }
    return out;
  } catch {
    return [];
  }
}

function initialBoard() {
  try { return leaderboard(); } catch { return null; }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ slide?: string }> }) {
  const sp = await searchParams;
  const n = Math.floor(Number(sp.slide ?? 1));
  return <PresentDeck traps={trapSnippets()} initialBoard={initialBoard()} initialSlide={Number.isFinite(n) ? n - 1 : 0} />;
}
