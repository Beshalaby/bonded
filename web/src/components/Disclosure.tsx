"use client";
// One quiet disclosure: a centred text button with a + that turns into ×, and content that unfolds below.
// Content mounts on first open (so closed pages stay light) and opens itself when the URL hash targets it.
import { useEffect, useId, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { cx } from "@/design";

export default function Disclosure({ label, openLabel, id, children, className, align = "center" }: {
  label: string; openLabel?: string; id?: string; children: ReactNode; className?: string; align?: "center" | "left";
}) {
  const auto = useId();
  const panel = `${id ?? auto}-panel`;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { if (open) setMounted(true); }, [open]);
  useEffect(() => {
    if (!id) return;
    const check = () => { if (window.location.hash === `#${id}`) setOpen(true); };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [id]);

  return (
    <div id={id} className={cx("scroll-mt-24", className)}>
      <div className={cx("flex", align === "center" ? "justify-center" : "justify-start")}>
        <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((v) => !v)}
          className="group inline-flex items-center gap-2.5 rounded-full py-2 text-[15px] font-medium text-ink-2 transition-colors hover:text-ink">
          <span aria-hidden className={cx("inline-flex size-7 items-center justify-center rounded-full transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.2,0.75,0.15,1)]",
            open ? "rotate-45 bg-ink text-white" : "bg-surface text-ink-2 shadow-key group-hover:text-ink")}>
            <Plus size={14} strokeWidth={2} />
          </span>
          {open && openLabel ? openLabel : label}
        </button>
      </div>
      <div id={panel} role="region" aria-label={label} hidden={!open}
        className={cx("grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.2,0.75,0.15,1)]", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="min-w-0 overflow-hidden">{(open || mounted) && <div className="pt-12 sm:pt-16">{children}</div>}</div>
      </div>
    </div>
  );
}
