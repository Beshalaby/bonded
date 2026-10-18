import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Proposal } from "@/lib/procure/types";
import { parseProcureArgs } from "@/lib/procure/args";
import { parseRequest } from "@/lib/procure/intake";
import type { PennyDraft } from "@/app/penny/session";

const draft: PennyDraft = { request: "Find Nike running shoes", budget: "150", where: "arena" };
const proposal = {
  id: "proposal-1", createdAt: "2026-10-17T12:00:00Z", summary: "Which size do you need?",
  wouldBuy: { title: "Nike running shoes", merchant: "Nike", total: 120 }, questions: ["What size?"],
} as Proposal;

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    get length() { return entries.size; },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
  };
}
async function session() { return import("@/app/penny/session"); }

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("sessionStorage", memoryStorage());
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Penny conversation sessions", () => {
  it("groups followups and restores recent chats and legacy requests after reload", async () => {
    const api = await session();
    vi.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValueOnce(200).mockReturnValueOnce(300);
    const first = api.createRequest(draft);
    const other = api.createRequest({ ...draft, request: "Find a keyboard" });
    const reply = api.createRequest({ ...draft, request: "Size 10 please" }, first);
    sessionStorage.setItem("penny:request:legacy", JSON.stringify({ id: "legacy", draft: { ...draft, request: "Old request" } }));
    sessionStorage.setItem("penny:request:broken", "not json");
    sessionStorage.setItem("penny:request:invalid", JSON.stringify({ id: "invalid" }));
    expect(api.readConversation(first).map((request) => request.id)).toEqual([first, reply]);
    expect(api.readConversation(reply).map((request) => request.id)).toEqual([first, reply]);
    expect(api.readDraft()?.request).toBe("Find a keyboard");
    vi.resetModules();
    const restored = await session();
    expect(restored.listChats()).toEqual([
      { id: first, title: draft.request, updatedAt: 300 },
      { id: other, title: "Find a keyboard", updatedAt: 200 },
      { id: "legacy", title: "Old request", updatedAt: 0 },
    ]);
    expect(restored.readConversation(first).map((request) => request.id)).toEqual([first, reply]);
    expect(restored.readDraft()?.request).toBe("Find a keyboard");
    expect(restored.readConversation("legacy")[0].draft.request).toBe("Old request");
  });

  it("sends earlier requirements and Penny's answer when refining a conversation", async () => {
    const api = await session();
    const fetch = vi.fn().mockResolvedValue(Response.json(proposal));
    vi.stubGlobal("fetch", fetch);
    const root = api.createRequest(draft);
    await api.shop(api.readRequest(root)!);
    const followup = api.createRequest({ request: "Size 10, in blue", budget: "$200", where: "web" }, root);
    await api.shop(api.readRequest(followup)!);
    const firstBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(firstBody).toEqual({ request: draft.request, budget: 150, sources: ["arena"] });
    const body = JSON.parse(fetch.mock.calls[1][1].body);
    expect(body.request).toContain(draft.request);
    expect(body.request).toContain("What size?");
    expect(body.request).toContain("Nike running shoes");
    expect(body.request).toContain("Size 10, in blue");
    expect(body.budget).toBe(200);
    expect(body.sources).toEqual(["web"]);
    expect(api.readRequest(followup)?.draft.request).toBe("Size 10, in blue");
    expect(api.readDraft()).toEqual(draft);
  });

  it.each(["Change to size 10 under $200", "Change to size 10; I can spend $200"])("applies latest requirements through real intake: %s", async (latest) => {
    const api = await session();
    const fetch = vi.fn().mockResolvedValue(Response.json(proposal));
    vi.stubGlobal("fetch", fetch);
    const root = api.createRequest({ ...draft, request: "Nike running shoes size 8 under $100", budget: "" });
    const followup = api.createRequest({ ...draft, request: latest, budget: "" }, root);
    await api.shop(api.readRequest(followup)!);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.request.startsWith(latest)).toBe(true);
    const args = parseProcureArgs(body);
    expect(typeof args).toBe("object");
    if (typeof args === "string") throw new Error(args);
    const spec = await parseRequest(args);
    expect(spec.parsedBy).toBe("heuristic");
    expect(spec.variant.size).toBe("10");
    expect(spec.budget).toBe(200);
  });

  it("bounds long conversation context to the API limit without truncating the latest message", async () => {
    const api = await session();
    const fetch = vi.fn().mockResolvedValue(Response.json(proposal));
    vi.stubGlobal("fetch", fetch);
    const root = api.createRequest({ ...draft, request: `Nike running shoes ${"requirements ".repeat(70)}` });
    await api.shop(api.readRequest(root)!);
    const followup = api.createRequest({ ...draft, request: `Blue please ${"more requirements ".repeat(40)}` }, root);
    await api.shop(api.readRequest(followup)!);
    let body = JSON.parse(fetch.mock.calls[1][1].body);
    expect(body.request.length).toBeLessThanOrEqual(1000);
    expect(body.request).toContain("Nike running shoes");
    expect(body.request).toContain(api.readRequest(followup)!.draft.request);
    expect(parseProcureArgs(body)).toEqual(expect.objectContaining({ sources: ["arena"] }));
    const latest = "x".repeat(1000);
    const final = api.createRequest({ ...draft, request: latest }, root);
    await api.shop(api.readRequest(final)!);
    body = JSON.parse(fetch.mock.calls[2][1].body);
    expect(body.request).toBe(latest);
    expect(parseProcureArgs(body)).toEqual(expect.objectContaining({ request: latest }));
  });

  it("deduplicates pending work and reuses completed answers after reload", async () => {
    const api = await session();
    let resolve!: (response: Response) => void;
    const fetch = vi.fn().mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetch);
    const id = api.createRequest(draft);
    const request = api.readRequest(id)!;
    const first = api.shop(request);
    expect(api.shop(request)).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    resolve(Response.json(proposal));
    expect(await first).toEqual(proposal);
    expect(await api.shop(request)).toEqual(proposal);
    vi.resetModules();
    const restored = await session();
    expect(await restored.shop(restored.readRequest(id)!)).toEqual(proposal);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("persists errors and clears them for an explicit retry", async () => {
    let api = await session();
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ error: "Temporarily busy" }, { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    const id = api.createRequest(draft);
    await expect(api.shop(api.readRequest(id)!)).rejects.toThrow("Penny is busy");
    vi.resetModules();
    api = await session();
    expect(api.readRequest(id)?.error).toContain("Penny is busy");
    let resolve!: (response: Response) => void;
    fetch.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
    const retry = api.shop(api.readRequest(id)!);
    expect(api.readRequest(id)?.error).toBeUndefined();
    expect(JSON.parse(sessionStorage.getItem(`penny:request:${id}`)!).error).toBeUndefined();
    resolve(Response.json(proposal));
    await expect(retry).resolves.toEqual(proposal);
    expect(api.readRequest(id)?.error).toBeUndefined();
  });

  it("keeps draft, history, and retries usable when browser storage is denied", async () => {
    vi.stubGlobal("sessionStorage", {
      get length() { throw new Error("Denied"); },
      getItem: () => { throw new Error("Denied"); },
      setItem: () => { throw new Error("Denied"); },
    });
    const api = await session();
    const fetch = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(Response.json(proposal));
    vi.stubGlobal("fetch", fetch);
    const id = api.createRequest(draft);
    const request = api.readRequest(id)!;
    await expect(api.shop(request)).rejects.toThrow("Check your connection");
    expect(request.error).toContain("Check your connection");
    await expect(api.shop(request)).resolves.toEqual(proposal);
    expect(api.readDraft()).toEqual(draft);
    expect(api.listChats()[0].id).toBe(id);
    expect(api.readConversation(id)).toEqual([request]);
  });
});
