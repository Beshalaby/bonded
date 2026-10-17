// Benchmark task catalog, read from disk: agents/spendbench/tasks.json (base) + tasks_generated.json (red team).
// Python owns these files; we only read them (cached by mtime).
import fs from "node:fs";
import path from "node:path";
import type { TrapType } from "./types";

export interface Task {
  id: string;
  instruction: string;
  budget: number;
  constraints: Record<string, string | number>;
  expected: Record<string, unknown>;
  tags: string[];
  adversarial: boolean;
  baseTaskId?: string;
}

/** Repo root (contains agents/). Next runs with cwd = web/. Override with SPENDBENCH_ROOT. */
export function repoRoot(): string {
  if (process.env.SPENDBENCH_ROOT) return path.resolve(process.env.SPENDBENCH_ROOT);
  const cwd = process.cwd();
  for (const c of [cwd, path.resolve(cwd, "..")]) if (fs.existsSync(path.join(c, "agents", "spendbench"))) return c;
  return path.resolve(cwd, "..");
}

const files = () => {
  const dir = path.join(repoRoot(), "agents", "spendbench");
  return { base: path.join(dir, "tasks.json"), generated: path.join(dir, "tasks_generated.json") };
};

type Cache = { key: string; tasks: Task[] };
const g = globalThis as unknown as { __sbTasks?: Cache };

function mtime(p: string) {
  try { return fs.statSync(p).mtimeMs; } catch { return 0; }
}

function readTasks(p: string, adversarial: boolean): Task[] {
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    const list: Record<string, unknown>[] = Array.isArray(raw) ? raw : Array.isArray(raw?.tasks) ? raw.tasks : [];
    return list.filter((t) => t && typeof t.id === "string").map((t) => ({
      id: String(t.id),
      instruction: String(t.instruction ?? ""),
      budget: Number(t.budget ?? 0),
      constraints: (t.constraints as Task["constraints"]) ?? {},
      expected: (t.expected as Task["expected"]) ?? {},
      tags: Array.isArray(t.tags) ? (t.tags as string[]) : [],
      adversarial: adversarial || typeof t.baseTaskId === "string",
      ...(typeof t.baseTaskId === "string" ? { baseTaskId: t.baseTaskId } : {}),
    }));
  } catch {
    return [];
  }
}

export function listTasks(): Task[] {
  const f = files();
  const key = `${mtime(f.base)}|${mtime(f.generated)}`;
  if (g.__sbTasks?.key === key) return g.__sbTasks.tasks;
  const tasks = [...readTasks(f.base, false), ...readTasks(f.generated, true)];
  g.__sbTasks = { key, tasks };
  return tasks;
}

export function getTask(id: string): Task | undefined {
  return listTasks().find((t) => t.id === id);
}

export function tagCounts(tasks = listTasks()): { tag: string; count: number }[] {
  const c = new Map<string, number>();
  for (const t of tasks) for (const tag of t.tags) c.set(tag, (c.get(tag) ?? 0) + 1);
  return [...c].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Task tag → trap type the task exposes the agent to. */
export const TRAP_TAGS: Record<string, TrapType> = {
  "injection-exposure": "prompt_injection",
  "knockoff-exposure": "knockoff",
  "discount-bait": "fake_discount",
  "new-merchant-exposure": "new_merchant",
  "price-gouge-exposure": "price_gouge",
};

/** Trap types a task (by its tags) exposes the agent to. Red-team variants carry `redteam:<trapType>`. */
export function exposures(tags: string[] = []): Set<TrapType> {
  const out = new Set<TrapType>();
  for (const t of tags) {
    if (TRAP_TAGS[t]) out.add(TRAP_TAGS[t]);
    if (t.startsWith("redteam:")) out.add(t.slice(8) as TrapType);
  }
  return out;
}

/**
 * Deterministic, diverse sample of `n` base tasks: first one task per trap tag (so every trap type is covered),
 * then round-robin over the remaining tags, ties broken by a stable hash of the id.
 */
export function sampleTasks(n: number, pool: Task[]): Task[] {
  if (n >= pool.length) return [...pool];
  const h = (s: string) => { let x = 2166136261; for (const ch of s) x = Math.imul(x ^ ch.charCodeAt(0), 16777619) >>> 0; return x; };
  const sorted = [...pool].sort((a, b) => h(a.id) - h(b.id) || a.id.localeCompare(b.id));
  const chosen: Task[] = [];
  const has = new Set<string>();
  const take = (t?: Task) => { if (t && !has.has(t.id) && chosen.length < n) { has.add(t.id); chosen.push(t); } };
  // 1) cover every trap tag
  for (const tag of Object.keys(TRAP_TAGS)) take(sorted.find((t) => !has.has(t.id) && t.tags.includes(tag)));
  // 2) round-robin over all tags (rarest first) so sizing/quantity/ambiguous/tight-budget are represented too
  const tags = tagCounts(pool).map((x) => x.tag).reverse();
  let progress = true;
  while (chosen.length < n && progress) {
    progress = false;
    for (const tag of tags) {
      const t = sorted.find((x) => !has.has(x.id) && x.tags.includes(tag));
      if (t) { take(t); progress = true; }
      if (chosen.length >= n) break;
    }
  }
  for (const t of sorted) take(t);
  return chosen;
}
