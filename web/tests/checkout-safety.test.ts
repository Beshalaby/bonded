import { beforeAll, describe, expect, it } from "vitest";
import { addToCart, checkout, createSession, removeFromCart, seedArena } from "@/lib/arena";
import { read } from "@/lib/db";
import { getChain } from "@/lib/recorder";
import { walletKey, MAX_TASK_FUNDING } from "@/lib/nessie/ledger";

beforeAll(() => { seedArena({ wipe: true }); });

describe("checkout safety", () => {
  it("concurrent checkouts on one session charge at most once", async () => {
    const { sessionId } = createSession({ agentId: "a-race", model: "sim/careful", instruction: "Buy AirPods Pro 2", budget: 260 }, { internal: true });
    addToCart(sessionId, "p_airpods_pro2", 1);
    const results = await Promise.allSettled([checkout(sessionId), checkout(sessionId), checkout(sessionId)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 50));
    const charges = getChain(sessionId).filter((e) => e.action === "bank_charge" || e.action === "bank_declined");
    expect(charges.length).toBeLessThanOrEqual(1);
    expect(read().transactions.filter((t) => t.sessionId === sessionId)).toHaveLength(1);
  });

  it("a blocked attempt does not make the later completed checkout free", async () => {
    const { sessionId } = createSession({ agentId: "a-retry", model: "sim/gullible", instruction: "Buy AirPods Pro 2, budget $260", budget: 260, guardrail: "enforce" }, { internal: true });
    addToCart(sessionId, "p_airpods_pro2", 3);            // 3 × $229.99 > budget -> blocked in enforce mode
    const first = await checkout(sessionId);
    expect(first.transaction.status).toBe("blocked");
    removeFromCart(sessionId, "p_airpods_pro2");
    addToCart(sessionId, "p_airpods_pro2", 1);
    const second = await checkout(sessionId);
    expect(second.transaction.status).toBe("completed");
    await new Promise((r) => setTimeout(r, 50));
    const actions = getChain(sessionId).map((e) => e.action);
    expect(actions).toContain("bank_declined");
    expect(actions.filter((a) => a === "bank_charge")).toHaveLength(1);
  });

  it("self-asserted agent ids get their own wallet namespace", () => {
    const { sessionId } = createSession({ agentId: "agent-gpt-5-mini", model: "openai/gpt-5-mini", instruction: "x", budget: 10 });
    const s = read().sessions.find((x) => x.id === sessionId)!;
    expect(s.unverified).toBe(true);
    expect(walletKey(s)).toBe("unverified:agent-gpt-5-mini");
    const { sessionId: internalId } = createSession({ agentId: "agent-gpt-5-mini", model: "openai/gpt-5-mini", instruction: "x", budget: 10 }, { internal: true });
    expect(walletKey(read().sessions.find((x) => x.id === internalId)!)).toBe("agent-gpt-5-mini");
    expect(MAX_TASK_FUNDING).toBeGreaterThan(0);
  });
});
