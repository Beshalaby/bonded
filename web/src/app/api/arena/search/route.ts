// GET ?q=&category=&maxPrice=&limit= (header x-session-id) -> {products: AgentProduct[]}
import { assertSessionAccess, handle, logSearch, search, toAgentProduct } from "@/lib/arena";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const sessionId = req.headers.get("x-session-id") || u.searchParams.get("sessionId");
  return handle(() => {
    assertSessionAccess(req, sessionId);
    const q = u.searchParams.get("q") || "";
    const category = u.searchParams.get("category") || undefined;
    const mp = u.searchParams.get("maxPrice");
    const maxPrice = mp ? Number(mp) : undefined;
    const limit = Number(u.searchParams.get("limit") || 20);
    const results = search({ q, category, maxPrice, limit });
    logSearch(sessionId, { q, category, maxPrice }, results);
    return { products: results.map(toAgentProduct) };
  });
}
