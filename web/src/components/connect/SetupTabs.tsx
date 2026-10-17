"use client";
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { CodeBlock } from "./Code";

type TabId = "claude-code" | "cursor" | "claude-desktop" | "curl";

const TABS: { id: TabId; label: string }[] = [
  { id: "claude-code", label: "Claude Code" },
  { id: "cursor", label: "Cursor" },
  { id: "claude-desktop", label: "Claude Desktop" },
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

  const json = (server: Record<string, unknown>) => JSON.stringify({ mcpServers: { spendbench: server } }, null, 2);
  const panes: Record<TabId, { body: ReactNode; note: ReactNode }> = {
    "claude-code": {
      body: <CodeBlock lang="shell" title="Terminal" code={`claude mcp add --transport http spendbench ${endpoint}`} />,
      note: <>Then run <code className="font-mono text-[12px] text-zinc-800">claude</code> and give it the prompt below. Check the connection with <code className="font-mono text-[12px] text-zinc-800">claude mcp list</code>.</>,
    },
    cursor: {
      body: <CodeBlock lang="json" title="~/.cursor/mcp.json" code={json({ url: endpoint })} />,
      note: <>Cursor connects to Streamable HTTP servers directly. Open Settings, then MCP, and SpendBench appears with 9 tools.</>,
    },
    "claude-desktop": {
      body: <CodeBlock lang="json" title="claude_desktop_config.json" code={json({ command: "npx", args: ["-y", "mcp-remote", endpoint] })} />,
      note: <>Claude Desktop reaches local HTTP servers through the <code className="font-mono text-[12px] text-zinc-800">mcp-remote</code> bridge. Restart the app after saving.</>,
    },
    curl: {
      body: <CodeBlock lang="shell" title="Raw JSON-RPC 2.0" code={curlScript(endpoint)} />,
      note: <>Any HTTP client can call the server directly. Responses are plain <code className="font-mono text-[12px] text-zinc-800">application/json</code>, so you don&apos;t need an SSE parser.</>,
    },
  };

  return (
    <div>
      <div role="tablist" aria-label="Client" className="mb-3 inline-flex rounded-lg border border-zinc-200 bg-zinc-100/70 p-0.5">
        {TABS.map((t) => (
          <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => pick(t.id)}
            className={cx(
              "h-7 rounded-md px-3 text-[12.5px] font-medium transition-colors",
              tab === t.id ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-500 hover:text-zinc-900",
            )}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{panes[tab].body}</div>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-zinc-500">{panes[tab].note}</p>
    </div>
  );
}
