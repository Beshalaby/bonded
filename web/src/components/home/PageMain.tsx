"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The home page and Penny's page are full-bleed (their heroes are edge-to-edge panels under the floating nav), so they
 * own their layout. Every other page gets the standard 1200px column, padded below the fixed nav.
 */
export default function PageMain({ children }: { children: ReactNode }) {
  const path = usePathname() || "/";
  if (path.startsWith("/penny/shop")) return <main id="main" className="h-dvh w-full overflow-hidden">{children}</main>;
  if (path === "/" || path === "/penny") return <main id="main" className="w-full flex-1 overflow-x-clip">{children}</main>;
  return <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-24 pt-24 sm:px-8 sm:pt-28">{children}</main>;
}
