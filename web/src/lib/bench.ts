// SpendBench result ingestion + model naming + red-team scam registry.
// Ingestion: normalize → attribute failures (heuristic now, LLM refinement in the background when a key is set)
// → store → publish `result` events → update run progress.
import { mutate, read } from "./db";
import { publish } from "./events";
import { attribute, llmAttribution } from "./attribution";
import { HAS_LLM } from "./llm";
import { noteResults } from "./runs";
import type { BenchResult, GuardianDecision, RedTeamScam } from "./types";

const SIM_NAMES: Record<string, string> = {
  "sim/careful": "Atlas Careful (sim)",
  "sim/bargain-hunter": "Magpie Bargain-Hunter (sim)",
  "sim/gullible": "Echo Gullible (sim)",
  "sim/hasty": "Dash Hasty (sim)",
  "sim/brand-blind": "Mimic Brand-Blind (sim)",
};

const REAL_NAMES: Record<string, string> = {
  "openai/gpt-4o-mini": "GPT-4o mini",
  "openai/gpt-4o": "GPT-4o",
  "openai/gpt-5-mini": "GPT-5 mini",
  "anthropic/claude-3.5-haiku": "Claude 3.5 Haiku",
  "anthropic/claude-3.5-sonnet": "Claude 3.5 Sonnet",
  "google/gemini-2.0-flash-001": "Gemini 2.0 Flash",
  "meta-llama/llama-3.3-70b-instruct": "Llama 3.3 70B",
  "mistralai/mistral-small-3.1-24b-instruct": "Mistral Small 3.1 24B",
};

const PROVIDERS: Record<string, string> = {
  sim: "Simulated", openai: "OpenAI", anthropic: "Anthropic", google: "Google", "meta-llama": "Meta", mistralai: "Mistral",
  "x-ai": "xAI", deepseek: "DeepSeek", qwen: "Qwen", cohere: "Cohere", amazon: "Amazon", microsoft: "Microsoft", nvidia: "NVIDIA",
};

export function displayName(model: string): string {
  if (SIM_NAMES[model]) return SIM_NAMES[model];
  if (REAL_NAMES[model]) return REAL_NAMES[model];
  if (model.startsWith("sim/")) {
    const n = model.slice(4).split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join("-");
    return `${n} (sim)`;
  }
  return model.includes("/") ? model.split("/").slice(1).join("/") : model;
}

export function providerOf(model: string): string {
  const prefix = model.includes("/") ? model.split("/")[0] : "";
  if (!prefix) return "Unknown";
  return PROVIDERS[prefix] ?? prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

const DECISIONS: GuardianDecision[] = ["approve", "ask", "block"];

function normalize(r: Record<string, unknown>, runId?: string): BenchResult | null {
  if (!r || typeof r.model !== "string" || typeof r.taskId !== "string") return null;
  // legacy field names from v1 graders
  const dec = (r.guardrailDecision ?? r.guardianDecision) as GuardianDecision | undefined;
  const { guardianDecision: _gd, guardianCaught: _gc, ...rest } = r;
  void _gd; void _gc;
  const success = !!r.success;
  const out = {
    ...rest,
    runId: String(r.runId ?? runId ?? "adhoc"),
    model: r.model,
    taskId: r.taskId,
    success,
    overBudget: !!r.overBudget,
    wrongItem: !!r.wrongItem,
    scammed: !!r.scammed,
    trapTypes: Array.isArray(r.trapTypes) ? r.trapTypes : [],
    costUsd: Number(r.costUsd ?? 0) || 0,
    latencyMs: Number(r.latencyMs ?? 0) || 0,
    steps: Number(r.steps ?? 0) || 0,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
    ...(dec && DECISIONS.includes(dec) ? { guardrailDecision: dec } : {}),
    guardrailCaught: !success && (dec === "ask" || dec === "block"),
  } as BenchResult;
  delete out.attribution; // computed server-side only
  return out;
}

const key = (r: BenchResult) => `${r.runId}|${r.model}|${r.taskId}`;

/** Store results (dedup on runId×model×task), attribute failures, publish events, update run progress. */
export function ingestResults(raw: unknown[], runId?: string): { stored: number; failures: number } {
  const results = raw.map((r) => normalize(r as Record<string, unknown>, runId)).filter((r): r is BenchResult => !!r);
  for (const r of results) {
    if (r.success) continue;
    try { r.attribution = attribute(r); } catch (e) { console.error("[bench] attribution failed", e); }
  }
  mutate((db) => {
    const incoming = new Set(results.map(key));
    db.benchResults = db.benchResults.filter((r) => !incoming.has(key(r))).concat(results);
  });
  for (const r of results) publish("result", r);
  for (const id of new Set(results.map((r) => r.runId))) noteResults(id);
  if (HAS_LLM) for (const r of results) if (!r.success) void refineWithLlm(r);
  return { stored: results.length, failures: results.filter((r) => !r.success).length };
}

async function refineWithLlm(r: BenchResult) {
  try {
    const a = await llmAttribution(r);
    if (a.judge !== "llm") return;
    const updated = mutate((db) => {
      const x = db.benchResults.find((y) => key(y) === key(r));
      if (x) x.attribution = a;
      return x;
    });
    if (updated) publish("result", updated);
  } catch (e) {
    console.error("[bench] LLM attribution failed", e);
  }
}

// ---------------------------------------------------------------- red-team scam registry
export function listScams(): RedTeamScam[] {
  return [...(read().scams ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Upsert red-team scams (by id); publishes a `scam` event per scam. */
export function addScams(scams: Partial<RedTeamScam>[]): RedTeamScam[] {
  const now = new Date().toISOString();
  const added = mutate((db) => {
    db.scams = db.scams ?? [];
    const out: RedTeamScam[] = [];
    for (const s of scams) {
      if (!s || typeof s.id !== "string" || !s.trapType) continue;
      const full: RedTeamScam = {
        id: s.id,
        taskId: String(s.taskId ?? ""),
        variantTaskId: s.variantTaskId,
        trapType: s.trapType,
        technique: String(s.technique ?? ""),
        product: s.product ?? {},
        fooled: Array.isArray(s.fooled) ? s.fooled : [],
        testedModels: Array.isArray(s.testedModels) ? s.testedModels : [],
        round: s.round,
        generator: s.generator === "llm" ? "llm" : "mutation",
        createdAt: s.createdAt ?? now,
      };
      const i = db.scams.findIndex((x) => x.id === full.id);
      if (i >= 0) db.scams[i] = full;
      else db.scams.push(full);
      out.push(full);
    }
    return out;
  });
  for (const s of added) publish("scam", s);
  return added;
}
