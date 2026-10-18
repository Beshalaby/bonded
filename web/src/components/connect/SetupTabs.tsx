"use client";
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { CodeBlock } from "./Code";

type TabId = "claude-code" | "cursor" | "claude-desktop" | "stdio" | "curl";

const TABS: { id: TabId; label: string }[] = [
  { id: "claude-code", label: "Claude Code" },
  { id: "cursor", label: "Cursor" },
  { id: "claude-desktop", label: "Claude Desktop" },
  { id: "stdio", label: "Any stdio agent" },
  { id: "curl", label: "curl" },
];

export function curlScript(endpoint: string) {
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

  const origin = endpoint.replace(/\/api\/mcp$/, "");
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
      note: <>Cursor connects to Streamable HTTP servers directly. Open Settings, then MCP, and Bonded appears with 9 tools.</>,
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
