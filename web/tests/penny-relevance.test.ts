import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ chatJSON: vi.fn(), procure: vi.fn(), takeWebPlan: vi.fn(), agentKeyFrom: vi.fn() }));
vi.mock("@/lib/llm", () => ({ HAS_LLM: true, chatJSON: mocks.chatJSON }));
vi.mock("@/lib/procure", () => ({ procure: mocks.procure, listProposals: vi.fn() }));
vi.mock("@/lib/procure/quota", () => ({ takeWebPlan: mocks.takeWebPlan }));
vi.mock("@/lib/auth", () => ({ authMode: () => "token", isAdminRequest: async () => false }));
vi.mock("@/lib/auth-node", () => ({ agentKeyFrom: mocks.agentKeyFrom, isInternalRequest: () => false }));

import { POST } from "@/app/api/procure/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.procure.mockResolvedValue({ id: "proposal-1" });
  mocks.takeWebPlan.mockReturnValue(null);
  mocks.agentKeyFrom.mockReset().mockReturnValue(null);
});

const send = (body: Record<string, unknown>) => POST(new Request("http://localhost/api/procure", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}));

describe("Penny LLM relevance check", () => {
  it.each(["hey", "hi", "bye", "how’s your day been?", "Get me out of here"])("checks %s with the LLM and returns its conversational reply without shopping", async (message) => {
    mocks.chatJSON.mockResolvedValue({ relevant: false, reply: "A brief conversational reply." });
    const response = await send({ request: message, sources: ["web"] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kind: "reply", message: "A brief conversational reply." });
    expect(mocks.chatJSON).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.chatJSON.mock.calls[0][1]).message).toBe(message);
    expect(mocks.chatJSON.mock.calls[0][2]).toEqual(expect.objectContaining({ model: expect.any(String), retries: 0 }));
    expect(mocks.procure).not.toHaveBeenCalled();
    expect(mocks.takeWebPlan).not.toHaveBeenCalled();
  });

  it.each(["Find me headphones", "Get me a birthday gift", "Headphones", "Keep it under 200", "Something cheaper", "Make it blue"])("lets the model recognize shopping relevance without required phrasing: %s", async (message) => {
    mocks.chatJSON.mockResolvedValue({ relevant: true });
    const request = `${message}\nPrevious context (latest message takes priority):\nFind me headphones`;
    const response = await send({ request, message, budget: 200, sources: ["web"] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "proposal-1" });
    expect(mocks.chatJSON).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.chatJSON.mock.calls[0][1])).toEqual({ message, context: request });
    expect(mocks.procure).toHaveBeenCalledWith(expect.objectContaining({ request, budget: 200, sources: ["web"] }));
    expect(mocks.takeWebPlan).toHaveBeenCalledTimes(1);
  });

  it("uses the latest greeting separately from the earlier purchase context", async () => {
    mocks.chatJSON.mockResolvedValue({ relevant: false, reply: "Hi!" });
    const response = await send({ message: "hi", request: "hi\nPrevious context: Buy me headphones", sources: ["web"] });
    expect(await response.json()).toEqual({ kind: "reply", message: "Hi!" });
    expect(JSON.parse(mocks.chatJSON.mock.calls[0][1]).message).toBe("hi");
    expect(mocks.procure).not.toHaveBeenCalled();
  });

  it("has no local keyword rule overriding the model decision", async () => {
    mocks.chatJSON.mockResolvedValue({ relevant: true });
    await send({ request: "An unusual description", sources: ["arena"] });
    expect(mocks.chatJSON).toHaveBeenCalledTimes(1);
    expect(mocks.procure).toHaveBeenCalledWith(expect.objectContaining({ request: "An unusual description" }));
  });

  it("preserves credential validation before making a model call", async () => {
    mocks.agentKeyFrom.mockImplementation(() => { throw new Error("revoked key"); });
    const response = await send({ request: "hi", sources: ["web"] });
    expect(response.status).toBe(401);
    expect(mocks.chatJSON).not.toHaveBeenCalled();
    expect(mocks.procure).not.toHaveBeenCalled();
  });

  it.each([null, {}, { relevant: "true" }, { relevant: false }, { relevant: false, reply: 123 }, { relevant: false, reply: " " }])("returns a retryable error when classification is unavailable or invalid: %j", async (result) => {
    mocks.chatJSON.mockResolvedValue(result);
    const response = await send({ request: "Find me headphones", sources: ["web"] });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Penny couldn’t check your message. Please try again." });
    expect(mocks.procure).not.toHaveBeenCalled();
    expect(mocks.takeWebPlan).not.toHaveBeenCalled();
  });
});
