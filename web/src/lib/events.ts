// In-process pub/sub for the live feed (consumed by /api/events SSE).
import { EventEmitter } from "node:events";
import type { FeedEvent } from "./types";

const g = globalThis as unknown as { __sbBus?: EventEmitter };
export const bus = g.__sbBus ?? (g.__sbBus = new EventEmitter().setMaxListeners(100));

export function publish(type: FeedEvent["type"], data: unknown) {
  const ev: FeedEvent = { type, ts: new Date().toISOString(), data };
  bus.emit("event", ev);
}
