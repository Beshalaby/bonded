"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/agents", label: "Agents" },
  { href: "/claims", label: "Claims" },
  { href: "/recorder", label: "Recorder" },
  { href: "/arena", label: "Arena" },
  { href: "/demo", label: "Demo" },
];

export default function Nav() {
  const path = usePathname() || "/";
  // The Arena store has its own look; still show nav there.
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#07090d]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-white">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-sky-500 text-[13px] font-black text-black shadow-[0_0_20px_rgba(16,185,129,0.35)]">B</span>
          <span>Bonded</span>
          <span className="hidden rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400 md:inline">agent insurance</span>
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 transition-colors ${
                  active ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                } ${l.href === "/demo" ? "ml-auto border border-emerald-500/30 text-emerald-300" : ""}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
