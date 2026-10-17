"use client";
import { useEffect, useRef, useState } from "react";
import type { FeedEvent } from "@/lib/types";

/** Subscribe to the /api/feed SSE stream. Reconnects automatically (EventSource retry). */
export function useFeed(onEvent: (ev: FeedEvent) => void, types?: FeedEvent["type"][]) {
  const cb = useRef(onEvent);
  cb.current = onEvent;
  const [connected, setConnected] = useState(false);
  const key = types?.join(",") ?? "";
  useEffect(() => {
    const es = new EventSource(`/api/feed${key ? `?types=${key}` : ""}`);
    const handler = (m: MessageEvent) => {
      try { cb.current(JSON.parse(m.data) as FeedEvent); } catch {}
    };
    const all: FeedEvent["type"][] = ["log", "transaction", "claim", "risk", "bench", "product"];
    for (const t of all) es.addEventListener(t, handler as EventListener);
    es.addEventListener("hello", () => setConnected(true));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [key]);
  return connected;
}
