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
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/70 px-2">
        <div className="flex">
          {tabs.map((x, j) => (
            <button key={x.label} type="button" onClick={() => setI(j)}
              className={cx("-mb-px border-b-2 px-3 py-2 text-[12.5px]", j === i ? "border-zinc-900 font-medium text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800")}>
              {x.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 pr-1">
          <span className="font-mono text-[11.5px] text-zinc-400">{t.filename}</span>
          <button type="button" onClick={copy} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-zinc-600 hover:bg-zinc-100">
            {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="max-h-[440px] overflow-auto px-4 py-3 font-mono text-[12px] leading-[1.6] text-zinc-800"><code>{t.code}</code></pre>
      <div className="border-t border-zinc-100 bg-zinc-50/50 px-4 py-2 font-mono text-[12px] text-zinc-600"><span className="select-none text-zinc-400">$ </span>{t.run}</div>
    </div>
  );
}
