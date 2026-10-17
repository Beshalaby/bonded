// OWNER: Team 1. POST {approve:boolean} -> {transaction} — resolve a held transaction.
import { body, confirmTransaction, handle } from "@/lib/arena";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await body<{ approve?: boolean }>(req);
  return handle(() => confirmTransaction(id, !!b.approve));
}
