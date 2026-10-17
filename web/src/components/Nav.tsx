"use client";
// Minimal site nav: logo, three links (Ranking, Watch, Connect) and a quiet "Lab" that opens a sheet with every
// power tool. Transparent over the home hero; frosted white once the page scrolls (and always off the home page).
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Menu, Plus, X } from "lucide-react";
import { Mark, SPRING } from "@/design";
import { LAB_LINKS, NEW_RUN, PRIMARY_LINKS, isLabPath } from "@/lib/ui/lab";
import { cx } from "./ui";
import AdminBadge from "./auth/AdminBadge";

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-full py-1 pr-2 text-[16px] font-[620] tracking-[-0.03em] text-ink">
      <Mark size={26} />
      Bonded
    </Link>
  );
}

function LabSheet({ open, onClose, path, returnFocus }: { open: boolean; onClose: () => void; path: string; returnFocus: React.RefObject<HTMLButtonElement | null> }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const mobile = window.matchMedia("(max-width: 767.98px)").matches;
    const prevOverflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
    const focusables = () => Array.from(panel.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [])
      .filter((el) => el.offsetParent !== null);
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

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-[oklch(20%_0.012_70/0.10)] backdrop-blur-[3px]" onClick={onClose} aria-hidden
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          <motion.div ref={panel} id="lab-sheet" role="dialog" aria-modal="true" aria-labelledby="lab-sheet-title"
            initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.985 }}
            transition={SPRING.soft}
            className="absolute inset-x-3 top-3 isolate flex max-h-[calc(100svh-24px)] origin-top flex-col overflow-hidden rounded-[30px] bg-surface shadow-float
              md:left-auto md:right-[max(16px,calc((100vw-1200px)/2+20px))] md:top-[70px] md:w-[560px] md:origin-top-right">
            <div aria-hidden className="burst burst-gold" style={{ ["--bx" as string]: "92%", ["--by" as string]: "0%", ["--bs" as string]: "460px" }} />
            <div aria-hidden className="burst burst-sage" style={{ ["--bx" as string]: "0%", ["--by" as string]: "100%", ["--bs" as string]: "420px", ["--bo" as string]: 0.7 }} />
            <div className="flex shrink-0 items-start justify-between gap-4 px-6 pb-2 pt-5">
              <div>
                <h2 id="lab-sheet-title" className="text-[22px] font-[600] tracking-[-0.03em] text-ink">The Lab</h2>
                <p className="mt-0.5 text-[13.5px] text-ink-3">Everything that runs behind the scenes.</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close"
                className="-mr-2 inline-flex size-10 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-canvas-sunk hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {/* primary links live here on phones (the bar only has the logo + this sheet) */}
              <nav aria-label="Primary" className="mb-2 grid gap-0.5 border-b border-divider px-3 pb-3 md:hidden">
                {PRIMARY_LINKS.map((l) => (
                  <Link key={l.href} href={l.href} onClick={onClose} aria-current={l.match(path) ? "page" : undefined}
                    className="flex h-12 items-center text-[24px] font-[560] tracking-[-0.03em] text-ink">{l.label}</Link>
                ))}
              </nav>
              <ul className="grid gap-0.5 md:grid-cols-2" aria-label="Lab">
                {LAB_LINKS.map((l) => {
                  const active = l.match(path);
                  return (
                    <li key={l.href}>
                      <Link href={l.href} onClick={onClose} aria-current={active ? "page" : undefined}
                        className={cx("group block rounded-[18px] px-3 py-2.5 transition-colors hover:bg-ivory", active && "bg-ivory")}>
                        <span className="flex items-center gap-2 text-[15px] font-medium tracking-[-0.01em] text-ink">
                          {active && <span aria-hidden className="size-1.5 rounded-full bg-gold" />}
                          {l.label}
                          <ArrowUpRight aria-hidden size={14} className="text-ink-4 opacity-0 transition-opacity group-hover:opacity-100" />
                        </span>
                        <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{l.blurb}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-5 pt-1">
              <AdminBadge />
              <Link href={NEW_RUN.href} onClick={onClose} aria-current={path === NEW_RUN.href ? "page" : undefined}
                className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-full bg-ink px-5 text-[14px] font-medium text-white shadow-ink transition-transform active:scale-[0.97]">
                <Plus size={15} strokeWidth={2.25} /> {NEW_RUN.label}
              </Link>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default function Nav() {
  const path = usePathname() || "/";
  const home = path === "/";
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const deskBtn = useRef<HTMLButtonElement>(null);
  const mobileBtn = useRef<HTMLButtonElement>(null);
  const lastBtn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const openFrom = (btn: HTMLButtonElement | null) => { lastBtn.current = btn; setOpen((o) => !o); };

  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const frosted = !home || scrolled;
  const inLab = isLabPath(path);
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40">
        {/* frosted layer fades in (opacity only) instead of re-painting the header */}
        <div aria-hidden className={cx("absolute inset-0 bg-[oklch(100%_0_0/0.74)] shadow-[0_1px_0_oklch(20%_0.012_70/0.06)] backdrop-blur-xl backdrop-saturate-150 transition-opacity duration-300",
          frosted ? "opacity-100" : "opacity-0")} />
        <div className="relative mx-auto flex h-16 max-w-[1200px] items-center gap-2 px-4 sm:px-8">
          <Logo />
          <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Primary">
            {PRIMARY_LINKS.map((l) => (
              <Link key={l.href} href={l.href} aria-current={l.match(path) ? "page" : undefined}
                className={cx("rounded-full px-3.5 py-2 text-[14px] tracking-[-0.01em] transition-colors",
                  l.match(path) ? "font-medium text-ink" : "text-ink-2 hover:text-ink")}>
                {l.label}
              </Link>
            ))}
            <span aria-hidden className="mx-2 h-4 w-px bg-ink-5" />
            <button ref={deskBtn} type="button" onClick={() => openFrom(deskBtn.current)}
              aria-expanded={open} aria-controls="lab-sheet" aria-haspopup="dialog"
              className={cx("inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[14px] tracking-[-0.01em] transition-colors",
                inLab || open ? "font-medium text-ink" : "text-ink-3 hover:text-ink")}>
              <span aria-hidden className={cx("size-1.5 rounded-full transition-colors", inLab || open ? "bg-gold" : "bg-ink-4")} />
              Lab
            </button>
            <AdminBadge className="ml-2" />
          </nav>
          <button ref={mobileBtn} type="button" onClick={() => openFrom(mobileBtn.current)}
            aria-expanded={open} aria-controls="lab-sheet" aria-haspopup="dialog" aria-label={open ? "Close menu" : "Open menu"}
            className="ml-auto inline-flex size-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/5 md:hidden">
            <Menu size={20} />
          </button>
        </div>
      </header>
      <LabSheet open={open} onClose={close} path={path} returnFocus={lastBtn} />
    </>
  );
}
