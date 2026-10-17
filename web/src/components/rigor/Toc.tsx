"use client";
// Sticky table of contents with scroll-spy.
import { useEffect, useState } from "react";
import { cx } from "@/components/ui";

export default function Toc({ items }: { items: { id: string; label: string; n: string }[] }) {
  const [active, setActive] = useState(items[0]?.id);
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
