"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LogEntry, Product } from "@/lib/types";
import { cx } from "@/components/ui";
import { usePlayer } from "./hooks";
import { derive, displayName, type LiveModel, type LiveSessionData } from "./model";
import Reveal from "./Reveal";
import Stage from "./Stage";
import { BudgetMeter, ChainStrip, StreamList } from "./Stream";
import "./live.css";

export type TheaterMode = "live" | "replay";

/**
 * Agent cam: the store mirror on a soft white panel, the agent's thoughts beside it as large calm text,
 * and a full-screen verdict at the end. Driven entirely by the session's trace entries.
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
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,3fr)_minmax(340px,2fr)] gap-6 max-lg:flex-none max-lg:grid-cols-1 max-lg:gap-4">
      <Stage d={d} products={products} merchants={merchants} speed={speed} agentName={agentName} intro={intro} showTraps={finished}
        overlay={reveal === "open" && result && data ? (
          <Reveal result={result} verdict={verdict} budget={d.task?.budget} sessionId={data.session.id} agentName={agentName}
            taskId={d.task?.taskId ?? result.taskId} dodged={dodged} chain={{ valid: data.integrity.valid, length: entries.length }}
            onSeq={(s) => { setReveal("closed"); setFocusSeq(s); }} onClose={() => setReveal("closed")} onAgain={onAgain} againLabel={againLabel} />
        ) : undefined} />

      <aside aria-label="Agent" className="relative isolate flex min-h-0 flex-col max-lg:h-[min(560px,80svh)]">
        <div aria-hidden className="burst burst-gold" style={{ ["--bx" as string]: "70%", ["--by" as string]: "18%", ["--bs" as string]: "min(620px, 120vw)", ["--bo" as string]: 0.45 }} />
        <div className="shrink-0 space-y-4 px-1 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[17px] font-medium tracking-[-0.02em] text-ink">{model ? agentName : "No agent yet"}</div>
              <div className="truncate text-[12.5px] text-ink-4">{meta ? (meta.simulated ? "Simulated agent" : "Real model · OpenRouter") : model ?? "pick a model and press Run"}</div>
            </div>
            <div className="shrink-0">{status}</div>
          </div>
          <BudgetMeter spent={d.spent} budget={d.task?.budget} settled={d.checkedOut} />
          {reveal === "closed" && result && (
            <button type="button" onClick={() => setReveal("open")} className="lv-fade-in text-[13.5px] font-medium text-ink-2 transition-colors hover:text-ink">Show the verdict →</button>
          )}
        </div>
        <StreamList entries={visible} speed={speed} live={mode === "live"} evidence={evidence} focusSeq={focusSeq} onSeq={setFocusSeq}
          empty={
            <div className="flex h-full flex-col justify-center px-1 pb-10">
              <p className="max-w-[24ch] text-[21px] leading-[1.35] tracking-[-0.02em] text-ink-4">Its thoughts will appear here as it shops.</p>
            </div>
          } />
        <div className="shrink-0 px-1 pt-3">
          {mode === "live" && data && !result && caughtUp && data.finished ? (
            <div className="text-[12.5px] text-ink-3"><span className="pulse-dot mr-2 inline-block size-1.5 rounded-full bg-gold align-middle" />Grading the result…</div>
          ) : <ChainStrip entries={visible} />}
        </div>
      </aside>
    </div>
  );
}

export function StatusPill({ kind, label }: { kind: "live" | "replay" | "done" | "idle" | "starting" | "error"; label?: string }) {
  const dot = { live: "pulse-dot bg-gold", starting: "pulse-dot bg-gold", replay: "bg-ink-4", done: "bg-sage", error: "bg-coral", idle: "bg-ink-5" }[kind];
  const text = label ?? { live: "Live", starting: "Starting", replay: "Replay", done: "Graded", error: "Error", idle: "Idle" }[kind];
  return (
    <span className={cx("inline-flex items-center gap-2 text-[13px]", kind === "error" ? "text-coral-ink" : "text-ink-3")}>
      <span aria-hidden className={cx("inline-block size-[7px] rounded-full", dot)} />{text}
    </span>
  );
}
