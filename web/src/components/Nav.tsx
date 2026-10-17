"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Plus, X } from "lucide-react";
import { cx } from "./ui";
import AdminBadge from "./auth/AdminBadge";

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
    <Link href="/" className="flex shrink-0 items-center gap-2 max-lg:min-h-10 text-[15px] font-semibold tracking-[-0.02em] text-zinc-900">
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

function NavDrawer({ open, onClose, path, returnFocus }: { open: boolean; onClose: () => void; path: string; returnFocus: React.RefObject<HTMLButtonElement | null> }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () => Array.from(panel.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []);
    (focusables().find((el) => el.getAttribute("aria-current") === "page") ?? focusables()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const els = focusables();
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!panel.current?.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const btn = returnFocus.current;
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; btn?.focus(); };
  }, [open, onClose, returnFocus]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 min-[900px]:hidden">
      <div className="absolute inset-0 bg-zinc-900/20 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div ref={panel} id="site-nav-drawer" role="dialog" aria-modal="true" aria-label="Site navigation"
        className="absolute inset-y-0 right-0 flex w-[min(320px,calc(100vw-128px))] flex-col border-l border-zinc-200 bg-white shadow-xl">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 px-4">
          <span className="text-[13px] font-medium text-zinc-500">Menu</span>
          <button type="button" onClick={onClose} aria-label="Close menu"
            className="-mr-2 inline-flex size-10 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Primary">
          {LINKS.map((l) => {
            const active = l.match(path);
            return (
              <Link key={l.href} href={l.href} onClick={onClose} aria-current={active ? "page" : undefined}
                className={cx("flex h-11 items-center rounded-md px-3 text-[15px] transition-colors",
                  active ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900")}>
                {active && <span className="-ml-1 mr-2 h-4 w-0.5 rounded-full bg-accent" aria-hidden />}
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="grid shrink-0 gap-2 border-t border-zinc-200 p-4">
          <AdminBadge className="justify-center" />
          <Link href="/connect" onClick={onClose} aria-current={path.startsWith("/connect") ? "page" : undefined}
            className={cx("inline-flex h-11 items-center justify-center rounded-md border border-zinc-200 px-3 text-[14px] font-medium transition-colors hover:bg-zinc-50",
              path.startsWith("/connect") ? "bg-zinc-50 text-zinc-900" : "text-zinc-700")}>
            Connect agent
          </Link>
          <Link href="/runs/new" onClick={onClose} aria-current={path === "/runs/new" ? "page" : undefined}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-md bg-accent px-3 text-[14px] font-medium text-white transition-colors hover:bg-accent-hover">
            <Plus size={15} strokeWidth={2.25} /> New run
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Nav() {
  const path = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  // close on navigation and when the viewport grows past the drawer breakpoint
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const on = () => { if (mq.matches) setOpen(false); };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return (
    <>
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-sm supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-4 px-4 sm:px-8">
        <Logo />
        <nav className="-mx-1 hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto min-[900px]:flex">
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
        <AdminBadge className="max-[899px]:hidden" />
        <Link href="/connect"
          className={cx("hidden h-8 shrink-0 items-center rounded-md border border-zinc-200 px-3 text-[13px] font-medium transition-colors hover:bg-zinc-50 min-[900px]:inline-flex",
            path.startsWith("/connect") ? "text-zinc-900 bg-zinc-50" : "text-zinc-700")}>
          Connect agent
        </Link>
        <Link href="/runs/new"
          className="hidden h-8 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover min-[900px]:inline-flex">
          <Plus size={14} strokeWidth={2.25} /> New run
        </Link>
        <div className="ml-auto flex items-center gap-1 min-[900px]:hidden">
          <span className="truncate text-[13px] text-zinc-500 max-[379px]:hidden">{(LINKS.find((l) => l.match(path))?.label) ?? (path.startsWith("/connect") ? "Connect agent" : path === "/runs/new" ? "New run" : "")}</span>
          <button ref={toggle} type="button" onClick={() => setOpen((o) => !o)}
            aria-expanded={open} aria-controls="site-nav-drawer" aria-label={open ? "Close menu" : "Open menu"}
            className="-mr-2 inline-flex size-10 items-center justify-center rounded-md text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900">
            <Menu size={20} />
          </button>
        </div>
      </div>
    </header>
    <NavDrawer open={open} onClose={close} path={path} returnFocus={toggle} />
    </>
  );
}
