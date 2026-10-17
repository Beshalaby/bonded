// OpenRouter chat client. Returns null when no key is configured so callers fall back to heuristics.
export const HAS_LLM = !!process.env.OPENROUTER_API_KEY;
export const JUDGE_MODEL = process.env.JUDGE_MODEL || "openai/gpt-4o-mini";

export async function chatJSON<T>(system: string, user: string, model = JUDGE_MODEL): Promise<T | null> {
  if (!HAS_LLM) return null;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const j = await res.json();
    return JSON.parse(j.choices[0].message.content) as T;
  } catch (e) {
    console.error("[llm] judge call failed, falling back", e);
    return null;
  }
}
