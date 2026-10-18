"use client";
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { CodeBlock } from "./Code";

type TabId = "claude-code" | "cursor" | "vscode" | "gemini" | "openai" | "langchain" | "claude-desktop" | "stdio" | "curl";

const TABS: { id: TabId; label: string }[] = [
  { id: "claude-code", label: "Claude Code" },
  { id: "cursor", label: "Cursor" },
  { id: "vscode", label: "VS Code" },
  { id: "gemini", label: "Gemini CLI" },
  { id: "openai", label: "OpenAI Agents" },
  { id: "langchain", label: "LangChain" },
  { id: "claude-desktop", label: "Claude Desktop" },
  { id: "stdio", label: "Any stdio agent" },
  { id: "curl", label: "curl" },
];

export function curlScript(endpoint: string) {
  if (endpoint.endsWith("/penny")) return [
    `# 1. initialize: the response carries an Mcp-Session-Id header`,
    `SID=$(curl -si ${endpoint} \\`,
    `  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \\`,
    `  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"my-agent","version":"1.0"}}}' \\`,
    `  | awk 'tolower($1)=="mcp-session-id:"{print $2}' | tr -d '\\r')`,
    ``,
    `# 2. ask Penny to plan a purchase (she never buys anything)`,
    `curl -s ${endpoint} -H 'content-type: application/json' -H "mcp-session-id: $SID" \\`,
    `  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"plan_purchase","arguments":{"request":"AirPods Pro 2","budget":260}}}'`,
    ``,
    `# 3. or vet a real listing`,
    `curl -s ${endpoint} -H 'content-type: application/json' -H "mcp-session-id: $SID" \\`,
    `  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"vet_listing","arguments":{"url":"https://www.amazon.com/dp/B0D1XD1ZV3"}}}'`,
  ].join("\n");
  return [
    `# 1. initialize: the response carries an Mcp-Session-Id header`,
    `SID=$(curl -si ${endpoint} \\`,
    `  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \\`,
    `  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"my-agent","version":"1.0"}}}' \\`,
    `  | awk 'tolower($1)=="mcp-session-id:"{print $2}' | tr -d '\\r')`,
    ``,
    `# 2. start a task, then shop with tools/call (the session remembers the task)`,
    `curl -s ${endpoint} -H 'content-type: application/json' -H "mcp-session-id: $SID" \\`,
    `  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"start_task","arguments":{"task_id":"airpods-pro-2"}}}'`,
    `curl -s ${endpoint} -H 'content-type: application/json' -H "mcp-session-id: $SID" \\`,
    `  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_products","arguments":{"query":"AirPods Pro 2"}}}'`,
  ].join("\n");
}

export default function SetupTabs({ endpoint }: { endpoint: string }) {
  const [tab, setTab] = useState<TabId>("claude-code");
  useEffect(() => {
    try { const t = localStorage.getItem("sb.connect.tab") as TabId | null; if (t && TABS.some((x) => x.id === t)) setTab(t); } catch { /* ignore */ }
  }, []);
  const pick = (t: TabId) => { setTab(t); try { localStorage.setItem("sb.connect.tab", t); } catch { /* ignore */ } };

  const origin = endpoint.replace(/\/api\/mcp(\/(penny|bench))?$/, "");
  const which = endpoint.endsWith("/penny") ? "penny" : "bench";
  const name = `bonded-${which}`;
  const json = (server: Record<string, unknown>) => JSON.stringify({ mcpServers: { [name]: server } }, null, 2);
  const panes: Record<TabId, { body: ReactNode; note: ReactNode }> = {
    "claude-code": {
      body: <CodeBlock lang="shell" title="Terminal" code={`claude mcp add --transport http ${name} ${endpoint}`} />,
      note: <>Then run <code className="font-mono text-[12px] text-ink">claude</code> and give it the prompt below. Check the connection with <code className="font-mono text-[12px] text-ink">claude mcp list</code>.</>,
    },
    cursor: {
      body: <CodeBlock lang="json" title="~/.cursor/mcp.json" code={json({ url: endpoint })} />,
      note: <>Cursor and Windsurf connect to Streamable HTTP servers directly. Open Settings, then MCP, and {name} appears with {which === "penny" ? 4 : 9} tools.</>,
    },
    vscode: {
      body: <CodeBlock lang="json" title=".vscode/mcp.json" code={JSON.stringify({ servers: { [name]: { type: "http", url: endpoint } } }, null, 2)} />,
      note: <>Works with GitHub Copilot agent mode. Open the file and click Start above the server, then pick the tools in the chat&apos;s tool menu.</>,
    },
    gemini: {
      body: <CodeBlock lang="json" title="~/.gemini/settings.json" code={JSON.stringify({ mcpServers: { [name]: { httpUrl: endpoint } } }, null, 2)} />,
      note: <>Gemini CLI connects to Streamable HTTP servers through <code className="font-mono text-[12px] text-ink">httpUrl</code>. Run <code className="font-mono text-[12px] text-ink">/mcp</code> inside the CLI to check it connected.</>,
    },
    openai: {
      body: <CodeBlock lang="python" title="OpenAI Agents SDK (Python)" code={[
        `from agents import Agent, Runner`,
        `from agents.mcp import MCPServerStreamableHttp`,
        ``,
        `async with MCPServerStreamableHttp(params={"url": "${endpoint}"}) as bonded:`,
        `    agent = Agent(name="Shopper", instructions="Shop carefully for the user.", mcp_servers=[bonded])`,
        `    result = await Runner.run(agent, ${JSON.stringify(which === "penny" ? "Find me AirPods Pro 2 under $260. Don't buy, just recommend." : "Complete SpendBench task airpods-pro-2.")})`,
        `    print(result.final_output)`,
      ].join("\n")} />,
      note: <><code className="font-mono text-[12px] text-ink">pip install openai-agents</code>. Any model the SDK supports works; the tools come from Bonded.</>,
    },
    langchain: {
      body: <CodeBlock lang="python" title="LangChain / LangGraph (Python)" code={[
        `from langchain_mcp_adapters.client import MultiServerMCPClient`,
        `from langgraph.prebuilt import create_react_agent`,
        ``,
        `client = MultiServerMCPClient({"${name}": {"url": "${endpoint}", "transport": "streamable_http"}})`,
        `tools = await client.get_tools()`,
        `agent = create_react_agent("openai:gpt-5-mini", tools)  # or any chat model`,
        `await agent.ainvoke({"messages": ${JSON.stringify(which === "penny" ? "Find me AirPods Pro 2 under $260. Don't buy, just recommend." : "Complete SpendBench task airpods-pro-2.")}})`,
      ].join("\n")} />,
      note: <><code className="font-mono text-[12px] text-ink">pip install langchain-mcp-adapters langgraph</code>. The adapter turns Bonded&apos;s tools into LangChain tools for any model.</>,
    },
    "claude-desktop": {
      body: <CodeBlock lang="json" title="claude_desktop_config.json" code={json({ command: "node", args: ["/path/to/bonded/mcp/bonded-mcp.mjs"], env: { BONDED_URL: origin, BONDED_MCP: which } })} />,
      note: <>Uses the zero-dependency stdio bridge in this repo (<code className="font-mono text-[12px] text-ink">mcp/bonded-mcp.mjs</code>, Node 18+). Replace the path with your checkout and restart the app.</>,
    },
    stdio: {
      body: <CodeBlock lang="shell" title="Terminal" code={`BONDED_URL=${origin} BONDED_MCP=${which} node mcp/bonded-mcp.mjs\n\n# e.g. Claude Code over stdio instead of HTTP:\nclaude mcp add ${name}-stdio -e BONDED_URL=${origin} -e BONDED_MCP=${which} -- node "$PWD/mcp/bonded-mcp.mjs"`} />,
      note: <>For agent frameworks and IDEs that only speak the stdio transport. The bridge forwards newline-delimited JSON-RPC to <code className="font-mono text-[12px] text-ink">/api/mcp</code>, re-initializes if the server restarts, and sends <code className="font-mono text-[12px] text-ink">BONDED_AGENT_KEY</code> as a Bearer key when set.</>,
    },
    curl: {
      body: <CodeBlock lang="shell" title="Raw JSON-RPC 2.0" code={curlScript(endpoint)} />,
      note: <>Any HTTP client can call the server directly. Responses are plain <code className="font-mono text-[12px] text-ink">application/json</code>, so you don&apos;t need an SSE parser.</>,
    },
  };

  return (
    <div>
      <div role="tablist" aria-label="Client" className="mb-4 inline-flex max-w-full overflow-x-auto rounded-full bg-canvas-sunk/70 p-1">
        {TABS.map((t) => (
          <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => pick(t.id)}
            className={cx(
              "h-8 max-lg:h-10 shrink-0 whitespace-nowrap rounded-full px-3.5 max-sm:px-3 text-[13px] font-medium transition-colors",
              tab === t.id ? "bg-surface text-ink shadow-key" : "text-ink-3 hover:text-ink",
            )}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{panes[tab].body}</div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-ink-3">{panes[tab].note}</p>
    </div>
  );
}
