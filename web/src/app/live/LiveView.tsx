"use client";
// Watch: one question, one black Run button. Model / task / guardrail live in a quiet "Options" popover.
// Running: the store mirror + the agent's thoughts. Ending: a full-screen verdict (see components/live/Reveal).
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pause, Play, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { BenchResult, EvalRun, FeedEvent, GuardrailMode, LogEntry } from "@/lib/types";
import { useEvents } from "@/components/useEvents";
import { Select, cx } from "@/components/ui";
import { getJSON, useApi, type Task, type TasksResponse } from "@/lib/ui/api";
import { postJSON } from "@/lib/auth-client";
import AuthError from "@/components/auth/AuthError";
import { traceHref, usd } from "@/lib/ui/format";
import Theater, { StatusPill } from "@/components/live/Theater";
import { displayName, obj, str, type LiveConfig, type LiveModel, type LivePreset, type LiveSessionData } from "@/components/live/model";

type Phase = "idle" | "starting" | "live" | "error";

const DEFAULT_TASK = "airpods-pro-2";
/** Real models to open with (fast, articulate), in order. Falls back to any available real model, then the sim. */
const PREFERRED_REAL = ["anthropic/claude-haiku-4.5", "google/gemini-2.5-flash", "openai/gpt-5-mini"];

function defaultModel(models: LiveModel[]): string {
  const real = models.filter((m) => !m.simulated && m.available);
  return PREFERRED_REAL.find((id) => real.some((m) => m.id === id)) ?? real[0]?.id ?? "sim/gullible";
}

export default function LiveView({ replayId, initialModel, initialTask }: { replayId?: string; initialModel?: string; initialTask?: string }) {
  const { data: cfg } = useApi<LiveConfig>("/api/live");
  const { data: tasksRes } = useApi<TasksResponse>("/api/tasks");
  const tasks = useMemo(() => tasksRes?.tasks ?? [], [tasksRes]);
  const models = useMemo(() => cfg?.models ?? [], [cfg]);

  // `undefined` until the user picks: then the default follows GET /api/live (a real model when a key is configured)
  const [picked, setModel] = useState<string | undefined>(initialModel);
  const model = picked ?? (cfg ? defaultModel(models) : "sim/gullible");
  const [taskId, setTaskId] = useState(initialTask || DEFAULT_TASK);
  const [guardrail, setGuardrail] = useState<GuardrailMode>("observe");
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState<string>();
  const [nonce, setNonce] = useState(0);

  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [data, setData] = useState<Omit<LiveSessionData, "entries">>();
  const runRef = useRef<string | undefined>(undefined);
  const sesRef = useRef<string | undefined>(undefined);
  const startsByRun = useRef(new Map<string, string>());
  const pending = useRef<LogEntry[]>([]);

  // replay controls
  const [speed, setSpeed] = useState(replayId ? 2 : 1);
  const [paused, setPaused] = useState(false);
  const [pos, setPos] = useState<[number, number]>([0, 0]);
  const [seekTo, setSeekTo] = useState<{ n: number; nonce: number }>();
  const onPosition = useCallback((a: number, b: number) => setPos([a, b]), []);

  const merge = useCallback((more: LogEntry[]) => {
    if (!more.length) return;
    setEntries((prev) => {
      const seen = new Set(prev.map((e) => e.seq));
      const add = more.filter((e) => !seen.has(e.seq));
      if (!add.length) return prev;
      return [...prev, ...add].sort((a, b) => a.seq - b.seq);
    });
  }, []);

  const refresh = useCallback(async () => {
    const sid = sesRef.current;
    if (!sid) return;
    try {
      const full = await getJSON<LiveSessionData>(`/api/live/sessions/${encodeURIComponent(sid)}`);
      if (sesRef.current !== sid) return;
      const { entries: es, ...rest } = full;
      setData((prev) => ({ ...rest, result: rest.result ?? prev?.result }));
      merge(es);
      if (rest.run?.status === "failed" && !rest.result) { setErr(rest.run.error || "The agent run failed"); setPhase("error"); }
    } catch { /* transient; next poll retries */ }
  }, [merge]);

  const adopt = useCallback((sid: string) => {
    if (sesRef.current) return;
    sesRef.current = sid;
    merge(pending.current.filter((e) => e.sessionId === sid));
    pending.current = [];
    setPhase("live");
    refresh();
  }, [merge, refresh]);

  // ---- replay: load the whole trace up front
  useEffect(() => {
    if (!replayId) return;
    sesRef.current = replayId;
    getJSON<LiveSessionData>(`/api/live/sessions/${encodeURIComponent(replayId)}`).then((full) => {
      const { entries: es, ...rest } = full;
      setData(rest);
      setEntries(es);
    }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [replayId]);

  // ---- live: SSE for low latency, polling as a safety net
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const soon = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(refresh, 220);
  }, [refresh]);

  const connected = useEvents(["log", "result", "run"], (ev: FeedEvent) => {
    if (ev.type === "log") {
      const e = ev.data as LogEntry;
      if (!e || typeof e.seq !== "number") return;
      if (e.action === "session_start") {
        const rid = str(obj(e.payload).runId);
        if (rid) startsByRun.current.set(rid, e.sessionId);
        if (rid && rid === runRef.current && !sesRef.current) { pending.current.push(e); adopt(e.sessionId); return; }
      }
      if (e.sessionId === sesRef.current) {
        merge([e]);
        if (["search", "view", "add_to_cart", "checkout_result"].includes(e.action)) soon();
      } else if (!sesRef.current && runRef.current) {
        pending.current = [...pending.current.slice(-300), e];
      }
    } else if (ev.type === "result") {
      const r = ev.data as BenchResult;
      if (r?.sessionId && r.sessionId === sesRef.current) { setData((d) => (d ? { ...d, result: r } : d)); soon(); }
    } else if (ev.type === "run") {
      const r = ev.data as EvalRun;
      if (r?.id !== runRef.current) return;
      if (r.status === "failed") { setErr(r.error || "The agent run failed"); setPhase("error"); }
      if (r.status === "completed") soon();
    }
  }, !replayId);

  useEffect(() => {
    if (replayId || phase !== "live" || data?.result) return;
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [replayId, phase, data?.result, refresh]);

  useEffect(() => {
    if (phase !== "starting") return;
    const id = setInterval(async () => {
      const rid = runRef.current;
      if (!rid || sesRef.current) return;
      const known = startsByRun.current.get(rid);
      if (known) return adopt(known);
      try {
        const r = await getJSON<{ sessionId: string | null; run: EvalRun }>(`/api/live/runs/${encodeURIComponent(rid)}`);
        if (r.sessionId) adopt(r.sessionId);
        else if (r.run.status === "failed") { setErr(r.run.error || "The agent run failed"); setPhase("error"); }
      } catch { /* retry */ }
    }, 900);
    return () => clearInterval(id);
  }, [phase, adopt]);

  const reset = useCallback(() => {
    runRef.current = undefined; sesRef.current = undefined; pending.current = [];
    setEntries([]); setData(undefined); setErr(undefined); setPhase("idle"); setNonce((n) => n + 1);
  }, []);

  const run = useCallback(async () => {
    reset();
    setPhase("starting");
    try {
      const r = await postJSON<{ runId: string }>("/api/live", { model, taskId, guardrail, paceMs: 750 });
      runRef.current = r.runId;
      const known = startsByRun.current.get(r.runId);
      if (known) adopt(known);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [reset, model, taskId, guardrail, adopt]);

  const task = tasks.find((t) => t.id === (replayId ? data?.session.task.taskId : taskId));
  const modelMeta = models.find((m) => m.id === model);
  const finished = !!data?.result && pos[0] >= pos[1] && pos[1] > 0;
  const busy = phase === "starting" || (phase === "live" && !data?.result);
  const disabledReason = cfg && !cfg.demoEnabled ? "Live runs are turned off on this server." : undefined;

  // ---------------------------------------------------------------- opening state: one question, one button
  if (!replayId && (phase === "idle" || (phase === "error" && !entries.length))) {
    return (
      <Opening task={task} model={model} modelMeta={modelMeta} models={models} tasks={tasks} presets={cfg?.presets ?? []}
        taskId={taskId} guardrail={guardrail} err={err} disabledReason={disabledReason} ready={!!cfg && !!task}
        onRun={run} onPreset={(p) => { setTaskId(p.taskId); setModel(p.model); }}
        onModel={setModel} onTask={setTaskId} onGuardrail={setGuardrail} />
    );
  }

  const status = replayId
    ? <StatusPill kind={finished ? "done" : "replay"} label={finished ? "Graded" : `Replay ${speed}×`} />
    : phase === "error" ? <StatusPill kind="error" />
    : phase === "starting" ? <StatusPill kind="starting" />
    : phase === "live" ? (finished ? <StatusPill kind="done" /> : <StatusPill kind="live" label={connected ? "Live" : "Reconnecting"} />)
    : <StatusPill kind="idle" />;

  const intro = (
    <div className="flex h-full min-h-[280px] items-center justify-center p-8 text-center">
      {replayId ? (
        err ? <p className="text-[15px] text-coral-ink">Couldn’t load this trace. {err}</p> : <p className="text-[15px] text-ink-3">Loading the trace…</p>
      ) : (
        <div className="lv-fade-up">
          <span aria-hidden className="pulse-dot mx-auto mb-4 block size-2 rounded-full bg-gold" />
          <p className="text-[19px] font-medium tracking-[-0.02em] text-ink">Opening the store…</p>
          {task && <p className="mx-auto mt-2 max-w-[36ch] text-[14px] text-ink-3">“{task.instruction}”</p>}
        </div>
      )}
    </div>
  );

  return (
    <div className="relative left-1/2 -mb-24 flex h-[calc(100dvh-140px)] min-h-[620px] w-[min(1440px,calc(100vw-40px))] -translate-x-1/2 flex-col max-lg:static max-lg:mb-0 max-lg:h-auto max-lg:min-h-0 max-lg:w-full max-lg:translate-x-0">
      {/* one quiet line: what's playing, and (replay) the transport */}
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-baseline gap-x-3 gap-y-1 max-sm:flex-wrap">
          <h1 className="text-[22px] font-[600] leading-tight tracking-[-0.035em] text-ink sm:text-[26px]">{replayId ? "Replay." : "Watch."}</h1>
          <span className="min-w-0 truncate text-[14px] text-ink-3">
            {replayId
              ? <Link href={traceHref(replayId)} className="break-anywhere font-mono text-[12.5px] text-ink-3 hover:text-accent">{replayId}</Link>
              : <>{displayName(model, models)} <span className="text-ink-5">·</span> {task?.id ?? taskId}</>}
          </span>
        </div>
        {replayId ? (
          <ReplayControls pos={pos} speed={speed} setSpeed={setSpeed} paused={paused} setPaused={setPaused}
            onSeek={(n) => setSeekTo({ n, nonce: Date.now() })} onRestart={() => { setPaused(false); setSeekTo({ n: 0, nonce: Date.now() }); }} />
        ) : !busy ? (
          <button type="button" onClick={reset} className="group inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-2 transition-colors hover:text-ink">
            <RotateCcw size={14} aria-hidden className="transition-transform duration-300 group-hover:-rotate-45" /> Watch another
          </button>
        ) : null}
      </div>

      {err && phase === "error" && !replayId && (
        <div className="mb-3 shrink-0 text-[14px] text-coral-ink"><AuthError message={err} className="text-[14px]" /></div>
      )}

      <Theater key={`${replayId ?? "live"}-${nonce}`} mode={replayId ? "replay" : "live"} data={data} entries={entries} speed={speed} paused={paused}
        models={models} intro={intro} status={status} idleModel={replayId ? undefined : model} seekTo={seekTo} onPosition={onPosition}
        onAgain={replayId ? () => { setPaused(false); setSeekTo({ n: 0, nonce: Date.now() }); } : reset}
        againLabel={replayId ? "Replay again" : "Watch another"} />
    </div>
  );
}

/* ------------------------------------------------------------------ opening */

const TAG_SENTENCE: Record<string, string> = {
  "injection-exposure": "One listing hides an instruction meant for it.",
  "knockoff-exposure": "Some listings are knockoffs.",
  "discount-bait": "Some discounts are fake.",
  "new-merchant-exposure": "Some sellers opened last week.",
  "price-gouge-exposure": "Some prices are gouged.",
};

function Opening({ task, model, modelMeta, models, tasks, presets, taskId, guardrail, err, disabledReason, ready, onRun, onPreset, onModel, onTask, onGuardrail }: {
  task?: Task; model: string; modelMeta?: LiveModel; models: LiveModel[]; tasks: Task[]; presets: LivePreset[];
  taskId: string; guardrail: GuardrailMode; err?: string; disabledReason?: string; ready: boolean;
  onRun: () => void; onPreset: (p: LivePreset) => void; onModel: (m: string) => void; onTask: (t: string) => void; onGuardrail: (g: GuardrailMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const who = modelMeta ? (modelMeta.simulated ? "A simulated agent" : `${modelMeta.displayName}, a real AI,`) : "An agent";
  const trap = task?.tags.map((t) => TAG_SENTENCE[t]).find(Boolean) ?? (task?.adversarial ? "One listing is a scam our red team built." : "Some listings are traps.");
  return (
    <section aria-labelledby="watch-title" className="relative isolate -mx-4 flex min-h-[calc(100svh-96px)] flex-col items-center justify-center px-5 pb-16 text-center sm:-mx-8 sm:min-h-[calc(100svh-112px)]">
      <div aria-hidden className="burst burst-gold" style={{ ["--bx" as string]: "50%", ["--by" as string]: "40%", ["--bs" as string]: "min(1100px, 140vw)", ["--bo" as string]: 0.75 }} />
      <div aria-hidden className="burst burst-sage" style={{ ["--bx" as string]: "74%", ["--by" as string]: "72%", ["--bs" as string]: "min(560px, 90vw)", ["--bo" as string]: 0.5 }} />

      <h1 id="watch-title" className="lv-fade-up font-[600] leading-[0.96] tracking-[-0.055em] text-ink [font-size:clamp(46px,7.4vw,112px)]">
        Watch an agent <span className="text-gold-sweep">shop.</span>
      </h1>
      <p className="lv-fade-up mx-auto mt-6 max-w-[44ch] text-[17px] leading-[1.45] text-ink-3 sm:text-[19px]" style={{ animationDelay: "80ms" }}>
        {task ? <>{who} gets {usd(task.budget, 0)} and a store full of traps. {trap}</> : "It gets a budget and a store full of traps."}
      </p>

      <div className="lv-fade-up mt-10 flex flex-col items-center" style={{ animationDelay: "160ms" }}>
        <button type="button" onClick={onRun} disabled={!ready || !!disabledReason}
          className="inline-flex h-14 items-center gap-2.5 rounded-full bg-ink px-9 text-[17px] font-medium text-white shadow-ink transition-[background-color,transform] duration-200 hover:bg-[oklch(28%_0.012_70)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40">
          <Play size={16} fill="currentColor" aria-hidden /> Run
        </button>

        <div className="relative mt-6">
          <button type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[14px] text-ink-3 transition-colors hover:text-ink">
            <SlidersHorizontal size={14} aria-hidden />
            <span>{displayName(model, models)} <span className="text-ink-5">·</span> {taskId}</span>
            <span className="font-medium text-ink-2">Options</span>
          </button>
          {open && (
            <Options onClose={() => setOpen(false)} models={models} tasks={tasks} presets={presets} model={model} taskId={taskId} guardrail={guardrail}
              onPreset={onPreset} onModel={onModel} onTask={onTask} onGuardrail={onGuardrail} />
          )}
        </div>

        <div className="mt-3 min-h-5 text-[13.5px]">
          {disabledReason ? <p className="text-ink-3">{disabledReason}</p>
            : err ? <AuthError message={err} className="text-[13.5px]" />
            : <p className="text-ink-4">About 20 seconds. Graded like any eval.</p>}
        </div>
      </div>
    </section>
  );
}

function Options({ onClose, models, tasks, presets, model, taskId, guardrail, onPreset, onModel, onTask, onGuardrail }: {
  onClose: () => void; models: LiveModel[]; tasks: Task[]; presets: LivePreset[]; model: string; taskId: string; guardrail: GuardrailMode;
  onPreset: (p: LivePreset) => void; onModel: (m: string) => void; onTask: (t: string) => void; onGuardrail: (g: GuardrailMode) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    ref.current?.querySelector<HTMLElement>("button, select")?.focus();
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [onClose]);

  return (
    <div ref={ref} role="dialog" aria-label="Run options"
      className="lv-pop absolute left-1/2 top-full z-30 mt-2 w-[min(380px,calc(100vw-32px))] -translate-x-1/2 rounded-[22px] bg-surface p-2 text-left shadow-float">
      {presets.length > 0 && (
        <ul className="grid">
          {presets.map((p) => {
            const on = p.taskId === taskId;
            return (
              <li key={p.key}>
                <button type="button" onClick={() => onPreset(p)}
                  className={cx("flex w-full items-start gap-3 rounded-[16px] px-3 py-2.5 text-left transition-colors", on ? "bg-gold-soft" : "hover:bg-ivory")}>
                  <span className={cx("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full", on ? "bg-accent text-white" : "shadow-[inset_0_0_0_1px_var(--color-ink-5)]")}>
                    {on && <Check size={10} strokeWidth={3} aria-hidden />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium tracking-[-0.01em] text-ink">{p.label}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{p.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-1 grid gap-2 border-t border-divider p-2 pt-3">
        <Field label="Agent">
          <Select label="Agent" value={model} onChange={onModel} className="w-full">
            <optgroup label="Real models">{models.filter((m) => !m.simulated).map((m) => <option key={m.id} value={m.id} disabled={!m.available}>{m.displayName}{m.available ? "" : " (needs key)"}</option>)}</optgroup>
            <optgroup label="Simulated">{models.filter((m) => m.simulated).map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}</optgroup>
          </Select>
        </Field>
        <Field label="Task">
          <Select label="Task" value={taskId} onChange={onTask} className="w-full"><TaskOptions tasks={tasks} /></Select>
        </Field>
        <Field label="Guardrail">
          <Select label="Guardrail" value={guardrail} onChange={(v) => onGuardrail(v as GuardrailMode)} className="w-full">
            <option value="observe">Observe</option>
            <option value="enforce">Enforce</option>
            <option value="off">Off</option>
          </Select>
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-3">
      <span className="text-[13px] text-ink-3">{label}</span>
      {children}
    </label>
  );
}

function TaskOptions({ tasks }: { tasks: Task[] }) {
  const base = tasks.filter((t) => !t.adversarial);
  const adv = tasks.filter((t) => t.adversarial);
  return (
    <>
      <optgroup label="Benchmark tasks">{base.map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}</optgroup>
      {adv.length > 0 && <optgroup label="Red-team variants">{adv.map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}</optgroup>}
    </>
  );
}

/* ------------------------------------------------------------------ replay transport (quiet) */

function ReplayControls({ pos, speed, setSpeed, paused, setPaused, onSeek, onRestart }: {
  pos: [number, number]; speed: number; setSpeed: (n: number) => void; paused: boolean; setPaused: (b: boolean) => void;
  onSeek: (n: number) => void; onRestart: () => void;
}) {
  const [shown, total] = pos;
  const icon = "inline-flex size-9 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-ivory hover:text-ink";
  return (
    <div className="flex items-center gap-1.5 max-sm:w-full">
      <button type="button" onClick={() => setPaused(!paused)} className={icon} aria-label={paused ? "Play" : "Pause"}>
        {paused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
      </button>
      <button type="button" onClick={onRestart} className={icon} aria-label="Restart"><RotateCcw size={14} /></button>
      <div role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={total} aria-valuenow={shown} tabIndex={0}
        onKeyDown={(e) => { if (e.key === "ArrowRight") onSeek(shown + 1); if (e.key === "ArrowLeft") onSeek(shown - 1); }}
        className="relative mx-1 h-9 w-[200px] cursor-pointer max-sm:w-auto max-sm:min-w-[100px] max-sm:flex-1"
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.round(((e.clientX - r.left) / r.width) * total)); }}>
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink-5" />
        <div className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-gold transition-[width] duration-300" style={{ width: `${total ? (shown / total) * 100 : 0}%` }} />
      </div>
      <span className="w-[48px] text-[12px] text-ink-4 tnum">{shown}/{total}</span>
      <div className="flex items-center">
        {[1, 2, 4].map((s) => (
          <button key={s} type="button" onClick={() => setSpeed(s)} aria-pressed={speed === s}
            className={cx("h-9 rounded-full px-2.5 text-[12.5px] tnum transition-colors", speed === s ? "font-medium text-ink" : "text-ink-4 hover:text-ink-2")}>{s}×</button>
        ))}
      </div>
      <Link href="/live" className="ml-2 whitespace-nowrap text-[13.5px] font-medium text-ink-2 transition-colors hover:text-ink max-sm:hidden">Run live</Link>
    </div>
  );
}
