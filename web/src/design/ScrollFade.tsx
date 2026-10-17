"use client";
// Horizontal scroller whose edges fade out only when there is more content in that direction.
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cx } from "./primitives";

export function ScrollFade({
  children, className, innerClassName, fade = 40, style, label,
}: { children: ReactNode; className?: string; innerClassName?: string; fade?: number; style?: CSSProperties; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      // write CSS vars directly: no React re-render per scroll event
      el.style.setProperty("--fade-l", `${Math.min(fade, Math.max(0, el.scrollLeft))}px`);
      el.style.setProperty("--fade-r", `${Math.min(fade, Math.max(0, max - el.scrollLeft))}px`);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [fade]);
  return (
    <div ref={ref} className={cx("scroll-fade overflow-x-auto overscroll-x-contain", className)} style={style}
      role={label ? "region" : undefined} aria-label={label} tabIndex={label ? 0 : undefined}>
      <div className={innerClassName}>{children}</div>
    </div>
  );
}
