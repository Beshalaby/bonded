"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cx } from "./ui";

const LINKS = [
  { href: "/", label: "Leaderboard", match: (p: string) => p === "/" || p.startsWith("/models") },
  { href: "/live", label: "Live", match: (p: string) => p.startsWith("/live") },
  { href: "/runs", label: "Runs", match: (p: string) => p.startsWith("/runs") && p !== "/runs/new" },
  { href: "/tasks", label: "Tasks", match: (p: string) => p.startsWith("/tasks") },
  { href: "/traces", label: "Traces", match: (p: string) => p.startsWith("/traces") },
  { href: "/redteam", label: "Red team", match: (p: string) => p.startsWith("/redteam") },
  { href: "/guardrail", label: "Guardrail", match: (p: string) => p.startsWith("/guardrail") },
  { href: "/compare", label: "Compare", match: (p: string) => p.startsWith("/compare") },
  { href: "/arena", label: "Arena", match: (p: string) => p.startsWith("/arena") },
  { href: "/methodology", label: "Methodology", match: (p: string) => p.startsWith("/methodology") },
];

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 text-[15px] font-semibold tracking-[-0.02em] text-zinc-900">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
        <rect width="20" height="20" rx="5" fill="var(--color-accent)" />
        <rect x="5" y="10" width="2.4" height="5" rx="1" fill="white" />
        <rect x="8.8" y="7" width="2.4" height="8" rx="1" fill="white" />
        <rect x="12.6" y="4.5" width="2.4" height="10.5" rx="1" fill="white" opacity="0.6" />
      </svg>
      Bonded
    </Link>
  );
}

export default function Nav() {
  const path = usePathname() || "/";
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-sm supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-4 px-5 sm:px-8">
        <Logo />
        <nav className="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {LINKS.map((l) => {
            const active = l.match(path);
            return (
              <Link key={l.href} href={l.href}
                className={cx(
                  "whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors",
                  active ? "font-medium text-zinc-900 bg-zinc-100" : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50",
                )}>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/connect"
          className={cx("inline-flex h-8 shrink-0 items-center rounded-md border border-zinc-200 px-3 text-[13px] font-medium transition-colors hover:bg-zinc-50",
            path.startsWith("/connect") ? "text-zinc-900 bg-zinc-50" : "text-zinc-700")}>
          Connect agent
        </Link>
        <Link href="/runs/new"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover">
          <Plus size={14} strokeWidth={2.25} /> New run
        </Link>
      </div>
    </header>
  );
}
