"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import type { BenchResult, EvalRun, FeedEvent, GuardrailMode, LogEntry } from "@/lib/types";
import { useEvents } from "@/components/useEvents";
import { Badge, ProviderBadge, Select, buttonClass, cx } from "@/components/ui";
import { getJSON, postJSON, useApi, type Task, type TasksResponse } from "@/lib/ui/api";
import { traceHref, usd } from "@/lib/ui/format";
import Theater, { StatusPill } from "@/components/live/Theater";
import { displayName, obj, str, type LiveConfig, type LiveSessionData } from "@/components/live/model";

type Phase = "idle" | "starting" | "live" | "error";

export default function LiveView({ replayId, initialModel, initialTask }: { replayId?: string; initialModel?: string; initialTask?: string }) {
  const { data: cfg } = useApi<LiveConfig>("/api/live");
  const { data: tasksRes } = useApi<TasksResponse>("/api/tasks");
  const tasks = useMemo(() => tasksRes?.tasks ?? [], [tasksRes]);
  const models = useMemo(() => cfg?.models ?? [], [cfg]);

  const [model, setModel] = useState(initialModel || "sim/gullible");
  const [taskId, setTaskId] = useState(initialTask || "airpods-pro-2");
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

  const status = replayId
    ? <StatusPill kind={finished ? "done" : "replay"} label={finished ? "Graded" : `Replay ${speed}×`} />
    : phase === "error" ? <StatusPill kind="error" />
    : phase === "starting" ? <StatusPill kind="starting" />
    : phase === "live" ? (finished ? <StatusPill kind="done" /> : <StatusPill kind="live" label={connected ? "Live" : "Reconnecting"} />)
    : <StatusPill kind="idle" />;

  const intro = replayId ? (
    <div className="flex h-full items-center justify-center text-[13px] text-zinc-500">{err ? <span className="text-rose-700">Couldn’t load trace: {err}</span> : "Loading trace…"}</div>
  ) : (
    <Intro task={task} modelName={displayName(model, models)} modelProfile={modelMeta?.profile} simulated={modelMeta?.simulated}
      phase={phase} err={err} onRun={run} disabled={!cfg?.demoEnabled || !task} disabledReason={cfg && !cfg.demoEnabled ? "Live runs are disabled on this server (SPENDBENCH_DEMO=0)." : undefined} />
  );

  return (
    <div className="relative left-1/2 -mb-24 flex h-[calc(100dvh-104px)] min-h-[620px] w-[min(1440px,calc(100vw-40px))] -translate-x-1/2 flex-col">
      {/* header + controls */}
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[20px] font-semibold leading-tight tracking-[-0.02em] text-zinc-900">
            {replayId ? "Replay" : "Live"}
            <span className="text-[13px] font-normal tracking-normal text-zinc-500">
              {replayId ? <>trace <Link href={traceHref(replayId)} className="font-mono text-[12px] text-zinc-700 hover:text-accent">{replayId}</Link></> : "Watch an agent shop. Every step is traced, hash-chained and graded."}
            </span>
          </h1>
        </div>
        {replayId ? (
          <ReplayControls pos={pos} speed={speed} setSpeed={setSpeed} paused={paused} setPaused={setPaused}
            onSeek={(n) => setSeekTo({ n, nonce: Date.now() })} onRestart={() => { setPaused(false); setSeekTo({ n: 0, nonce: Date.now() }); }} />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {(cfg?.presets ?? []).map((p) => (
              <button key={p.key} type="button" disabled={busy} title={p.hint}
                onClick={() => { setTaskId(p.taskId); setModel(p.model); if (phase !== "idle") reset(); }}
                className={cx("inline-flex h-8 items-center rounded-md border px-2.5 text-[12.5px] transition-colors disabled:opacity-50",
                  taskId === p.taskId ? "border-accent bg-accent-soft text-accent" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")}>
                {p.label}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-zinc-200" />
            <Select label="Model" value={model} onChange={(v) => { setModel(v); if (phase !== "idle" && !busy) reset(); }} className="w-[168px]">
              {models.map((m) => <option key={m.id} value={m.id} disabled={!m.available}>{m.displayName}{m.available ? "" : " (needs key)"}</option>)}
            </Select>
            <Select label="Task" value={taskId} onChange={(v) => { setTaskId(v); if (phase !== "idle" && !busy) reset(); }} className="w-[190px]">
              <TaskOptions tasks={tasks} />
            </Select>
            <Select label="Guardrail" value={guardrail} onChange={(v) => setGuardrail(v as GuardrailMode)} className="w-[176px]">
              <option value="observe">Guardrail: observe</option>
              <option value="enforce">Guardrail: enforce</option>
              <option value="off">Guardrail: off</option>
            </Select>
            <button onClick={run} disabled={busy || !cfg?.demoEnabled || !task} className={cx(buttonClass("primary"), "min-w-[76px]")}>
              {busy ? <span className="pulse-dot inline-block size-1.5 rounded-full bg-white" /> : <Play size={13} fill="currentColor" />}
              {busy ? "Running" : phase === "idle" ? "Run" : "Run again"}
            </button>
          </div>
        )}
      </div>

      {err && phase === "error" && !replayId && (
        <div className="mb-3 shrink-0 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{err}</div>
      )}

      <Theater key={`${replayId ?? "live"}-${nonce}`} mode={replayId ? "replay" : "live"} data={data} entries={entries} speed={speed} paused={paused}
        models={models} intro={intro} status={status} idleModel={replayId ? undefined : model} seekTo={seekTo} onPosition={onPosition}
        onAgain={replayId ? () => { setPaused(false); setSeekTo({ n: 0, nonce: Date.now() }); } : reset}
        againLabel={replayId ? "Replay again" : "Run another"} />
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

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

const TAG_LABEL: Record<string, [string, "bad" | "warn" | "outline"]> = {
  "injection-exposure": ["Hidden prompt injection", "bad"],
  "knockoff-exposure": ["Knockoffs", "bad"],
  "discount-bait": ["Fake discounts", "bad"],
  "new-merchant-exposure": ["Brand-new sellers", "bad"],
  "price-gouge-exposure": ["Price gouging", "bad"],
  sizing: ["Size must match", "warn"],
  quantity: ["Exact quantity", "warn"],
  "tight-budget": ["Tight budget", "warn"],
  ambiguous: ["Ambiguous request", "outline"],
};

function Intro({ task, modelName, modelProfile, simulated, phase, err, onRun, disabled, disabledReason }: {
  task?: Task; modelName: string; modelProfile?: string; simulated?: boolean; phase: Phase; err?: string;
  onRun: () => void; disabled: boolean; disabledReason?: string;
}) {
  if (!task) return <div className="flex h-full items-center justify-center text-[13px] text-zinc-500">Loading tasks…</div>;
  const constraints = Object.entries(task.constraints ?? {});
  const tags = task.tags.map((t) => t.startsWith("redteam:") ? [`Red team: ${t.slice(8).replace(/_/g, " ")}`, "bad"] as [string, "bad"] : TAG_LABEL[t]).filter(Boolean);
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div key={task.id + modelName} className="lv-fade-up w-full max-w-[580px]">
        <div className="flex items-center gap-2 text-[12px] text-zinc-500">
          {task.adversarial ? <Badge tone="bad">Red-team task</Badge> : <span>Task</span>}
          <span className="font-mono text-[11.5px] text-zinc-700">{task.id}</span>
        </div>
        <h2 className="mt-2.5 text-[24px] font-semibold leading-snug tracking-[-0.02em] text-zinc-900">“{task.instruction}”</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="rounded-md border border-zinc-200 px-2 py-0.5 text-zinc-700">Budget <span className="font-mono font-medium text-zinc-900">{usd(task.budget)}</span></span>
          {constraints.map(([k, v]) => (
            <span key={k} className="rounded-md border border-zinc-200 px-2 py-0.5 text-zinc-700"><span className="capitalize">{k}</span> <span className="font-mono font-medium text-zinc-900">{String(v)}</span></span>
          ))}
        </div>
        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[12px] text-zinc-500">In this store:</span>
            {tags.map(([l, tone]) => <Badge key={l} tone={tone}>{l}</Badge>)}
          </div>
        )}

        <div className="mt-6 flex items-center gap-3 rounded-lg border border-zinc-200 px-4 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-[13px] font-semibold text-white">{modelName.replace(/^Sim-/, "").slice(0, 1)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[13.5px] font-semibold text-zinc-900">{modelName} {simulated != null && <ProviderBadge simulated={simulated} provider="OpenRouter" />}</div>
            {modelProfile && <div className="text-[12.5px] text-zinc-500">{modelProfile}</div>}
          </div>
          <button onClick={onRun} disabled={disabled || phase === "starting"} className={cx(buttonClass("primary"), "h-9 px-4 text-[13.5px]")}>
            {phase === "starting" ? <><span className="pulse-dot inline-block size-1.5 rounded-full bg-white" /> Starting</> : <><Play size={14} fill="currentColor" /> Run</>}
          </button>
        </div>
        <p className="mt-2.5 text-[12px] text-zinc-500">
          {phase === "starting" ? "Spawning the agent harness and opening a session in the Arena…"
            : disabledReason ?? "One paced session, about 20 seconds. It is graded like any eval and lands on the leaderboard."}
        </p>
        {err && <p className="mt-2 text-[12.5px] text-rose-700">{err}</p>}
      </div>
    </div>
  );
}

function ReplayControls({ pos, speed, setSpeed, paused, setPaused, onSeek, onRestart }: {
  pos: [number, number]; speed: number; setSpeed: (n: number) => void; paused: boolean; setPaused: (b: boolean) => void;
  onSeek: (n: number) => void; onRestart: () => void;
}) {
  const [shown, total] = pos;
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setPaused(!paused)} className={buttonClass("secondary")} title={paused ? "Play" : "Pause"}>
        {paused ? <Play size={13} fill="currentColor" /> : <Pause size={13} fill="currentColor" />}
      </button>
      <button onClick={onRestart} className={buttonClass("secondary")} title="Restart"><RotateCcw size={13} /></button>
      <div className="relative h-8 w-[260px] cursor-pointer" title="Seek"
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.round(((e.clientX - r.left) / r.width) * total)); }}>
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${total ? (shown / total) * 100 : 0}%` }} />
        </div>
      </div>
      <span className="w-[54px] font-mono text-[11.5px] text-zinc-500 tnum">{shown}/{total}</span>
      <div className="flex h-8 items-center rounded-md border border-zinc-200 p-0.5">
        {[1, 2, 4].map((s) => (
          <button key={s} onClick={() => setSpeed(s)}
            className={cx("h-full rounded px-2.5 font-mono text-[12px] transition-colors", speed === s ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100")}>{s}×</button>
        ))}
      </div>
      <Link href="/live" className={buttonClass("primary")}>Run live</Link>
    </div>
  );
}
