// OWNER: Team 1. Full product (incl. trap, marketPrice, source) + merchant, for grading.
import { ArenaError, getMerchant, getProduct, handle } from "@/lib/arena";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(() => {
    const product = getProduct(id);
    if (!product) throw new ArenaError(404, `product ${id} not found`);
    return { product, merchant: getMerchant(product.merchantId) ?? null };
  });
}
