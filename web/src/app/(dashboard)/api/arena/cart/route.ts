// GET ?sessionId= | POST {sessionId, productId, qty} | DELETE {sessionId, productId} -> {cart, total}
import { addToCart, body, cartView, handle, removeFromCart, requireSession } from "@/lib/arena";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sessionId = req.headers.get("x-session-id") || new URL(req.url).searchParams.get("sessionId");
  return handle(() => { requireSession(sessionId); return cartView(sessionId!); });
}

export async function POST(req: Request) {
  const b = await body<{ sessionId?: string; productId?: string; qty?: number }>(req);
  const sessionId = b.sessionId || req.headers.get("x-session-id") || "";
  return handle(() => addToCart(sessionId, String(b.productId || ""), b.qty ?? 1));
}

export async function DELETE(req: Request) {
  const u = new URL(req.url);
  const b = await body<{ sessionId?: string; productId?: string }>(req);
  const sessionId = b.sessionId || req.headers.get("x-session-id") || u.searchParams.get("sessionId") || "";
  const productId = b.productId || u.searchParams.get("productId") || "";
  return handle(() => removeFromCart(sessionId, productId));
}
