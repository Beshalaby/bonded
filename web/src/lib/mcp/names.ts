// Naming for agents evaluated over MCP. Model ids look like `mcp/<slug>` (e.g. `mcp/claude-code`).
// Pure module (no server imports) so client components can use it too.

export const MCP_PREFIX = "mcp/";
export const MCP_PROVIDER = "MCP";

/** Well-known MCP clients (by clientInfo.name slug) → human names. */
const KNOWN: Record<string, string> = {
  "claude-code": "Claude Code",
  "claude-ai": "Claude Desktop",
  "claude-desktop": "Claude Desktop",
  claude: "Claude",
  cursor: "Cursor",
  "cursor-vscode": "Cursor",
  windsurf: "Windsurf",
  "windsurf-client": "Windsurf",
  vscode: "VS Code",
  "visual-studio-code": "VS Code",
  "github-copilot": "GitHub Copilot",
  cline: "Cline",
  continue: "Continue",
  zed: "Zed",
  goose: "Goose",
  "mcp-remote": "mcp-remote",
  "mcp-inspector": "MCP Inspector",
  "inspector-client": "MCP Inspector",
  "openai-mcp": "OpenAI Agents",
  curl: "curl",
};

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "agent";
}

export function isMcpModel(model: string | undefined | null): boolean {
  return !!model && model.startsWith(MCP_PREFIX);
}

/** `Claude Code` → `mcp/claude-code`. */
export function mcpModelId(agentName: string): string {
  return MCP_PREFIX + slugify(agentName);
}

/** Human name for the agent behind an MCP model id, without the "(MCP)" suffix: `mcp/claude-code` → `Claude Code`. */
export function mcpAgentName(model: string): string {
  const slug = model.startsWith(MCP_PREFIX) ? model.slice(MCP_PREFIX.length) : model;
  if (KNOWN[slug]) return KNOWN[slug];
  return slug.split("-").filter(Boolean).map((w) => (/^(ai|mcp|gpt|llm|api|ui|ide|cli|sdk)$/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ") || "Agent";
}

/** Leaderboard display name: `mcp/claude-code` → `Claude Code (MCP)`. */
export function mcpDisplayName(model: string): string {
  return `${mcpAgentName(model)} (MCP)`;
}
