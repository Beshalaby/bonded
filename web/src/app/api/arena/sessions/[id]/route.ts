// OWNER: Team 1. GET -> {session, cart, total, transaction}
import { cartView, handle, requireSession } from "@/lib/arena";
import { read } from "@/lib/db";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(() => {
    const session = requireSession(id);
    const transaction = session.transactionId ? read().transactions.find((t) => t.id === session.transactionId) ?? null : null;
    return { session, ...cartView(id), transaction };
  });
}
