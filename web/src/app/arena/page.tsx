// Arena storefront (sandbox store agents shop in).
import Link from "next/link";
import { CATEGORIES, CATEGORY_LABELS, ensureSeeded, search } from "@/lib/arena";
import { read } from "@/lib/db";
import { ProductArt, SellerBadge, Stars, StoreHeader, discountPct, usd } from "./ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Arena" };

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
  const tab = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 max-lg:py-2.5 text-[12.5px] transition-colors ${active ? "border-accent bg-accent-soft text-accent" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`;

  return (
    <>
      <StoreHeader q={q} category={category} listings={db.products.length} sellers={db.merchants.length} />
      <nav className="mb-6 flex flex-wrap gap-1.5 max-sm:-mx-4 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-4 max-sm:pb-1 max-sm:[scrollbar-width:none]">
        <Link href={href("")} className={tab(!category)}>All</Link>
        {CATEGORIES.map((c) => <Link key={c} href={href(c)} className={tab(category === c)}>{CATEGORY_LABELS[c]}</Link>)}
      </nav>

      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-[15px] font-semibold text-zinc-900">
          {q ? <>Results for “{q}”</> : category ? CATEGORY_LABELS[category] : "Popular listings"}
        </h2>
        <span className="text-[13px] text-zinc-500 tnum">{products.length} items</span>
      </div>

      {products.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-[13px] text-zinc-500">No results. Try a different search.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((p) => {
            const off = discountPct(p);
            return (
              <Link key={p.id} href={`/arena/p/${p.id}`} className="group flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white transition-colors hover:border-zinc-300">
                <div className="relative aspect-[4/3] border-b border-zinc-100">
                  <ProductArt p={p} className="h-full w-full" />
                  {off >= 5 && <span className="absolute left-2 top-2 rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-rose-600 ring-1 ring-rose-200 tnum">−{off}%</span>}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1 p-3 max-sm:p-2.5">
                  <p className="line-clamp-2 text-[13px] leading-snug text-zinc-900 group-hover:text-accent">{p.title}</p>
                  <Stars rating={p.rating} count={p.reviewCount} />
                  <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-1">
                    <span className="font-mono text-[14px] font-semibold text-zinc-900">{usd(p.price)}</span>
                    {p.listPrice > p.price && <span className="font-mono text-[11.5px] text-zinc-400 line-through">{usd(p.listPrice)}</span>}
                  </div>
                  <SellerBadge m={merchants.get(p.merchantId)} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
