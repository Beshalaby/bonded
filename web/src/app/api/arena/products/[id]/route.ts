// GET (header x-session-id) -> {product: AgentProduct, merchant}
import { assertSessionAccess, handle, viewProduct } from "@/lib/arena";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionId = req.headers.get("x-session-id") || new URL(req.url).searchParams.get("sessionId");
  return handle(() => { assertSessionAccess(req, sessionId); return viewProduct(id, sessionId); });
}
