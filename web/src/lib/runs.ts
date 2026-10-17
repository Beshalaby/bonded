// Eval runs: create an EvalRun, spawn the Python runner in the background, track progress as results arrive.
import { spawn, type ChildProcess } from "node:child_process";
import { mutate, read, uid } from "./db";
import { internalToken } from "./auth-node";
import { publish } from "./events";
import { listTasks, repoRoot, sampleTasks, type Task } from "./tasks";
import type { EvalRun, GuardrailMode } from "./types";

export class RunError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Procs = Map<string, ChildProcess>;
const g = globalThis as unknown as { __sbProcs?: Procs; __sbRedteamLast?: { finishedAt: string; ok: boolean; error?: string } };
const procs: Procs = g.__sbProcs ?? (g.__sbProcs = new Map());

/** URL the spawned Python processes use to reach this server. */
export function selfUrl() {
  return (process.env.SPENDBENCH_SELF_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, "");
}

/** Minimal env for child processes: no server secrets except the OpenRouter key the agents need and the
 *  service token (`x-bonded-internal`) they send back to this server's bench/admin routes. */
export function childEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {
    PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG || "en_US.UTF-8",
    PYTHONUNBUFFERED: "1", PYTHONDONTWRITEBYTECODE: "1", ARENA_URL: selfUrl(), BONDED_INTERNAL_TOKEN: internalToken(),
  };
  for (const k of ["OPENROUTER_API_KEY", "OPENROUTER_BASE_URL", "OPENROUTER_TIMEOUT", "OPENROUTER_RETRIES", "JUDGE_MODEL", "REDTEAM_MODEL", "BENCH_DEBUG"]) if (process.env[k]) env[k] = process.env[k];
  return env as NodeJS.ProcessEnv;
}

/** Spawn `python3 -m <module> ...args` at the repo root. Returns the child; stderr/stdout tail kept for errors. */
export function spawnPython(module: string, args: string[], onExit: (code: number | null, tail: string) => void) {
  const child = spawn(process.env.PYTHON || "python3", ["-m", module, ...args], {
    cwd: repoRoot(), env: childEnv(), stdio: ["ignore", "pipe", "pipe"],
  });
  let tail = "";
  const keep = (b: Buffer) => { tail = (tail + b.toString()).slice(-4000); };
  child.stdout?.on("data", keep);
  child.stderr?.on("data", keep);
  child.on("error", (e) => { tail += `\nspawn error: ${e.message}`; });
  child.on("close", (code) => onExit(code, tail));
  return child;
}

const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:\/-]{0,99}$/;
const MODES: GuardrailMode[] = ["off", "observe", "enforce"];

export interface CreateRunInput {
  models?: unknown; taskCount?: unknown; taskIds?: unknown; tags?: unknown; includeAdversarial?: unknown; guardrail?: unknown; name?: unknown;
}

function selectTasks(b: CreateRunInput): Task[] {
  const all = listTasks();
  const base = all.filter((t) => !t.adversarial);
  let chosen: Task[];
  if (Array.isArray(b.taskIds) && b.taskIds.length) {
    const byId = new Map(all.map((t) => [t.id, t]));
    const missing = b.taskIds.filter((id) => !byId.has(String(id)));
    if (missing.length) throw new RunError(400, `unknown taskIds: ${missing.slice(0, 5).join(", ")}`);
    chosen = [...new Set(b.taskIds.map(String))].map((id) => byId.get(id)!);
  } else {
    let pool = base;
    if (Array.isArray(b.tags) && b.tags.length) {
      const tags = new Set(b.tags.map(String));
      pool = pool.filter((t) => t.tags.some((x) => tags.has(x)));
    }
    const n = b.taskCount == null ? pool.length : Math.floor(Number(b.taskCount));
    if (!Number.isFinite(n) || n < 1) throw new RunError(400, "taskCount must be a positive integer");
    chosen = sampleTasks(n, pool);
  }
  if (b.includeAdversarial) {
    const have = new Set(chosen.map((t) => t.id));
    chosen = chosen.concat(all.filter((t) => t.adversarial && !have.has(t.id)));
  }
  if (!chosen.length) throw new RunError(400, "no tasks selected");
  return chosen;
}

export function createRun(b: CreateRunInput): EvalRun {
  const models = Array.isArray(b.models) ? [...new Set(b.models.map(String))] : [];
  if (!models.length) throw new RunError(400, "models: non-empty array of model ids required");
  if (models.length > 20) throw new RunError(400, "at most 20 models per run");
  const bad = models.find((m) => !MODEL_RE.test(m));
  if (bad) throw new RunError(400, `invalid model id: ${bad}`);
  const real = models.filter((m) => !m.startsWith("sim/"));
  if (real.length && !process.env.OPENROUTER_API_KEY)
    throw new RunError(400, `OPENROUTER_API_KEY is not set on the server; cannot run ${real.join(", ")} (use sim/* models)`);
  const guardrail = (b.guardrail ?? "observe") as GuardrailMode;
  if (!MODES.includes(guardrail)) throw new RunError(400, `guardrail must be one of ${MODES.join(", ")}`);
  const tasks = selectTasks(b);
  if (tasks.length * models.length > 5000) throw new RunError(400, "run too large (max 5000 model×task results)");

  const adv = tasks.filter((t) => t.adversarial).length;
  const run: EvalRun = {
    id: uid("run"),
    name: typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 80)
      : `${models.length} model${models.length === 1 ? "" : "s"} × ${tasks.length} task${tasks.length === 1 ? "" : "s"}${adv ? ` (${adv} adversarial)` : ""}`,
    models,
    taskIds: tasks.map((t) => t.id),
    guardrail,
    status: "queued",
    progress: { done: 0, total: models.length * tasks.length },
    createdAt: new Date().toISOString(),
  };
  mutate((db) => { db.runs.push(run); });
  publish("run", run);
  start(run);
  return run;
}

function update(id: string, fn: (r: EvalRun) => void): EvalRun | undefined {
  const r = mutate((db) => {
    const x = db.runs.find((y) => y.id === id);
    if (x) fn(x);
    return x ? (JSON.parse(JSON.stringify(x)) as EvalRun) : undefined;
  });
  if (r) publish("run", r);
  return r;
}

function start(run: EvalRun) {
  const args = ["--models", run.models.join(","), "--task-ids", run.taskIds.join(","), "--run-id", run.id,
    "--guardrail", run.guardrail, "--workers", String(Number(process.env.SPENDBENCH_WORKERS) || 8), "--post", "--quiet"];
  const child = spawnPython("agents.spendbench.runner", args, (code, tail) => {
    procs.delete(run.id);
    noteResults(run.id);
    update(run.id, (r) => {
      r.finishedAt = new Date().toISOString();
      if (code === 0) r.status = "completed";
      else {
        r.status = "failed";
        r.error = `runner exited with code ${code}: ${tail.trim().split("\n").slice(-5).join(" | ").slice(0, 600)}`;
      }
    });
  });
  procs.set(run.id, child);
  update(run.id, (r) => { r.status = "running"; r.startedAt = new Date().toISOString(); });
}

/**
 * Called on ingestion: progress = distinct model×task results stored for this run.
 * Results for an unknown runId (CLI runs, red-team validation rounds) get an ad-hoc EvalRun so every runId
 * the UI sees resolves; those are marked completed as results arrive (there is no process to watch).
 */
export function noteResults(runId: string) {
  const db = read();
  const rs = db.benchResults.filter((r) => r.runId === runId);
  const run = db.runs.find((r) => r.id === runId);
  if (!run) {
    if (!rs.length) return;
    const models = [...new Set(rs.map((r) => r.model))];
    const taskIds = [...new Set(rs.map((r) => r.taskId))];
    const mode = (rs.find((r) => (r as unknown as { guardrailMode?: string }).guardrailMode) as unknown as { guardrailMode?: GuardrailMode })?.guardrailMode;
    const rt = /^rt(\d+)-/.exec(runId);
    const first = rs.reduce((m, r) => (r.createdAt < m ? r.createdAt : m), rs[0].createdAt);
    const last = rs.reduce((m, r) => (r.createdAt > m ? r.createdAt : m), rs[0].createdAt);
    const adhoc: EvalRun = {
      id: runId,
      name: rt ? `Red-team round ${rt[1]} validation` : `CLI run ${runId}`,
      models, taskIds, guardrail: MODES.includes(mode as GuardrailMode) ? (mode as GuardrailMode) : "observe",
      status: "completed", progress: { done: models.length * taskIds.length, total: models.length * taskIds.length },
      createdAt: first, startedAt: first, finishedAt: last,
    };
    mutate((d) => {
      const i = d.runs.findIndex((r) => r.id === runId);
      if (i >= 0) d.runs[i] = adhoc; else d.runs.push(adhoc);
    });
    publish("run", adhoc);
    return;
  }
  const done = new Set(rs.map((r) => `${r.model}|${r.taskId}`)).size;
  if (procs.has(runId) || run.status === "queued" || run.status === "running") {
    if (done === run.progress.done) return;
    update(runId, (r) => {
      r.progress = { done: Math.min(done, r.progress.total), total: r.progress.total };
      if (r.status === "queued") r.status = "running";
    });
    return;
  }
  // completed ad-hoc run receiving more results: grow it
  update(runId, (r) => {
    r.models = [...new Set([...r.models, ...rs.map((x) => x.model)])];
    r.taskIds = [...new Set([...r.taskIds, ...rs.map((x) => x.taskId)])];
    r.progress = { done, total: Math.max(done, r.progress.total) };
    r.finishedAt = rs.reduce((m, x) => (x.createdAt > m ? x.createdAt : m), r.finishedAt ?? "");
  });
}

/**
 * Runs still marked running that were created before this server process booted can't have a live runner
 * (e.g. the server restarted mid-run): mark them failed. Runs created after boot are never reaped here, so a
 * second server process reading the same data dir can't fail another process's live run.
 */
const g2 = globalThis as unknown as { __sbBoot?: string };
const BOOT = g2.__sbBoot ?? (g2.__sbBoot = new Date().toISOString());
function reapOrphans() {
  const orphans = read().runs.filter((r) => (r.status === "running" || r.status === "queued") && !procs.has(r.id) && r.createdAt < BOOT);
  for (const o of orphans)
    update(o.id, (r) => { r.status = "failed"; r.error = "interrupted: server restarted while the run was in progress"; r.finishedAt = new Date().toISOString(); });
}

export function listRuns(): EvalRun[] {
  reapOrphans();
  return [...read().runs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getRun(id: string): EvalRun | undefined {
  reapOrphans();
  return read().runs.find((r) => r.id === id);
}

// ---------------------------------------------------------------- red team (background)
const RT_KEY = "__redteam__";
export function startRedteam(opts: { rounds?: unknown; perRound?: unknown; models?: unknown }) {
  if (procs.has(RT_KEY)) throw new RunError(409, "a red-team job is already running");
  const rounds = Math.min(Math.max(Math.floor(Number(opts.rounds ?? 1)) || 1, 1), 5);
  const perRound = Math.min(Math.max(Math.floor(Number(opts.perRound ?? 6)) || 6, 1), 20);
  const models = Array.isArray(opts.models) && opts.models.length ? opts.models.map(String) : ["sims"];
  const bad = models.find((m) => !MODEL_RE.test(m));
  if (bad) throw new RunError(400, `invalid model id: ${bad}`);
  const child = spawnPython("agents.redteam.loop", ["--rounds", String(rounds), "--per-round", String(perRound), "--models", models.join(","), "--post", "--json"],
    (code, tail) => {
      procs.delete(RT_KEY);
      g.__sbRedteamLast = { finishedAt: new Date().toISOString(), ok: code === 0, ...(code === 0 ? {} : { error: tail.trim().split("\n").slice(-3).join(" | ").slice(0, 400) }) };
    });
  procs.set(RT_KEY, child);
  return { started: true as const, rounds, perRound };
}

/** Status of the background red-team job (additive field on GET /api/redteam). */
export function redteamStatus() {
  return { running: procs.has(RT_KEY), last: g.__sbRedteamLast ?? null };
}
