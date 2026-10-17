// In-process pub/sub for the live feed (consumed by /api/feed SSE).
import { EventEmitter } from "node:events";
import type { FeedEvent } from "./types";

const g = globalThis as unknown as { __bondedBus?: EventEmitter };
export const bus = g.__bondedBus ?? (g.__bondedBus = new EventEmitter().setMaxListeners(100));

export function publish(type: FeedEvent["type"], data: unknown) {
  const ev: FeedEvent = { type, ts: new Date().toISOString(), data };
  bus.emit("event", ev);
}
