"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LogEntry, Product } from "@/lib/types";
import { Badge, ProviderBadge, cx } from "@/components/ui";
import { usePlayer } from "./hooks";
import { derive, displayName, type LiveModel, type LiveSessionData } from "./model";
import Reveal from "./Reveal";
import Stage from "./Stage";
import { BudgetMeter, ChainStrip, StreamList } from "./Stream";
import "./live.css";

export type TheaterMode = "live" | "replay";

/**
 * Split-screen agent cam: store mirror on the left, reasoning / tool calls / hash chain on the right,
 * guardrail verdict and grade reveal at the end. Driven entirely by the session's trace entries.
 */
export default function Theater({
  mode, data, entries, speed, paused, models, intro, status, onAgain, againLabel, seekTo, onPosition, idleModel,
}: {
  idleModel?: string;
  mode: TheaterMode;
  data?: Omit<LiveSessionData, "entries">;
  entries: LogEntry[];
  speed: number;
  paused: boolean;
  models: LiveModel[];
  intro: ReactNode;
  status: ReactNode;
  onAgain: () => void;
  againLabel: string;
  seekTo?: { n: number; nonce: number };
  onPosition?: (shown: number, total: number) => void;
}) {
  const products: Record<string, Product> = useMemo(() => data?.products ?? {}, [data?.products]);
  const merchants = useMemo(() => data?.merchants ?? {}, [data?.merchants]);
  const { shown, seek } = usePlayer({ entries, products, speed, live: mode === "live", paused });
  useEffect(() => { if (seekTo) seek(seekTo.n); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [seekTo?.nonce]);
  useEffect(() => { onPosition?.(shown, entries.length); }, [shown, entries.length, onPosition]);

  const visible = useMemo(() => entries.slice(0, shown), [entries, shown]);
  const d = useMemo(() => derive(visible), [visible]);
  const result = data?.result;
  const caughtUp = shown >= entries.length && entries.length > 0;
  const model = d.model ?? data?.session.model ?? idleModel;
  const agentName = displayName(model, models);
  const meta = models.find((m) => m.id === model);

  // reveal: once everything has played and the grade is in
  const [reveal, setReveal] = useState<"hidden" | "open" | "closed">("hidden");
  useEffect(() => {
    if (!caughtUp || !result || reveal !== "hidden") return;
    const t = setTimeout(() => setReveal("open"), 1100 / speed);
    return () => clearTimeout(t);
  }, [caughtUp, result, reveal, speed]);
  useEffect(() => { if (!caughtUp && reveal !== "hidden") setReveal("hidden"); }, [caughtUp, reveal]);

  const [focusSeq, setFocusSeq] = useState<number>();
  const evidence = useMemo(() => new Set(reveal !== "hidden" ? result?.attribution?.evidenceSeqs ?? [] : []), [reveal, result]);
  const verdict = d.scene.kind === "checkout" ? d.scene.verdict : undefined;
  // trap listings the agent inspected and did not buy (ground truth is only present once the session is over)
  const dodged = useMemo(() => {
    const bought = new Set(d.cart.map((c) => c.productId));
    return [...d.visited].map((id) => products[id]).filter((p) => p?.trap && !bought.has(p.id)).map((p) => ({ id: p.id, type: p.trap!.type }));
  }, [d.visited, d.cart, products]);
  const finished = !!data?.finished && caughtUp;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,3fr)_minmax(340px,2fr)] gap-3 max-lg:flex-none max-lg:grid-cols-1">
      <Stage d={d} products={products} merchants={merchants} speed={speed} agentName={agentName} intro={intro} showTraps={finished}
        overlay={reveal === "open" && result && data ? (
          <Reveal result={result} verdict={verdict} budget={d.task?.budget} sessionId={data.session.id} agentName={agentName}
            taskId={d.task?.taskId ?? result.taskId} dodged={dodged} chain={{ valid: data.integrity.valid, length: entries.length }}
            onSeq={(s) => { setFocusSeq(s); }} onClose={() => setReveal("closed")} onAgain={onAgain} againLabel={againLabel} />
        ) : undefined} />

      <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white max-lg:h-[min(560px,80svh)]">
        <div className="shrink-0 space-y-3 border-b border-zinc-200 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold",
                model ? "bg-accent text-white" : "bg-zinc-100 text-zinc-400")}>{agentName.replace(/^Sim-/, "").slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold text-zinc-900">{model ? agentName : "No agent yet"}</div>
                <div className="truncate font-mono text-[11px] text-zinc-400">{model ?? "pick a model and press Run"}</div>
              </div>
              {meta && <ProviderBadge simulated={meta.simulated} provider={meta.simulated ? "Simulated" : "OpenRouter"} />}
            </div>
            <div className="shrink-0">{status}</div>
          </div>
          <BudgetMeter spent={d.spent} budget={d.task?.budget} settled={d.checkedOut} />
          <ChainStrip entries={visible} />
          {reveal === "closed" && result && (
            <button onClick={() => setReveal("open")} className="lv-fade-in w-full rounded-md border border-zinc-200 py-1 max-lg:py-2.5 text-[12px] text-zinc-600 hover:bg-zinc-50">Show grade</button>
          )}
        </div>
        <StreamList entries={visible} speed={speed} live={mode === "live"} evidence={evidence} focusSeq={focusSeq} onSeq={setFocusSeq}
          empty={
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <div className="text-[13px] font-medium text-zinc-900">Agent stream</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-500">
                The agent&apos;s reasoning types in here as it shops. Every tool call is a block in a SHA-256 hash chain.
              </p>
            </div>
          } />
        {mode === "live" && data && !result && caughtUp && data.finished && (
          <div className="shrink-0 border-t border-zinc-100 px-4 py-2 text-[12px] text-zinc-500"><span className="pulse-dot mr-1.5 inline-block size-1.5 rounded-full bg-accent align-middle" />Grading the result and attributing failures…</div>
        )}
      </aside>
    </div>
  );
}

export function StatusPill({ kind, label }: { kind: "live" | "replay" | "done" | "idle" | "starting" | "error"; label?: string }) {
  if (kind === "live") return <Badge tone="accent"><span className="pulse-dot inline-block size-1.5 rounded-full bg-accent" />{label ?? "Live"}</Badge>;
  if (kind === "starting") return <Badge tone="accent"><span className="pulse-dot inline-block size-1.5 rounded-full bg-accent" />Starting</Badge>;
  if (kind === "replay") return <Badge tone="outline">{label ?? "Replay"}</Badge>;
  if (kind === "done") return <Badge tone="good">{label ?? "Graded"}</Badge>;
  if (kind === "error") return <Badge tone="bad">{label ?? "Error"}</Badge>;
  return <Badge>{label ?? "Idle"}</Badge>;
}
