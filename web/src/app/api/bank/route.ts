// GET /api/bank -> {provider, simulated, live, wallets: [{agentId, model, displayName, accountLast4, balance, purchases, spent, funded}]}
// Public read. Balances come live from Capital One Nessie when a key is configured (cached ledger otherwise).
import { respond } from "@/lib/http";
import { listWallets, providerInfo } from "@/lib/nessie";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return respond(async () => ({ ...providerInfo(), wallets: await listWallets() }));
}
