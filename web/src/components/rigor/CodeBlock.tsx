"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cx } from "@/components/ui";

/** Tabbed, copyable code listing. */
export default function CodeBlock({ tabs }: { tabs: { label: string; filename: string; code: string; run: string }[] }) {
  const [i, setI] = useState(0);
  const [copied, setCopied] = useState(false);
  const t = tabs[i];
  const copy = async () => {
    try { await navigator.clipboard.writeText(t.code); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {}
  };
  return (
    <div className="overflow-hidden rounded-lg border border-divider bg-white">
      <div className="flex items-center justify-between border-b border-divider bg-ivory/70 px-2">
        <div className="flex min-w-0 overflow-x-auto">
          {tabs.map((x, j) => (
            <button key={x.label} type="button" onClick={() => setI(j)}
              className={cx("-mb-px shrink-0 border-b-2 px-3 py-2 text-[12.5px] max-lg:min-h-10", j === i ? "border-ink font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
              {x.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 pr-1">
          <span className="font-mono text-[11.5px] text-ink-4 max-sm:hidden">{t.filename}</span>
          <button type="button" onClick={copy} className="inline-flex h-7 max-lg:h-10 items-center gap-1 rounded-md px-2 text-[12px] text-ink-2 hover:bg-canvas-sunk">
            {copied ? <Check size={13} className="text-pass-ink" /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="max-h-[440px] overflow-auto px-4 py-3 font-mono text-[12px] leading-[1.6] text-ink"><code>{t.code}</code></pre>
      <div className="border-t border-divider max-sm:overflow-x-auto max-sm:whitespace-nowrap bg-ivory/50 px-4 py-2 font-mono text-[12px] text-ink-2"><span className="select-none text-ink-4">$ </span>{t.run}</div>
    </div>
  );
}
