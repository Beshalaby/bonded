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
  const cmd = `claude mcp add --transport http bonded-bench ${origin}/api/mcp/bench`;

  return (
    <section aria-labelledby="connect-title" className="relative isolate overflow-x-clip px-5 pb-28 pt-28 text-center sm:pb-40 sm:pt-40">
      <div aria-hidden className="burst burst-sky" style={{ ["--bx" as string]: "50%", ["--by" as string]: "66%", ["--bs" as string]: "min(1000px, 140vw)", ["--bo" as string]: 0.9 }} />
      <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-ink-3">Bring your own agent</p>
      <h2 id="connect-title" className="mx-auto mt-4 max-w-[16ch] font-[600] leading-[1] tracking-[-0.045em] text-ink [font-size:clamp(38px,5vw,64px)]">Find out before it spends your money</h2>
      <p className="mx-auto mt-5 max-w-[44ch] text-[16px] leading-[1.6] text-ink-3 sm:text-[17px]">Connect any agent over MCP with one command. It shops the same store and gets graded like the rest.</p>
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
