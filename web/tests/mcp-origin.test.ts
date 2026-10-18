import { afterEach, describe, expect, it } from "vitest";
import { mcpHandlers } from "@/lib/mcp/http";

const INIT = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t" } } });
const call = (host: string, origin?: string) =>
  mcpHandlers("penny").POST(new Request(`http://${host}/api/mcp/penny`, {
    method: "POST", body: INIT,
    headers: { host, "content-type": "application/json", accept: "application/json, text/event-stream", ...(origin ? { origin } : {}) },
  }));

afterEach(() => { delete process.env.SPENDBENCH_ALLOWED_HOSTS; });

describe("MCP origin policy", () => {
  it("public hostname: hosted agents with their own Origin can connect", async () => {
    process.env.SPENDBENCH_ALLOWED_HOSTS = "demo.trycloudflare.com";
    for (const o of ["https://claude.ai", "https://chatgpt.com", "null", undefined]) expect((await call("demo.trycloudflare.com", o)).status).toBe(200);
  });
  it("localhost: a foreign web page can't drive the local server", async () => {
    expect((await call("localhost:3000", "https://evil.example")).status).toBe(403);
    expect((await call("localhost:3000", "http://localhost:3000")).status).toBe(200);
    expect((await call("localhost:3000")).status).toBe(200);
  });
  it("LAN IP stays strict even when allow-listed", async () => {
    process.env.SPENDBENCH_ALLOWED_HOSTS = "192.168.1.20";
    expect((await call("192.168.1.20:3000", "https://evil.example")).status).toBe(403);
    expect((await call("192.168.1.20:3000")).status).toBe(200);
  });
  it("unknown Host (DNS rebinding) is refused", async () => {
    expect((await call("attacker.example", "https://attacker.example")).status).toBe(403);
  });
});
