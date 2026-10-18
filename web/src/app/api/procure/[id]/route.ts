// GET /api/procure/:id -> Proposal + { integrity } (verifies the deliberation's hash chain)
import { HttpError, respond } from "@/lib/http";
import { getProposal } from "@/lib/procure";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return respond(() => {
    const p = getProposal(id);
    if (!p) throw new HttpError(404, `unknown proposal ${id}`);
    return p;
  });
}
