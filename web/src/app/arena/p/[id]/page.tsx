// OWNER: Team 1 — Arena product detail page.
import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORY_LABELS, getMerchant, getProduct } from "@/lib/arena";
import { ProductArt, SellerBadge, Stars, StoreHeader, discountPct, usd } from "../../ui";

export const dynamic = "force-dynamic";

const HIDDEN_RE = /<!--[\s\S]*?-->|<span[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/span>/gi;

/** Split description into what a human sees and the bits a human would not notice (agents get the raw text via API). */
function renderDescription(desc: string, injected: boolean) {
  const paras = desc.split(/\n\n+/);
  return paras.map((para, i) => {
    const hidden = para.match(HIDDEN_RE) || [];
    const visible = para.replace(HIDDEN_RE, "").replace(/<[^>]+>/g, "").trim();
    const fine = injected && i === paras.length - 1 && i > 0 && visible;
    return (
      <div key={i}>
        {hidden.map((h, j) => <span key={j} hidden aria-hidden data-agent-text>{h}</span>)}
        {visible && (fine
          ? <p className="mt-6 text-[9px] leading-tight text-gray-200 select-text">{visible}</p>
          : <p className="mb-3 text-sm leading-relaxed text-gray-700">{visible}</p>)}
      </div>
    );
  });
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getProduct(id);
  if (!p) notFound();
  const m = getMerchant(p.merchantId);
  const off = discountPct(p);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <StoreHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <nav className="mb-4 text-xs text-gray-500">
          <Link href="/arena" className="hover:underline">Home</Link> ›{" "}
          <Link href={`/arena?category=${p.category}`} className="hover:underline">{CATEGORY_LABELS[p.category] ?? p.category}</Link> ›{" "}
          <span className="text-gray-700">{p.brand}</span>
        </nav>
        <div className="grid gap-8 rounded-2xl bg-white p-6 shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_280px]">
          <div className="overflow-hidden rounded-xl bg-gray-100">
            <ProductArt p={p} className="h-full w-full" />
          </div>

          <div>
            <p className="text-sm text-blue-700">Brand: {p.brand}</p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight">{p.title}</h1>
            <div className="mt-2"><Stars rating={p.rating} count={p.reviewCount} /></div>
            <hr className="my-4 border-gray-200" />
            <div className="flex items-baseline gap-3">
              {off >= 5 && <span className="text-2xl font-light text-red-600">-{off}%</span>}
              <span className="text-3xl font-bold">{usd(p.price)}</span>
            </div>
            {p.listPrice > p.price && <p className="text-sm text-gray-500">List price: <span className="line-through">{usd(p.listPrice)}</span></p>}

            {Object.keys(p.specs).length > 0 && (
              <table className="mt-5 w-full text-sm">
                <tbody>
                  {Object.entries(p.specs).map(([k, v]) => (
                    <tr key={k} className="border-b border-gray-100">
                      <td className="py-1.5 pr-4 font-medium capitalize text-gray-600">{k}</td>
                      <td className="py-1.5 text-gray-900">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2 className="mb-2 mt-6 text-base font-semibold">About this item</h2>
            {renderDescription(p.description, p.trap?.type === "prompt_injection" || p.source === "redteam")}
          </div>

          <aside className="h-fit rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold">{usd(p.price)}</p>
            <p className="mt-1 text-sm text-green-700">{p.stock > 0 ? (p.stock < 10 ? `Only ${p.stock} left in stock` : "In stock") : "Out of stock"}</p>
            <p className="mt-1 text-xs text-gray-500">Free delivery in 2-4 days</p>
            <button disabled className="mt-4 w-full rounded-full bg-amber-400 py-2 text-sm font-semibold text-gray-900 opacity-90">Add to cart</button>
            <button disabled className="mt-2 w-full rounded-full bg-orange-500 py-2 text-sm font-semibold text-white opacity-90">Buy now</button>
            <p className="mt-2 text-center text-[11px] text-gray-400">Purchasing is done by agents via the Arena API</p>
            <div className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-600">
              <p>Sold by</p>
              <SellerBadge m={m} />
              {m && (
                <p className="mt-1 text-gray-500">
                  {m.rating > 0 ? `${m.rating.toFixed(1)}★ seller rating` : "No ratings yet"} · on Arena {m.ageDays >= 365 ? `${Math.floor(m.ageDays / 365)}+ years` : `${m.ageDays} day${m.ageDays === 1 ? "" : "s"}`}
                </p>
              )}
            </div>
          </aside>
        </div>
        <p className="mt-4 text-[11px] text-gray-400">Item ID {p.id}</p>
      </main>
    </div>
  );
}
