"use client";
// Test your own agent: one command in a single-line pill, a copy button, and a door to the full setup page.
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, Copy } from "lucide-react";
import { copyText } from "@/components/connect/Code";
import { cx } from "@/design";

export default function ConnectStrip({ origin: initial }: { origin: string }) {
  const [origin, setOrigin] = useState(initial);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 1800); return () => clearTimeout(t); }, [copied]);
  const cmd = `claude mcp add --transport http bonded ${origin}/api/mcp`;

  return (
    <section aria-labelledby="connect-title" className="relative isolate overflow-x-clip px-5 py-24 text-center sm:py-36">
      <div aria-hidden className="burst burst-sky" style={{ ["--bx" as string]: "50%", ["--by" as string]: "62%", ["--bs" as string]: "min(1000px, 140vw)", ["--bo" as string]: 0.9 }} />
      <h2 id="connect-title" className="font-[600] leading-[0.98] tracking-[-0.05em] text-ink [font-size:clamp(40px,5.6vw,72px)]">Test your own agent.</h2>
      <p className="mt-4 text-[17px] text-ink-3">One command. It gets graded like the rest.</p>
      <div className="mx-auto mt-10 flex w-full max-w-[720px] items-center gap-2 rounded-full bg-surface py-2 pl-6 pr-2 shadow-float">
        <code className="scroll-fade min-w-0 flex-1 overflow-x-auto whitespace-nowrap py-2 text-left font-mono text-[13.5px] text-ink-2 sm:text-[14.5px]"
          style={{ ["--fade-r" as string]: "24px" }}>
          <span aria-hidden className="select-none text-ink-4">$ </span>{cmd}
        </code>
        <button type="button" onClick={async () => setCopied(await copyText(cmd))} aria-label={copied ? "Copied" : "Copy command"}
          className={cx("inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-300",
            copied ? "bg-pass-soft text-pass-ink" : "bg-ink text-white hover:bg-ink-2")}>
          {copied ? <Check size={17} aria-hidden /> : <Copy size={16} aria-hidden />}
        </button>
        <span role="status" className="sr-only">{copied ? "Copied to clipboard" : ""}</span>
      </div>
      <Link href="/connect" className="group mt-8 inline-flex items-center gap-1.5 text-[15px] font-medium text-ink-2 transition-colors hover:text-ink">
        More ways to connect
        <ArrowRight size={15} aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5" />
      </Link>
    </section>
  );
}
