import { NextResponse } from "next/server";
import { read } from "@/lib/db";
import { checkCart } from "@/lib/guardian";

export const dynamic = "force-dynamic";

/** Dry-run Guardian on a session's current cart (no checkout, nothing logged). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string };
  if (!body.sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  const db = read();
  const session = db.sessions.find((s) => s.id === body.sessionId);
  if (!session) return NextResponse.json({ error: `unknown session ${body.sessionId}` }, { status: 404 });
  const cart = db.carts.find((c) => c.sessionId === session.id) ?? { sessionId: session.id, items: [] };
  const ids = new Set(cart.items.map((i) => i.productId));
  const products = db.products.filter((p) => ids.has(p.id));
  const mids = new Set(products.map((p) => p.merchantId));
  const merchants = db.merchants.filter((m) => mids.has(m.id));
  return NextResponse.json(await checkCart(session, cart, products, merchants));
}
