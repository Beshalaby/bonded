// The one place /check and the MCP tools get Bonded Shield from. The analyzer itself lives in lib/shield/analyze.ts
// (owned by the shield core); this adapter only normalises its output defensively so a bad verdict can't break
// the page, and guarantees the description we show or hand to an agent has been sanitized.
import { analyzeListing } from "../analyze";
import type { NormalizedListing, ShieldDecision, ShieldVerdict, ShoppingIntent } from "../types";

const DECISIONS: ShieldDecision[] = ["buy", "caution", "avoid"];

export async function analyze(listing: NormalizedListing, intent?: ShoppingIntent): Promise<ShieldVerdict> {
  const v = await analyzeListing(listing, intent);
  return {
    ...v,
    decision: DECISIONS.includes(v.decision) ? v.decision : "caution",
    confidence: Math.min(1, Math.max(0, Number(v.confidence) || 0)),
    headline: String(v.headline || "").slice(0, 300),
    signals: Array.isArray(v.signals) ? v.signals.slice(0, 20) : [],
    sanitizedDescription: typeof v.sanitizedDescription === "string" ? v.sanitizedDescription : "",
    injectionsRemoved: Array.isArray(v.injectionsRemoved) ? v.injectionsRemoved.map(String).slice(0, 20) : [],
    checkedAt: v.checkedAt || new Date().toISOString(),
  };
}
