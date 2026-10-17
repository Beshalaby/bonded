"use client";
import { useEffect, useState } from "react";

/**
 * Odometer-style number: every digit is a column of 0–9 that rolls to its value. Columns are keyed from the
 * right, so a value going 999 → 1,000 rolls the existing digits and slides in the new one instead of re-rendering.
 * On mount it rolls up from zero once.
 */
export function RollingNumber({
  value, format = (v) => Math.round(v).toLocaleString("en-US"), className, duration = 900,
}: { value: number; format?: (v: number) => string; className?: string; duration?: number }) {
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    // first paint at 0, then roll to the real value
    // a timer, not rAF: rAF never fires in a background tab, which would leave the counter at zero
    const id = setTimeout(() => setShown(value), 40);
    return () => clearTimeout(id);
  }, [value]);
  const target = format(value);
  const text = shown == null ? target.replace(/\d/g, "0") : format(shown);
  const chars = text.split("");
  return (
    <span className={["inline-flex align-top", className].filter(Boolean).join(" ")} aria-label={target} role="img">
      <span aria-hidden className="inline-flex items-start tnum" style={{ lineHeight: 1 }}>
        {chars.map((c, i) => {
          const key = chars.length - i; // position from the right
          if (!/\d/.test(c)) return <span key={`s${key}`} className="inline-block" style={{ height: "1em", lineHeight: 1 }}>{c}</span>;
          const d = Number(c);
          return (
            <span key={`d${key}`} className="relative inline-block overflow-hidden" style={{ height: "1em", width: "0.62em" }}>
              <span className="absolute inset-x-0 top-0 flex flex-col items-center"
                style={{ transform: `translateY(${-d}em)`, transition: `transform ${duration}ms cubic-bezier(0.2, 0.75, 0.15, 1)`, transitionDelay: `${Math.min(6, key) * 35}ms` }}>
                {DIGITS.map((n) => <span key={n} style={{ height: "1em", lineHeight: 1 }}>{n}</span>)}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
