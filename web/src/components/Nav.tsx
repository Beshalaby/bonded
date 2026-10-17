"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Menu, Plus, X } from "lucide-react";
import { Mark, SPRING } from "@/design";
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

// The full pill needs ~1130px; below that the drawer takes over. Keep DRAWER_MQ and the max-[1179px]/min-[1180px] classes in sync.
const DRAWER_MQ = "(min-width: 1180px)";

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-2 text-[15px] font-[600] tracking-[-0.025em] text-ink max-[1179px]:min-h-10">
      <Mark size={26} />
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
    <div className="fixed inset-0 z-50 min-[1180px]:hidden">
      <motion.div className="absolute inset-0 bg-[oklch(19%_0.006_275/0.12)] backdrop-blur-[2px]" onClick={onClose} aria-hidden
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} />
      <motion.div ref={panel} id="site-nav-drawer" role="dialog" aria-modal="true" aria-label="Site navigation"
        initial={{ opacity: 0, x: 24, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={SPRING.soft}
        className="absolute bottom-2 right-2 top-2 flex w-[min(340px,calc(100vw-72px))] flex-col overflow-hidden rounded-tile bg-surface shadow-float">
        <div className="flex h-16 shrink-0 items-center justify-between pl-5 pr-3">
          <span className="micro">Menu</span>
          <button type="button" onClick={onClose} aria-label="Close menu"
            className="inline-flex size-10 items-center justify-center rounded-full text-ink-2 shadow-key transition-shadow hover:shadow-raised hover:text-ink">
            <X size={17} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-2" aria-label="Primary">
          {LINKS.map((l) => {
            const active = l.match(path);
            return (
              <Link key={l.href} href={l.href} onClick={onClose} aria-current={active ? "page" : undefined}
                className={cx("flex h-12 items-center rounded-[16px] px-4 text-[16px] tracking-[-0.01em] transition-colors",
                  active ? "bg-canvas font-medium text-ink" : "text-ink-2 hover:bg-canvas/70 hover:text-ink")}>
                {active && <span className="mr-2.5 size-1.5 rounded-full bg-accent" aria-hidden />}
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="grid shrink-0 gap-2 p-3">
          <AdminBadge className="justify-center" />
          <Link href="/connect" onClick={onClose} aria-current={path.startsWith("/connect") ? "page" : undefined}
            className="inline-flex h-12 items-center justify-center rounded-full bg-surface px-4 text-[14.5px] font-medium text-ink shadow-key transition-shadow hover:shadow-raised">
            Connect agent
          </Link>
          <Link href="/runs/new" onClick={onClose} aria-current={path === "/runs/new" ? "page" : undefined}
            className="inline-flex h-12 items-center justify-center gap-1.5 rounded-full bg-ink px-4 text-[14.5px] font-medium text-white shadow-ink">
            <Plus size={15} strokeWidth={2.25} /> New run
          </Link>
        </div>
      </motion.div>
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
    const mq = window.matchMedia(DRAWER_MQ);
    const on = () => { if (mq.matches) setOpen(false); };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const activeLabel = (LINKS.find((l) => l.match(path))?.label) ?? (path.startsWith("/connect") ? "Connect agent" : path === "/runs/new" ? "New run" : "");
  return (
    <>
    <header className="sticky top-3 z-30 px-3 sm:top-4 sm:px-6">
      <div className="mx-auto flex h-[52px] w-full max-w-[1200px] items-center gap-1 rounded-full bg-glass pl-2 pr-2 shadow-float backdrop-blur-xl backdrop-saturate-150 min-[1180px]:w-fit min-[1180px]:max-w-none">
        <Logo />
        <nav className="hidden items-center min-[1180px]:flex" aria-label="Primary">
          {LINKS.map((l) => {
            const active = l.match(path);
            return (
              <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}
                className={cx("relative isolate whitespace-nowrap rounded-full px-3 py-[7px] text-[13.5px] tracking-[-0.005em] transition-colors",
                  active ? "font-medium text-ink" : "text-ink-3 hover:text-ink")}>
                {active && <motion.span layoutId="nav-active" transition={SPRING.snappy} aria-hidden className="absolute inset-0 -z-10 rounded-full bg-surface shadow-key" />}
                {l.label}
              </Link>
            );
          })}
        </nav>
        <span className="mx-1.5 hidden h-5 w-px bg-divider min-[1180px]:block" aria-hidden />
        <AdminBadge className="max-[1179px]:hidden" />
        <Link href="/connect"
          className={cx("hidden h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium transition-[box-shadow,color] min-[1180px]:inline-flex",
            path.startsWith("/connect") ? "bg-surface text-ink shadow-key" : "text-ink-2 hover:text-ink")}>
          Connect agent
        </Link>
        <Link href="/runs/new"
          className="ml-0.5 hidden h-9 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-medium text-white shadow-ink transition-transform active:scale-[0.97] min-[1180px]:inline-flex">
          <Plus size={14} strokeWidth={2.25} /> New run
        </Link>
        <div className="ml-auto flex items-center gap-2 min-[1180px]:hidden">
          <span className="truncate text-[13px] text-ink-3 max-[379px]:hidden">{activeLabel}</span>
          <button ref={toggle} type="button" onClick={() => setOpen((o) => !o)}
            aria-expanded={open} aria-controls="site-nav-drawer" aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex size-10 items-center justify-center rounded-full bg-surface text-ink shadow-key transition-shadow hover:shadow-raised">
            <Menu size={18} />
          </button>
        </div>
      </div>
    </header>
    <NavDrawer open={open} onClose={close} path={path} returnFocus={toggle} />
    </>
  );
}
