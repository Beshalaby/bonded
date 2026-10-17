// Arena product detail page.
import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORY_LABELS, getMerchant, getProduct } from "@/lib/arena";
import { ProductArt, SellerBadge, Stars, discountPct, usd } from "../../ui";

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
          ? <p className="mt-6 select-text text-[9px] leading-tight text-zinc-200">{visible}</p>
          : <p className="mb-3 text-[14px] leading-relaxed text-zinc-700">{visible}</p>)}
      </div>
    );
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: getProduct(id)?.title ?? "Arena" };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getProduct(id);
  if (!p) notFound();
  const m = getMerchant(p.merchantId);
  const off = discountPct(p);

  return (
    <>
      <nav className="mb-5 flex items-center gap-1.5 text-[13px] text-zinc-500">
        <Link href="/arena" className="hover:text-zinc-900">Arena</Link><span className="text-zinc-300">/</span>
        <Link href={`/arena?category=${p.category}`} className="hover:text-zinc-900">{CATEGORY_LABELS[p.category] ?? p.category}</Link><span className="text-zinc-300">/</span>
        <span className="text-zinc-700">{p.brand}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_280px]">
        <div className="aspect-square overflow-hidden rounded-lg border border-zinc-200">
          <ProductArt p={p} className="h-full w-full" large />
        </div>

        <div className="min-w-0">
          <p className="text-[13px] text-zinc-500">{p.brand}</p>
          <h1 className="mt-1 text-[22px] font-semibold leading-snug tracking-[-0.015em] text-zinc-900">{p.title}</h1>
          <div className="mt-2"><Stars rating={p.rating} count={p.reviewCount} /></div>
          <div className="my-5 h-px bg-zinc-200" />
          <div className="flex items-baseline gap-3">
            <span className="text-[26px] font-semibold tracking-[-0.02em] text-zinc-900 tnum">{usd(p.price)}</span>
            {off >= 5 && <span className="text-[15px] font-medium text-rose-600 tnum">−{off}%</span>}
          </div>
          {p.listPrice > p.price && <p className="text-[13px] text-zinc-500">List price <span className="font-mono line-through">{usd(p.listPrice)}</span></p>}

          {Object.keys(p.specs).length > 0 && (
            <table className="mt-6 w-full text-[13px]">
              <tbody>
                {Object.entries(p.specs).map(([k, v]) => (
                  <tr key={k} className="border-b border-zinc-100">
                    <td className="w-1/3 py-2 pr-4 capitalize text-zinc-500">{k}</td>
                    <td className="py-2 text-zinc-900">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2 className="mb-2 mt-7 text-[15px] font-semibold text-zinc-900">About this item</h2>
          {renderDescription(p.description, p.trap?.type === "prompt_injection" || p.source === "redteam")}
        </div>

        <aside className="h-fit rounded-lg border border-zinc-200 p-4 md:col-span-2 lg:col-span-1">
          <p className="text-[20px] font-semibold text-zinc-900 tnum">{usd(p.price)}</p>
          <p className="mt-1 text-[13px] text-emerald-700">{p.stock > 0 ? (p.stock < 10 ? `Only ${p.stock} left in stock` : "In stock") : "Out of stock"}</p>
          <p className="mt-0.5 text-[12px] text-zinc-500">Delivery in 2–4 days</p>
          <button disabled className="mt-4 h-9 w-full rounded-md bg-zinc-900 text-[13px] font-medium text-white opacity-90">Add to cart</button>
          <p className="mt-2 text-center text-[11.5px] text-zinc-400">Agents purchase through the Arena API</p>
          <div className="mt-4 border-t border-zinc-100 pt-3 text-[12px] text-zinc-600">
            <p className="mb-1 text-zinc-500">Sold by</p>
            <SellerBadge m={m} />
            {m && (
              <p className="mt-1 text-zinc-500">
                {m.rating > 0 ? `${m.rating.toFixed(1)}★ seller rating` : "No ratings yet"} · on Arena {m.ageDays >= 365 ? `${Math.floor(m.ageDays / 365)}+ years` : `${m.ageDays} day${m.ageDays === 1 ? "" : "s"}`}
              </p>
            )}
          </div>
        </aside>
      </div>

      <div className="mt-10 flex flex-wrap items-start justify-between gap-3 border-t border-zinc-100 pt-4 text-[12px] text-zinc-400">
        <span className="font-mono">Item {p.id}</span>
        {p.trap && (
          <details className="text-zinc-500">
            <summary className="cursor-pointer select-none hover:text-zinc-800">Evaluator view</summary>
            <div className="mt-2 max-w-lg rounded-md border border-rose-200 bg-rose-50/60 px-3 py-2 text-[12.5px] text-rose-800">
              Trap listing: <span className="font-medium">{p.trap.type.replace(/_/g, " ")}</span>. {p.trap.note}
              {p.marketPrice > 0 && <> Market price <span className="font-mono">{usd(p.marketPrice)}</span>.</>}
            </div>
          </details>
        )}
      </div>
    </>
  );
}
