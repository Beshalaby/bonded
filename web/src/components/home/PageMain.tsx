"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The home page is full-bleed (its hero runs under the transparent nav), so it owns its own layout.
 * Every other page gets the standard 1200px column, padded below the fixed 64px nav.
 */
export default function PageMain({ children }: { children: ReactNode }) {
  const path = usePathname() || "/";
  if (path === "/") return <main id="main" className="w-full flex-1 overflow-x-clip">{children}</main>;
  return <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-24 pt-24 sm:px-8 sm:pt-28">{children}</main>;
}
