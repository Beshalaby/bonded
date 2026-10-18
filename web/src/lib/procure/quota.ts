// Penny's live web search spends the operator's LLM credit (search + council models), so on an exposed server
// anonymous callers share a daily allowance and each MCP session gets a cap. Agent-key holders and the operator
// (admin session / service token) are not counted. In the local open demo nothing is limited.
import { authMode } from "../auth";

const DAILY = () => Math.max(0, Number(process.env.PENNY_DAILY_WEB_LIMIT ?? 200) || 0);
const PER_SESSION = () => Math.max(1, Number(process.env.PENNY_SESSION_LIMIT ?? 20) || 20);

const g = globalThis as unknown as { __pennyQuota?: { day: string; used: number; sessions: Map<string, number> } };
const state = () => {
  const day = new Date().toISOString().slice(0, 10);
  if (!g.__pennyQuota || g.__pennyQuota.day !== day) g.__pennyQuota = { day, used: 0, sessions: new Map() };
  return g.__pennyQuota;
};

/** Reserve one web plan. Returns an error message when the caller is over a limit, else null. */
export function takeWebPlan(opts: { trusted: boolean; session?: string }): string | null {
  if (opts.trusted || authMode() === "open") return null;
  const s = state();
  if (s.used >= DAILY()) return "Penny has used today's public web-search allowance on this server. Try again tomorrow, or connect with an agent key.";
  if (opts.session) {
    const n = s.sessions.get(opts.session) ?? 0;
    if (n >= PER_SESSION()) return `This session has used its ${PER_SESSION()} Penny searches. Start a new session or connect with an agent key.`;
    s.sessions.set(opts.session, n + 1);
  }
  s.used += 1;
  return null;
}
