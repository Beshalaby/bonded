// OpenRouter chat client for the LLM judges (guardrail, failure attribution). Returns null when no key is
// configured, or on any failure after retries, so callers fall back to their heuristics.
//
// Env: OPENROUTER_API_KEY, OPENROUTER_BASE_URL (default https://openrouter.ai/api/v1; point it at
// scripts/mock_openrouter.py to test offline), JUDGE_MODEL (default openai/gpt-4o-mini).
export const HAS_LLM = !!process.env.OPENROUTER_API_KEY?.trim();
export const JUDGE_MODEL = process.env.JUDGE_MODEL || "openai/gpt-4o-mini";
export const OPENROUTER_BASE_URL = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");

export interface ChatOptions {
  model?: string;
  /** Total time budget across all attempts (ms). The guardrail runs inline at checkout, so keep it short. */
  deadlineMs?: number;
  /** Per-attempt timeout (ms). */
  timeoutMs?: number;
  /** Extra attempts after the first on 429 / 5xx / timeout / network error. */
  retries?: number;
}

class Retryable extends Error {
  constructor(message: string, public retryAfterMs = 0) { super(message); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Text of an assistant message: content may be null, a string, or an array of parts. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content.map((p) => (typeof p === "string" ? p : p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : "")).join("");
  return "";
}

/** JSON.parse that tolerates ```json fences, leading prose and trailing commas. Throws if nothing parses. */
export function parseJsonLoose(s: string): unknown {
  let t = s.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  if (fence) t = fence[1];
  try { return JSON.parse(t); } catch { /* fall through */ }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`no JSON object in reply: ${t.slice(0, 80)}`);
  const body = t.slice(start, end + 1);
  try { return JSON.parse(body); } catch { return JSON.parse(body.replace(/,\s*([}\]])/g, "$1")); }
}

async function once(system: string, user: string, model: string, timeoutMs: number): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json",
        "HTTP-Referer": "https://bonded.local", "X-Title": "Bonded SpendBench",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new Retryable(`network/timeout: ${(e as Error).message}`); // AbortError/TimeoutError/ECONNREFUSED
  }
  const raw = await res.text();
  if (!res.ok) {
    const msg = `HTTP ${res.status}: ${raw.slice(0, 300)}`;
    if (res.status === 429 || res.status === 408 || res.status >= 500) {
      const ra = Number(res.headers.get("retry-after"));
      throw new Retryable(msg, Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 0);
    }
    throw new Error(msg);
  }
  let j: { choices?: { message?: { content?: unknown } }[]; error?: { code?: unknown; message?: unknown } };
  try { j = JSON.parse(raw); } catch { throw new Retryable(`non-JSON response: ${raw.slice(0, 120)}`); }
  if (j.error && !j.choices?.length) {
    const code = Number(j.error.code);
    const msg = `provider error ${String(j.error.code)}: ${String(j.error.message).slice(0, 200)}`;
    if (!Number.isFinite(code) || code === 429 || code >= 500) throw new Retryable(msg);
    throw new Error(msg);
  }
  const text = textOf(j.choices?.[0]?.message?.content);
  if (!text.trim()) throw new Retryable("empty reply");
  return parseJsonLoose(text);
}

/** JSON-mode completion. Returns the parsed object, or null (no key / all attempts failed / not an object). */
export async function chatJSON<T>(system: string, user: string, modelOrOpts: string | ChatOptions = JUDGE_MODEL): Promise<T | null> {
  if (!HAS_LLM) return null;
  const o: ChatOptions = typeof modelOrOpts === "string" ? { model: modelOrOpts } : modelOrOpts;
  const model = o.model || JUDGE_MODEL;
  const deadline = Date.now() + (o.deadlineMs ?? 25000);
  const retries = o.retries ?? 2;
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const left = deadline - Date.now();
    if (left < 1000) break;
    try {
      const v = await once(system, user, model, Math.min(o.timeoutMs ?? 20000, left));
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("reply is not a JSON object");
      return v as T;
    } catch (e) {
      last = e;
      if (!(e instanceof Retryable) || attempt === retries) break;
      const wait = Math.max(e.retryAfterMs, 500 * 2 ** attempt) * (0.8 + Math.random() * 0.4);
      if (Date.now() + wait > deadline - 1000) break;
      await sleep(wait);
    }
  }
  console.error(`[llm] judge call to ${model} failed, falling back: ${(last as Error)?.message ?? last}`);
  return null;
}
