// OWNER: Team 1 — Arena storefront (sandbox store agents shop in).
import Link from "next/link";
import { CATEGORIES, CATEGORY_LABELS, ensureSeeded, search } from "@/lib/arena";
import { read } from "@/lib/db";
import { ProductArt, SellerBadge, Stars, StoreHeader, discountPct, usd } from "./ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Arena Market" };

export default async function ArenaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const category = sp.category || "";
  const maxPrice = sp.maxPrice ? Number(sp.maxPrice) : undefined;
  ensureSeeded();
  const db = read();
  const merchants = new Map(db.merchants.map((m) => [m.id, m]));
  const products = q || category || maxPrice
    ? search({ q, category: category || undefined, maxPrice, limit: 60 })
    : [...db.products].sort((a, b) => b.reviewCount * b.rating - a.reviewCount * a.rating).slice(0, 48);

  const href = (c: string) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (c) u.set("category", c);
    return `/arena${u.toString() ? `?${u}` : ""}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <StoreHeader q={q} category={category} />
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2 text-sm">
          <Link href={href("")} className={`whitespace-nowrap rounded-full px-3 py-1 ${!category ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`}>All</Link>
          {CATEGORIES.map((c) => (
            <Link key={c} href={href(c)} className={`whitespace-nowrap rounded-full px-3 py-1 ${category === c ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`}>
              {CATEGORY_LABELS[c]}
            </Link>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="text-lg font-semibold">
            {q ? <>Results for “{q}”</> : category ? CATEGORY_LABELS[category] : "Popular right now"}
            <span className="ml-2 text-sm font-normal text-gray-500">{products.length} items</span>
          </h1>
          <span className="text-xs text-gray-400">{db.products.length} listings · {db.merchants.length} sellers</span>
        </div>

        {products.length === 0 ? (
          <p className="rounded-lg bg-white p-10 text-center text-gray-500">No results. Try a different search.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((p) => {
              const off = discountPct(p);
              return (
                <Link key={p.id} href={`/arena/p/${p.id}`} className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:shadow-md">
                  <div className="relative aspect-square bg-gray-100">
                    <ProductArt p={p} className="h-full w-full" />
                    {off >= 5 && <span className="absolute left-2 top-2 rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">-{off}%</span>}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <p className="line-clamp-2 text-sm leading-snug text-gray-900 group-hover:text-orange-700">{p.title}</p>
                    <Stars rating={p.rating} count={p.reviewCount} />
                    <div className="mt-auto flex items-baseline gap-2 pt-1">
                      <span className="text-lg font-bold">{usd(p.price)}</span>
                      {p.listPrice > p.price && <span className="text-xs text-gray-400 line-through">{usd(p.listPrice)}</span>}
                    </div>
                    <SellerBadge m={merchants.get(p.merchantId)} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
