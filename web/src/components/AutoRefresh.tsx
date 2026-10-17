"use client";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import type { FeedEvent } from "@/lib/types";
import { useFeed } from "./useFeed";

/** Re-renders the current server page (throttled) whenever relevant live events arrive. */
export default function AutoRefresh({ types = ["transaction", "claim", "risk", "bench"], ms = 800 }: { types?: FeedEvent["type"][]; ms?: number }) {
  const router = useRouter();
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useFeed(() => {
    if (t.current) return;
    t.current = setTimeout(() => { t.current = null; router.refresh(); }, ms);
  }, types);
  return null;
}

export function LiveDot({ label = "Live" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-emerald-300">
      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
      {label}
    </span>
  );
}
