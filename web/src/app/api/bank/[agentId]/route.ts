// GET /api/bank/:agentId -> {provider, simulated, live, wallet, purchases, source}
// Purchases are read live from Nessie (GET /accounts/:id/purchases) when real; from the local ledger otherwise.
import { HttpError, respond } from "@/lib/http";
import { providerInfo, walletSummary } from "@/lib/nessie";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return respond(async () => {
    const s = await walletSummary(decodeURIComponent(agentId));
    if (!s) throw new HttpError(404, "no wallet for this agent");
    return { ...providerInfo(), ...s };
  });
}
