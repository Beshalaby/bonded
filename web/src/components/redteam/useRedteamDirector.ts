"use client";
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { FeedEvent, Product, RedTeamScam, TrapType } from "@/lib/types";

/* Progress events published by /api/redteam/progress (FeedEvent type "scam" with data.phase). */
export interface TheaterListing {
  id: string; taskId: string; trapType: TrapType; technique?: string; generator?: string; round?: number;
  product: Partial<Product>;
  task?: { id: string; instruction?: string; budget?: number };
}
export interface TheaterTest {
  model: string; fooled: boolean; success: boolean; scammed?: boolean; bought?: boolean; amount?: number;
  overBudget?: boolean; wrongItem?: boolean; sessionId?: string; steps?: number; trapTypes?: string[];
}
export interface TheaterScam {
  id: string; round: number; listing: TheaterListing; models: string[];
  tests: TheaterTest[];                 // arrival order
  verdict?: { kept: boolean; variantTaskId?: string; benchmarkTasks?: number; fooled: string[] };
}
export type Stage = "idle" | "writing" | "testing" | "verdict" | "done";

interface D {
  job?: string; replay: boolean; active: boolean; ended: boolean; perRound?: number;
  retry?: { round: number; attempt: number };
  startTasks?: number;                  // benchmark size when the job started
  scams: TheaterScam[];
  focus: number; stage: Stage; stageAt: number; lastReveal: number;
  revealed: Record<string, string[]>;   // scamId -> models whose lane has resolved
  shownKept: string[];                  // kept scams whose verdict has been shown
  speed: number;                        // 1 = normal; <1 = faster
  summary?: { round?: number; generated: number; kept: number };
}

const fresh = (): D => ({ replay: false, active: false, ended: false, scams: [], focus: -1, stage: "idle", stageAt: 0, lastReveal: 0, revealed: {}, shownKept: [], speed: 1 });

/** Timeline of one scam on stage (seconds, before speed scaling). */
export const WRITE = { title: [0, 0.7], price: 0.75, desc: [0.9, 0.8], payload: [1.75, 0.95], note: [2.8, 0.45], end: 3.35 } as const;
const TEST_MIN = 0.9, REVEAL_GAP = 0.26, VERDICT_HOLD_KEPT = 2.3, VERDICT_HOLD_DROP = 1.4;

type Phase = { phase: string; job?: string; round?: number; [k: string]: unknown };

export function useRedteamDirector() {
  const d = useRef<D>(fresh());
  const [, force] = useReducer((x: number) => x + 1, 0);

  const ingest = useCallback((p: Phase, opts: { replay?: boolean } = {}) => {
    const s = d.current;
    if (!opts.replay && s.replay && s.active) return; // a replay owns the stage until it finishes
    switch (p.phase) {
      case "job_start": {
        // new job: keep the stage if nothing has played yet, otherwise start over
        d.current = { ...fresh(), job: p.job, replay: !!opts.replay, active: true, perRound: Number(p.perRound) || undefined, startTasks: Number(p.benchmarkTasks) || undefined };
        break;
      }
      case "round_start":
        if (!s.active) { d.current = { ...fresh(), job: p.job, replay: !!opts.replay, active: true }; }
        d.current.perRound = Number(p.perRound) || d.current.perRound;
        d.current.startTasks ??= Number(p.benchmarkTasks) || undefined;
        d.current.retry = undefined;
        break;
      case "round_retry":
        s.retry = { round: Number(p.round), attempt: Number(p.attempt) };
        break;
      case "scam_generated": {
        if (!s.active) { d.current = { ...fresh(), job: p.job, replay: !!opts.replay, active: true }; }
        const L = p.scam as TheaterListing;
        if (!L?.id || d.current.scams.some((x) => x.id === L.id)) break;
        d.current.scams.push({ id: L.id, round: Number(p.round ?? L.round ?? 0), listing: L, models: (p.models as string[]) ?? [], tests: [] });
        break;
      }
      case "scam_tested": {
        const sc = s.scams.find((x) => x.id === p.scamId);
        if (!sc || sc.tests.some((t) => t.model === p.model)) break;
        sc.tests.push(p as unknown as TheaterTest);
        if (!sc.models.includes(String(p.model))) sc.models.push(String(p.model));
        break;
      }
      case "scam_kept":
      case "scam_discarded": {
        const sc = s.scams.find((x) => x.id === p.scamId);
        if (!sc) break;
        sc.verdict = { kept: p.phase === "scam_kept", variantTaskId: p.variantTaskId as string | undefined, benchmarkTasks: Number(p.benchmarkTasks) || undefined, fooled: (p.fooled as string[]) ?? [] };
        break;
      }
      case "round_end":
        s.summary = { round: Number(p.round), generated: Number(p.generated) || 0, kept: Number(p.kept) || 0 };
        s.retry = undefined;
        break;
      case "job_end":
        s.ended = true;
        break;
    }
    force();
  }, []);

  /** Feed a raw SSE event; returns true when it was a theater progress event. */
  const onFeed = useCallback((e: FeedEvent) => {
    const p = e.data as Phase;
    if (e.type !== "scam" || !p || typeof p.phase !== "string") return false;
    ingest(p);
    return true;
  }, [ingest]);

  // the director: one ticker advances the stage from timestamps, so bursts of events play at a readable pace
  useEffect(() => {
    const iv = setInterval(() => {
      const s = d.current;
      const now = performance.now() / 1000;
      const sp = s.speed;
      let changed = false;
      const go = (stage: Stage) => { s.stage = stage; s.stageAt = now; changed = true; };
      if (s.focus < 0 && s.scams.length) { s.focus = 0; go("writing"); }
      const sc = s.scams[s.focus];
      if (sc) {
        if (s.stage === "writing" && now - s.stageAt >= WRITE.end * sp + 0.2) go("testing");
        else if (s.stage === "testing") {
          const shown = s.revealed[sc.id] ?? [];
          if (now - s.stageAt >= TEST_MIN * sp && now - s.lastReveal >= REVEAL_GAP * sp) {
            const next = sc.tests.find((t) => !shown.includes(t.model));
            if (next) { s.revealed[sc.id] = [...shown, next.model]; s.lastReveal = now; changed = true; }
          }
          const all = sc.models.length > 0 && sc.models.every((m) => (s.revealed[sc.id] ?? []).includes(m));
          if (all && sc.verdict && now - s.lastReveal >= 0.55 * sp) {
            if (sc.verdict.kept) s.shownKept = [...s.shownKept, sc.id];
            go("verdict");
          }
        } else if (s.stage === "verdict") {
          const hold = (sc.verdict?.kept ? VERDICT_HOLD_KEPT : VERDICT_HOLD_DROP) * sp;
          if (now - s.stageAt >= hold) {
            if (s.focus + 1 < s.scams.length) {
              s.focus++;
              // with a backlog, later scams play faster so a whole round fits a pitch
              s.speed = Math.min(s.speed, s.scams.length - s.focus > 2 ? 0.55 : 0.75);
              go("writing");
            } else if (s.ended) { s.active = false; go("done"); }
          }
        }
      }
      if (changed) force();
    }, 60);
    return () => clearInterval(iv);
  }, []);

  /** Replay a stored scam (no backend work): synthesizes the same phases the loop emits. */
  const replay = useCallback((scams: RedTeamScam[]) => {
    const list = scams.slice(0, 3).reverse();
    if (!list.length) return;
    const job = `replay-${Date.now()}`;
    ingest({ phase: "job_start", job, perRound: list.length, benchmarkTasks: undefined }, { replay: true });
    ingest({ phase: "round_start", job, round: list[0].round ?? 0, perRound: list.length }, { replay: true });
    for (const s of list) {
      const models = s.testedModels.length ? s.testedModels : s.fooled;
      ingest({ phase: "scam_generated", job, round: s.round, models, scam: { id: s.id, taskId: s.taskId, trapType: s.trapType, technique: s.technique, generator: s.generator, round: s.round, product: s.product } }, { replay: true });
      models.forEach((m) => ingest({ phase: "scam_tested", job, scamId: s.id, model: m, fooled: s.fooled.includes(m), success: !s.fooled.includes(m) }, { replay: true }));
      ingest({ phase: "scam_kept", job, scamId: s.id, fooled: s.fooled, variantTaskId: s.variantTaskId }, { replay: true });
    }
    ingest({ phase: "round_end", job, round: list[0].round, generated: list.length, kept: list.length }, { replay: true });
    ingest({ phase: "job_end", job }, { replay: true });
  }, [ingest]);

  const skip = useCallback(() => { d.current.speed = 0.3; force(); }, []);

  const s = d.current;
  const current = s.scams[s.focus];
  // kept scams whose verdict hasn't played yet: the page holds them back from the gallery + growth chart
  const pendingIds = s.replay ? [] : s.scams.filter((x) => x.verdict?.kept && !s.shownKept.includes(x.id)).map((x) => x.id);
  return {
    state: s, current, stage: s.stage, revealed: current ? s.revealed[current.id] ?? [] : [],
    stageAt: s.stageAt, speed: s.speed, pendingIds, shownKept: s.shownKept, replay, skip, onFeed,
  };
}
