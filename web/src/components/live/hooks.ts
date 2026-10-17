"use client";
import { useEffect, useRef, useState } from "react";
import type { LogEntry, Product } from "@/lib/types";
import { dwell } from "./model";

/**
 * Plays a growing list of trace entries one at a time, lingering on each long enough for its animation.
 * Live mode: entries arrive over SSE; if the theater falls behind it compresses dwell to catch up.
 * Replay mode: all entries are known up front; `speed` scales every dwell.
 */
export function usePlayer({ entries, products, speed, live, paused }: {
  entries: LogEntry[]; products: Record<string, Product>; speed: number; live: boolean; paused: boolean;
}) {
  const [shown, setShown] = useState(0);
  const appliedAt = useRef(0);
  const productsRef = useRef(products);
  productsRef.current = products;

  useEffect(() => { appliedAt.current = performance.now(); }, [shown]);
  useEffect(() => { if (shown > entries.length) setShown(entries.length); }, [entries.length, shown]);

  useEffect(() => {
    if (paused || shown >= entries.length) return;
    const backlog = entries.length - shown;
    let wait = shown === 0 ? 200 : dwell(entries[shown - 1], productsRef.current) / speed;
    if (live && backlog > 2) wait *= backlog > 6 ? 0.3 : 0.55;
    const remaining = Math.max(0, wait - (performance.now() - appliedAt.current));
    const t = setTimeout(() => setShown((s) => Math.min(s + 1, entries.length)), remaining);
    return () => clearTimeout(t);
  }, [shown, entries, paused, speed, live]);

  return { shown, seek: (n: number) => { appliedAt.current = performance.now(); setShown(Math.max(0, Math.min(n, entries.length))); } };
}

/** Reveal `text` a few characters at a time while `active`; shows it whole otherwise. */
export function useTypewriter(text: string, active: boolean, msPerChar = 14) {
  const [n, setN] = useState(active ? 0 : text.length);
  useEffect(() => {
    if (!active) { setN(text.length); return; }
    setN(0);
    const step = Math.max(1, Math.round(text.length / 140)); // long texts type in chunks
    const id = setInterval(() => setN((x) => {
      if (x >= text.length) { clearInterval(id); return x; }
      return Math.min(text.length, x + step);
    }), msPerChar * step);
    return () => clearInterval(id);
  }, [text, active, msPerChar]);
  return text.slice(0, n);
}

/** Flip to true `ms` after mount / after `key` changes (0 = immediately). */
export function useAfter(ms: number, key: unknown) {
  const [on, setOn] = useState(ms <= 0);
  useEffect(() => {
    if (ms <= 0) { setOn(true); return; }
    setOn(false);
    const t = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(t);
  }, [ms, key]);
  return on;
}

const HEX = "0123456789abcdef";
/** A hash that "computes": random hex settling left-to-right on the real value. */
export function useScramble(value: string, active: boolean, ms = 520) {
  const [out, setOut] = useState(active ? scramble(value, 0) : value);
  useEffect(() => {
    if (!active) { setOut(value); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      setOut(scramble(value, p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, active, ms]);
  return out;
}

function scramble(v: string, p: number) {
  const fixed = Math.floor(v.length * p);
  let s = v.slice(0, fixed);
  for (let i = fixed; i < v.length; i++) s += HEX[Math.floor(Math.random() * 16)];
  return s;
}
