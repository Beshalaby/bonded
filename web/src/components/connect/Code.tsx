"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { cx } from "@/components/ui";

/** Clipboard write with a fallback for non-secure origins (e.g. a LAN IP during a demo). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({ text, label = "Copy", className, compact }: { text: string; label?: string; className?: string; compact?: boolean }) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  const onClick = async () => {
    const ok = await copyText(text);
    setState(ok ? "ok" : "err");
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setState("idle"), 1600);
  };
  return (
    <button type="button" onClick={onClick} aria-label={state === "ok" ? "Copied" : label}
      className={cx(
        "inline-flex h-7 max-lg:h-10 shrink-0 items-center gap-1.5 rounded-md text-[12px] font-medium transition-colors",
        compact ? "w-7 max-lg:w-10 justify-center" : "px-2",
        state === "ok" ? "text-pass-ink" : state === "err" ? "text-coral-ink" : "text-ink-3 hover:bg-ink-5/60 hover:text-ink",
        className,
      )}>
      {state === "ok" ? <Check size={13} strokeWidth={2.25} /> : <Copy size={13} />}
      {!compact && <span>{state === "ok" ? "Copied" : state === "err" ? "Press ⌘C" : label}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ tiny highlighters */

type Lang = "shell" | "json" | "text";

function hlShell(src: string): ReactNode[] {
  const out: ReactNode[] = [];
  let k = 0;
  for (const line of src.split("\n")) {
    if (out.length) out.push("\n");
    if (/^\s*#/.test(line)) { out.push(<span key={k++} className="text-ink-4">{line}</span>); continue; }
    const re = /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|https?:\/\/[^\s'"]+|\s--?[a-zA-Z][\w-]*|\\$|^\s*[a-z][\w-]*)/g;
    let last = 0, m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      if (m.index > last) out.push(line.slice(last, m.index));
      const t = m[0];
      const cls = t.startsWith("'") || t.startsWith('"') ? "text-pass-ink"
        : t.startsWith("http") ? "text-accent"
        : /^\s*--?/.test(t) ? "text-ink-3"
        : t === "\\" ? "text-ink-4"
        : "font-medium text-ink";
      out.push(<span key={k++} className={cls}>{t}</span>);
      last = m.index + t.length;
    }
    if (last < line.length) out.push(line.slice(last));
  }
  return out;
}

function hlJson(src: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)|([{}[\],])/g;
  let last = 0, k = 0, m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    if (m[1]) {
      if (m[2]) out.push(<span key={k++} className="text-ink">{m[1]}</span>, <span key={k++} className="text-ink-4">{m[2]}</span>);
      else out.push(<span key={k++} className={/^"https?:/.test(m[1]) ? "text-accent" : "text-pass-ink"}>{m[1]}</span>);
    } else if (m[3]) out.push(<span key={k++} className="text-amber-ink">{m[3]}</span>);
    else if (m[4]) out.push(<span key={k++} className="text-amber-ink">{m[4]}</span>);
    else out.push(<span key={k++} className="text-ink-4">{m[5]}</span>);
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

export function CodeBlock({
  code, lang = "text", title, aside, className, copyLabel, wrap,
}: { code: string; lang?: Lang; title?: ReactNode; aside?: ReactNode; className?: string; copyLabel?: string; wrap?: boolean }) {
  const body = lang === "shell" ? hlShell(code) : lang === "json" ? hlJson(code) : code;
  return (
    <div className={cx("group overflow-hidden rounded-[20px] bg-ivory shadow-well", className)}>
      {(title || aside) ? (
        <div className="flex h-10 max-lg:h-11 items-center justify-between gap-3 pl-4 pr-2 pt-1">
          <div className="min-w-0 truncate text-[12px] text-ink-3">{title}</div>
          <div className="flex items-center gap-1">{aside}<CopyButton text={code} label={copyLabel} /></div>
        </div>
      ) : null}
      <div className="relative">
        <pre className={cx(
          "overflow-x-auto px-4 py-3.5 font-mono text-[12.5px] leading-[1.7] text-ink-2",
          wrap && "whitespace-pre-wrap break-words",
          !(title || aside) && "pr-12 max-lg:pr-14",
        )}><code>{body}</code></pre>
        {!(title || aside) && <CopyButton text={code} compact className="absolute right-2 top-2.5 bg-ivory/80 max-lg:right-1 max-lg:top-1" />}
      </div>
    </div>
  );
}

/** A single copyable value on one line (endpoint URLs, ids). */
export function CopyField({ value, className, size = "md" }: { value: string; className?: string; size?: "md" | "lg" }) {
  return (
    <div className={cx("flex min-w-0 items-center gap-2 rounded-full bg-surface pl-4 pr-1.5 shadow-key", size === "lg" ? "h-10" : "h-8", className)}>
      <span className={cx("min-w-0 flex-1 truncate font-mono text-ink", size === "lg" ? "text-[14px]" : "text-[12.5px]")}>{value}</span>
      <CopyButton text={value} />
    </div>
  );
}
