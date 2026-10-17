"use client";
import { useEffect, useRef, useState } from "react";
import type { FeedEvent } from "@/lib/types";

/**
 * Subscribe to the SSE feed at /api/events. `types` filters which events reach the handler.
 * Returns connection state so pages can show a "Live" indicator.
 */
export function useEvents(types: FeedEvent["type"][], onEvent: (e: FeedEvent) => void, enabled = true) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const key = types.join(",");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const wanted = new Set(key.split(","));
    const es = new EventSource("/api/events");
    const deliver = (raw: string, fallbackType?: string) => {
      try {
        const parsed = JSON.parse(raw);
        const ev: FeedEvent = parsed && typeof parsed === "object" && "type" in parsed && "data" in parsed
          ? parsed
          : { type: fallbackType as FeedEvent["type"], ts: new Date().toISOString(), data: parsed };
        if (wanted.has(ev.type)) handler.current(ev);
      } catch { /* ignore malformed */ }
    };
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => deliver(m.data);
    // Also support named SSE events (event: run / result / scam ...)
    const named = ["run", "result", "scam", "log", "transaction", "product"];
    const listeners = named.map((t) => {
      const fn = (m: MessageEvent) => deliver(m.data, t);
      es.addEventListener(t, fn as EventListener);
      return [t, fn] as const;
    });
    return () => {
      listeners.forEach(([t, fn]) => es.removeEventListener(t, fn as EventListener));
      es.close();
      setConnected(false);
    };
  }, [key, enabled]);

  return connected;
}
