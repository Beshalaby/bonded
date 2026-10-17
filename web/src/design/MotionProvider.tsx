"use client";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** Mounted once in the root layout: every `motion` animation honours prefers-reduced-motion. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
