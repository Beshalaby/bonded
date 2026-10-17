import { beforeAll, describe, expect, it } from "vitest";
import { seedArena } from "@/lib/arena";
import { verify } from "@/lib/recorder";
import { handleMessage, hasSession, LATEST_VERSION, SUPPORTED_VERSIONS } from "@/lib/mcp/server";
import { TOOLS } from "@/lib/mcp/tools";

const ORIGIN = "http://127.0.0.1:3000";
const rpc = (method: string, params?: Record<string, unknown>, id: number | string = 1) => ({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });

async function init(protocolVersion = LATEST_VERSION) {
  const out = await handleMessage(rpc("initialize", { protocolVersion, clientInfo: { name: "vitest", version: "1" }, capabilities: {} }), { sessionId: null, origin: ORIGIN });
  return out;
}
type ToolResult = { content: { type: string; text: string }[]; isError: boolean };
async function call(sid: string, name: string, args: Record<string, unknown> = {}) {
  const out = await handleMessage(rpc("tools/call", { name, arguments: args }), { sessionId: sid, origin: ORIGIN });
  const res = out.reply!.result as ToolResult;
  return { res, data: res.isError ? null : JSON.parse(res.content[0].text) };
}

describe("MCP handleMessage", () => {
  it("initialize issues a session id and negotiates the protocol version", async () => {
    const out = await init("2025-03-26");
    expect(out.newSessionId).toMatch(/^mcp_[0-9a-f]{32}$/);
    expect(hasSession(out.newSessionId!)).toBe(true);
    expect(out.reply).toMatchObject({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26", serverInfo: { name: "bonded" }, capabilities: { tools: {} } } });
    const unknown = await init("1999-01-01");
    expect((unknown.reply!.result as { protocolVersion: string }).protocolVersion).toBe(LATEST_VERSION);
    expect(SUPPORTED_VERSIONS).toContain(LATEST_VERSION);
  });

  it("tools/list returns every tool with an input schema", async () => {
    const out = await handleMessage(rpc("tools/list", {}, 2), { sessionId: null, origin: ORIGIN });
    const tools = (out.reply!.result as { tools: typeof TOOLS }).tools;
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["list_tasks", "start_task", "search_products", "view_product", "add_to_cart", "checkout", "end_task"]));
    for (const t of tools) expect(t.inputSchema).toMatchObject({ type: "object" });
  });

  it("tools/call without a session is an error", async () => {
    const out = await handleMessage(rpc("tools/call", { name: "list_tasks", arguments: {} }, 3), { sessionId: null, origin: ORIGIN });
    expect(out.reply!.error).toMatchObject({ code: -32001 });
    const bogus = await handleMessage(rpc("tools/call", { name: "list_tasks", arguments: {} }, 4), { sessionId: "mcp_unknown", origin: ORIGIN });
    expect(bogus.reply!.error?.code).toBe(-32001);
  });

  it("tools/call with an unknown tool is invalid params", async () => {
    const out = await handleMessage(rpc("tools/call", { name: "rm_rf" }, 5), { sessionId: null, origin: ORIGIN });
    expect(out.reply!.error).toMatchObject({ code: -32602 });
  });

  it("unknown method -> -32601; notifications get no reply; malformed -> -32600", async () => {
    expect((await handleMessage(rpc("does/not/exist", {}, 6), { sessionId: null, origin: ORIGIN })).reply!.error).toMatchObject({ code: -32601 });
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, { sessionId: null, origin: ORIGIN })).toEqual({});
    expect((await handleMessage([1, 2], { sessionId: null, origin: ORIGIN })).reply!.error?.code).toBe(-32600);
    expect((await handleMessage({ id: 1, method: "ping" }, { sessionId: null, origin: ORIGIN })).reply!.error?.code).toBe(-32600); // missing jsonrpc
    expect((await handleMessage(rpc("ping", {}, 7), { sessionId: null, origin: ORIGIN })).reply).toEqual({ jsonrpc: "2.0", id: 7, result: {} });
  });
});

describe("MCP shopping flow (in-process, seeded arena)", () => {
  beforeAll(() => { seedArena({ reset: true }); });

  it("start_task -> search -> add_to_cart -> checkout grades the order and leaves a valid trace", async () => {
    const sid = (await init()).newSessionId!;
    const start = await call(sid, "start_task", { task_id: "airpods-pro-2", agent_name: "Vitest Agent" });
    expect(start.res.isError).toBe(false);
    expect(start.data).toMatchObject({ task_id: "airpods-pro-2", budget_usd: 260 });
    const sessionId = start.data.session_id as string;

    const found = await call(sid, "search_products", { query: "AirPods Pro 2" });
    expect(found.data.count).toBeGreaterThan(0);
    for (const p of found.data.products) expect(p).not.toHaveProperty("trap");

    const add = await call(sid, "add_to_cart", { product_id: found.data.products[0].id, quantity: 1 });
    expect(add.res.isError).toBe(false);

    const co = await call(sid, "checkout", { reasoning: "vitest" });
    expect(co.res.isError).toBe(false);
    expect(co.data.grade.verdict).toMatch(/^(PASS|FAIL)$/);
    expect(co.data.grade.bought).toBe(true);
    expect(verify(sessionId)).toMatchObject({ valid: true });
    expect(verify(sessionId).length).toBeGreaterThanOrEqual(4);

    // After checkout there is no active task.
    const again = await call(sid, "add_to_cart", { product_id: found.data.products[0].id, quantity: 1 });
    expect(again.res.isError).toBe(true);
  });

  it("start_task with an unknown id is a tool error, not a protocol error", async () => {
    const sid = (await init()).newSessionId!;
    const r = await call(sid, "start_task", { task_id: "definitely-not-a-task" });
    expect(r.res.isError).toBe(true);
    expect(r.res.content[0].text).toMatch(/Unknown task_id/);
  });
});
