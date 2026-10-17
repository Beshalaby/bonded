// OWNER: Team 1 (Arena store UI helpers)
import Link from "next/link";
import type { Merchant, Product } from "@/lib/types";

const PALETTE: Record<string, [string, string, string]> = {
  audio: ["#eef2ff", "#c7d2fe", "🎧"], phones: ["#ecfeff", "#a5f3fc", "📱"], laptops: ["#f1f5f9", "#cbd5e1", "💻"],
  apparel: ["#fdf2f8", "#fbcfe8", "👕"], shoes: ["#fff7ed", "#fed7aa", "👟"], home: ["#f0fdf4", "#bbf7d0", "🏠"],
  kitchen: ["#fefce8", "#fde68a", "🍳"], gaming: ["#f5f3ff", "#ddd6fe", "🎮"], cameras: ["#f8fafc", "#e2e8f0", "📷"],
  beauty: ["#fff1f2", "#fecdd3", "✨"], books: ["#fffbeb", "#fde68a", "📚"], fitness: ["#ecfdf5", "#a7f3d0", "🏋️"],
};

export function ProductArt({ p, className = "" }: { p: Pick<Product, "id" | "brand" | "model" | "title" | "category">; className?: string }) {
  const [bg, accent, icon] = PALETTE[p.category] ?? ["#f3f4f6", "#e5e7eb", "🛍️"];
  const label = (p.model || p.title).slice(0, 26);
  return (
    <svg viewBox="0 0 400 400" className={className} role="img" aria-label={p.title}>
      <defs>
        <linearGradient id={`g-${p.id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={bg} />
          <stop offset="1" stopColor={accent} />
        </linearGradient>
      </defs>
      <rect width="400" height="400" fill={`url(#g-${p.id})`} />
      <circle cx="200" cy="170" r="92" fill="white" opacity="0.65" />
      <text x="200" y="200" textAnchor="middle" fontSize="88">{icon}</text>
      <text x="200" y="310" textAnchor="middle" fontSize="26" fontWeight="700" fill="#111827" fontFamily="ui-sans-serif, system-ui">{p.brand}</text>
      <text x="200" y="344" textAnchor="middle" fontSize="20" fill="#4b5563" fontFamily="ui-sans-serif, system-ui">{label}</text>
    </svg>
  );
}

export function Stars({ rating, count }: { rating: number; count: number }) {
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className="text-amber-500 tracking-tight">{"★".repeat(full)}<span className="text-gray-300">{"★".repeat(5 - full)}</span></span>
      <span className="text-gray-500">{rating.toFixed(1)} ({count.toLocaleString()})</span>
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
    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
      <span className="truncate">{m.name}</span>
      {m.verified ? <span className="rounded bg-blue-50 px-1 text-[10px] font-medium text-blue-700">✓ Verified</span>
        : m.ageDays < 30 ? <span className="rounded bg-gray-100 px-1 text-[10px] text-gray-500">New seller</span> : null}
    </span>
  );
}

export function StoreHeader({ q = "", category = "" }: { q?: string; category?: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/arena" className="shrink-0 text-xl font-extrabold tracking-tight text-gray-900">
          arena<span className="text-orange-500">.market</span>
        </Link>
        <form action="/arena" className="flex flex-1 overflow-hidden rounded-lg border border-gray-300 focus-within:border-orange-400">
          {category && <input type="hidden" name="category" value={category} />}
          <input name="q" defaultValue={q} placeholder="Search products, brands and more" className="w-full px-3 py-2 text-sm text-gray-900 outline-none" />
          <button className="bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-600">Search</button>
        </form>
        <span className="hidden text-sm text-gray-600 sm:inline">🛒 Cart</span>
      </div>
    </header>
  );
}
