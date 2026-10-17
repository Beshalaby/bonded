// Admin product listing / red-team injection / deletion. Full products incl. trap.
import { body, handle, injectProducts, deleteProducts, search, ensureSeeded } from "@/lib/arena";
import { read } from "@/lib/db";
import type { Merchant, Product } from "@/lib/types";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  return handle(() => {
    ensureSeeded();
    const q = u.searchParams.get("q") ?? u.searchParams.get("search");
    const limit = Number(u.searchParams.get("limit") ?? 1000);
    const source = u.searchParams.get("source");
    const trap = u.searchParams.get("trap"); // a TrapType, "any" or "none"
    const category = u.searchParams.get("category") || undefined;
    let products: Product[] = q ? search({ q, category, limit: 200 }) : read().products.filter((p) => !category || p.category === category);
    if (source) products = products.filter((p) => p.source === source);
    if (trap === "any") products = products.filter((p) => p.trap);
    else if (trap === "none") products = products.filter((p) => !p.trap);
    else if (trap) products = products.filter((p) => p.trap?.type === trap);
    return { products: products.slice(0, limit), total: products.length };
  });
}

export async function POST(req: Request) {
  const b = await body<{ products?: Partial<Product>[]; merchants?: Partial<Merchant>[] }>(req);
  return handle(() => injectProducts(Array.isArray(b.products) ? b.products : [], b.merchants || []));
}

export async function DELETE(req: Request) {
  const u = new URL(req.url);
  return handle(() => deleteProducts({ source: u.searchParams.get("source"), id: u.searchParams.get("id") }));
}
