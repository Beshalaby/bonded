"use client";
// Sticky table of contents with scroll-spy.
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "@/components/ui";

/** `variant="dropdown"`: a sticky collapsible bar for narrow screens, showing the current section. */
export default function Toc({ items, variant = "list" }: { items: { id: string; label: string; n: string }[]; variant?: "list" | "dropdown" }) {
  const [active, setActive] = useState(items[0]?.id);
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const onScroll = () => {
      const y = window.scrollY + 120;
      let cur = els[0]?.id;
      for (const e of els) if (e.offsetTop <= y) cur = e.id;
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) cur = els[els.length - 1]?.id;
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [items]);
  if (variant === "dropdown") {
    const cur = items.find((i) => i.id === active);
    return (
      <details ref={details} className="group sticky top-14 z-20 -mx-4 border-b border-zinc-200 bg-white/95 backdrop-blur-sm sm:-mx-8">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-[13px] sm:px-8 [&::-webkit-details-marker]:hidden">
          <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-zinc-400">Contents</span>
          <span className="min-w-0 flex-1 truncate text-zinc-800">{cur ? <><span className="mr-1.5 text-zinc-400 tnum">{cur.n}</span>{cur.label}</> : null}</span>
          <ChevronDown size={16} className="shrink-0 text-zinc-500 transition-transform group-open:rotate-180" />
        </summary>
        <nav aria-label="Contents" className="max-h-[60vh] overflow-y-auto border-t border-zinc-100 px-2 pb-2 pt-1 sm:px-6">
          <ol>
            {items.map((i) => (
              <li key={i.id}>
                <a href={`#${i.id}`} onClick={() => details.current?.removeAttribute("open")}
                  aria-current={active === i.id ? "location" : undefined}
                  className={cx("flex min-h-10 items-center gap-2 rounded-md px-2 text-[14px]",
                    active === i.id ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-600 hover:bg-zinc-50")}>
                  <span className="w-6 shrink-0 text-zinc-400 tnum">{i.n}</span>{i.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </details>
    );
  }
  return (
    <nav aria-label="Contents" className="text-[13px]">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">Contents</div>
      <ol className="space-y-0.5 border-l border-zinc-200">
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`}
              className={cx("-ml-px flex gap-2 border-l py-1 pl-3 transition-colors",
                active === i.id ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800")}>
              <span className="w-5 shrink-0 text-zinc-400 tnum">{i.n}</span>{i.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
