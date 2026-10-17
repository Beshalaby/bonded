// Server boot sequence (Node runtime only), called from src/instrumentation.ts register().
//   1. BONDED_ROOT -> SPENDBENCH_ROOT (repo root that contains agents/, used as cwd for Python runs)
//   2. load the store (awaited: Next does not serve requests until register() resolves)
//   3. mark runs left "running"/"queued" by a previous process as failed (their Python child died with it)
//   4. seed the Arena catalog if the store is empty (BONDED_AUTO_SEED=0 to disable)
//   5. BONDED_SEED_ON_BOOT=1: once the server answers, start a baseline run if none exists yet
//   6. flush the store on SIGTERM/SIGINT before exiting
import { flushNow, initStore, mutate, read } from "../db";

const g = globalThis as unknown as { __sbBooted?: boolean };

export async function boot() {
  if (g.__sbBooted) return;
  g.__sbBooted = true;

  if (process.env.BONDED_ROOT && !process.env.SPENDBENCH_ROOT) process.env.SPENDBENCH_ROOT = process.env.BONDED_ROOT;

  await initStore();

  const stale = read().runs.filter((r) => r.status === "running" || r.status === "queued").length;
  if (stale) {
    mutate((db) => {
      for (const r of db.runs) if (r.status === "running" || r.status === "queued") {
        r.status = "failed";
        r.error = "interrupted: server restarted while the run was in progress";
        r.finishedAt = new Date().toISOString();
      }
    });
    console.log(`[boot] marked ${stale} interrupted run(s) as failed`);
  }

  if (process.env.BONDED_AUTO_SEED !== "0" && read().products.length === 0) {
    const { seedArena } = await import("../arena");
    const r = seedArena({});
    console.log(`[boot] store was empty: seeded ${r.products} products / ${r.merchants} merchants`);
  }

  if (process.env.BONDED_SEED_ON_BOOT === "1") void baselineWhenUp();

  installSignalFlush();
}

async function baselineWhenUp() {
  if (read().runs.length > 0) { console.log("[boot] BONDED_SEED_ON_BOOT=1: runs already exist, skipping baseline"); return; }
  const { createRun, selfUrl } = await import("../runs");
  const url = `${selfUrl()}/api/health`;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  try {
    const run = createRun({
      models: ["sim/careful", "sim/bargain-hunter", "sim/gullible", "sim/hasty", "sim/brand-blind"],
      taskCount: Number(process.env.BONDED_SEED_TASKS || 30), guardrail: "observe",
      name: "Baseline: 5 sims (seeded on boot)",
    });
    console.log(`[boot] baseline run ${run.id} started (${run.progress.total} results expected)`);
  } catch (e) {
    console.error("[boot] baseline run failed to start:", (e as Error).message);
  }
}

function installSignalFlush() {
  let done = false;
  const onSignal = (sig: NodeJS.Signals) => {
    if (done) return;
    done = true;
    const timeout = new Promise((r) => setTimeout(r, 8000).unref());
    console.log(`[boot] ${sig}: flushing store`);
    void Promise.race([flushNow(), timeout]).finally(() => process.exit(0));
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
}
