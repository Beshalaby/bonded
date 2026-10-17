// Arena store UI helpers (sandbox store agents shop in).
import {
  BookOpen, Camera, Dumbbell, Footprints, Gamepad2, Headphones, House, Laptop, Shirt, ShoppingBag, Smartphone, Sparkles, Store, UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { Merchant, Product } from "@/lib/types";

const ICONS: Record<string, LucideIcon> = {
  audio: Headphones, phones: Smartphone, laptops: Laptop, apparel: Shirt, shoes: Footprints, home: House,
  kitchen: UtensilsCrossed, gaming: Gamepad2, cameras: Camera, beauty: Sparkles, books: BookOpen, fitness: Dumbbell,
};

export function ProductArt({ p, className = "", large }: { p: Pick<Product, "id" | "brand" | "model" | "title" | "category">; className?: string; large?: boolean }) {
  const Icon = ICONS[p.category] ?? ShoppingBag;
  return (
    <div className={`flex flex-col items-center justify-center bg-zinc-50 text-center ${className}`} role="img" aria-label={p.title}>
      <Icon size={large ? 72 : 40} strokeWidth={1.25} className="text-zinc-300" />
      <div className={`mt-3 px-3 font-semibold tracking-tight text-zinc-800 ${large ? "text-[18px]" : "text-[13px]"}`}>{p.brand}</div>
      <div className={`line-clamp-1 px-3 text-zinc-500 ${large ? "text-[14px]" : "text-[11.5px]"}`}>{(p.model || p.title).slice(0, 32)}</div>
    </div>
  );
}

export function Stars({ rating, count }: { rating: number; count: number }) {
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-1 text-[12px]">
      <span className="tracking-tight text-amber-500">{"★".repeat(full)}<span className="text-zinc-200">{"★".repeat(5 - full)}</span></span>
      <span className="text-zinc-500 tnum">{rating.toFixed(1)} ({count.toLocaleString()})</span>
    </span>
  );
}

export const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function discountPct(p: Pick<Product, "price" | "listPrice">) {
  return p.listPrice > p.price ? Math.round((1 - p.price / p.listPrice) * 100) : 0;
}

export function SellerBadge({ m }: { m?: Merchant }) {
  if (!m) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-zinc-600">
      <span className="truncate">{m.name}</span>
      {m.verified ? <span className="shrink-0 rounded bg-blue-50 px-1 text-[10.5px] font-medium text-blue-700">Verified</span>
        : m.ageDays < 30 ? <span className="shrink-0 rounded bg-zinc-100 px-1 text-[10.5px] text-zinc-500">New seller</span> : null}
    </span>
  );
}

/** Frames the store inside SpendBench: what it is, plus search. */
export function StoreHeader({ q = "", category = "", listings, sellers }: { q?: string; category?: string; listings?: number; sellers?: number }) {
  return (
    <div className="mb-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-zinc-900">
            <Store size={22} strokeWidth={1.75} className="text-zinc-400" /> Arena
          </h1>
          <p className="mt-1.5 max-w-2xl text-[15px] text-zinc-600">
            The sandbox store agents shop in. Some listings are traps: knockoffs, inflated discounts, hidden instructions, brand-new sellers and gouged prices.
            They look the way they would to a shopper.
          </p>
        </div>
        {listings != null && <div className="text-[13px] text-zinc-500 tnum">{listings} listings · {sellers} sellers</div>}
      </div>
      <form action="/arena" className="flex max-w-2xl overflow-hidden rounded-md border border-zinc-200 shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
        {category && <input type="hidden" name="category" value={category} />}
        <input name="q" defaultValue={q} placeholder="Search products, brands and more" className="h-9 w-full px-3 text-[13.5px] text-zinc-900 outline-none placeholder:text-zinc-400" />
        <button className="border-l border-zinc-200 bg-zinc-50 px-4 text-[13px] font-medium text-zinc-700 hover:bg-zinc-100">Search</button>
      </form>
    </div>
  );
}
