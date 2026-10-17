"use client";
// Independent, in-browser verification of a trace's hash chain.
// Fetches the raw entries, re-derives canonical JSON locally and recomputes every SHA-256 link with WebCrypto.
// "Edit history" lets you alter any field locally (nothing is sent anywhere) and watch the chain break.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, FlaskConical, Pencil, Play, RotateCcw, Stamp, X } from "lucide-react";
import { GENESIS, canonical, checkLink, type LinkCheck } from "@/components/rigor/chain";
import { Badge, Card, cx } from "@/components/ui";
import type { LogEntry } from "@/lib/types";

type Row = { state: "pending" | "checking" | "ok" | "content" | "link" | "downstream"; check?: LinkCheck };
type Leaf = { path: (string | number)[]; value: unknown };

const STEP_MS = 110;
const short = (h?: string, n = 10) => (h ? (h === GENESIS ? GENESIS : h.slice(0, n)) : "—");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function leaves(v: unknown, path: (string | number)[] = []): Leaf[] {
  if (v !== null && typeof v === "object") {
    const ents = Array.isArray(v) ? v.map((x, i) => [i, x] as const) : Object.entries(v as Record<string, unknown>);
    return ents.flatMap(([k, x]) => leaves(x, [...path, k]));
  }
  return [{ path, value: v }];
}
function setAt<T>(root: T, path: (string | number)[], value: unknown): T {
  const out = structuredClone(root) as unknown as Record<string | number, unknown>;
  let cur = out;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]] as Record<string | number, unknown>;
  cur[path[path.length - 1]] = value;
  return out as unknown as T;
}
function coerce(raw: string, like: unknown): unknown {
  if (typeof like === "number") { const n = Number(raw); return raw.trim() !== "" && Number.isFinite(n) ? n : raw; }
  if (typeof like === "boolean") return raw === "true" ? true : raw === "false" ? false : raw;
  if (like === null && raw === "null") return null;
  return raw;
}
const pathLabel = (p: (string | number)[]) => p.map((k, i) => (typeof k === "number" ? `[${k}]` : i ? `.${k}` : k)).join("");

export default function VerifyPanel({ sessionId }: { sessionId: string }) {
  const [original, setOriginal] = useState<LogEntry[] | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [edited, setEdited] = useState<Set<number>>(new Set());
  const [elapsed, setElapsed] = useState<number | null>(null);
  const token = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/traces/${encodeURIComponent(sessionId)}/raw`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${r.statusText}`))))
      .then((d: { entries: LogEntry[] }) => {
        if (!live) return;
        const es = [...d.entries].sort((a, b) => a.seq - b.seq);
        setOriginal(es); setEntries(es); setRows(es.map(() => ({ state: "pending" })));
        const cart = [...es].reverse().find((e) => e.action === "add_to_cart") ?? es[es.length - 1];
        if (cart) setSelected(cart.seq);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => { live = false; };
  }, [sessionId]);

  /** Recompute links from index `from` (earlier rows keep their result), optionally animated. */
  const run = useCallback(async (list: LogEntry[], from = 0, animate = true) => {
    const my = ++token.current;
    setRunning(true); setDone(false);
    const t0 = performance.now();
    setRows((prev) => list.map((_, i) => (i < from && prev[i] ? prev[i] : { state: "pending" })));
    let broken = false;
    // Status of rows before `from` decides whether later rows are downstream of a break.
    for (let i = 0; i < from; i++) { const s = rowsRef.current[i]?.state; if (s === "content" || s === "link") broken = true; }
    for (let i = from; i < list.length; i++) {
      if (animate) {
        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, state: "checking" } : r)));
        await sleep(STEP_MS);
      }
      if (my !== token.current) return;
      const c = await checkLink(list[i], i === 0 ? GENESIS : list[i - 1].hash);
      const state: Row["state"] = c.status !== "ok" ? c.status : broken ? "downstream" : "ok";
      if (c.status !== "ok") broken = true;
      setRows((prev) => prev.map((r, j) => (j === i ? { state, check: c } : r)));
    }
    if (my !== token.current) return;
    setElapsed(performance.now() - t0);
    setRunning(false); setDone(true);
  }, []);
  const rowsRef = useRef<Row[]>([]);
  rowsRef.current = rows;

  // Start the animation when the panel scrolls into view.
  useEffect(() => {
    if (!original || started.current || !box.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) { started.current = true; void run(original, 0, true); io.disconnect(); }
    }, { threshold: 0.25 });
    io.observe(box.current);
    return () => io.disconnect();
  }, [original, run]);

  const firstBreak = rows.findIndex((r) => r.state === "content" || r.state === "link");
  const verifiedCount = rows.filter((r) => r.state === "ok").length;
  const sel = selected != null ? entries.findIndex((e) => e.seq === selected) : -1;
  const selEntry = sel >= 0 ? entries[sel] : undefined;
  const selRow = sel >= 0 ? rows[sel] : undefined;

  const updateField = (seq: number, path: (string | number)[], raw: string, like: unknown) => {
    const idx = entries.findIndex((e) => e.seq === seq);
    if (idx < 0) return;
    const next = entries.map((e, i) => (i === idx ? setAt(e, path, coerce(raw, like)) : e));
    setEntries(next);
    const orig = original?.[idx];
    setEdited((s) => { const n = new Set(s); if (orig && canonical(orig) === canonical(next[idx])) n.delete(seq); else n.add(seq); return n; });
    void run(next, idx, false);
  };

  /** What a naive attacker does: recompute the edited entry's own hash. The NEXT link then breaks instead. */
  const reseal = async (seq: number) => {
    const idx = entries.findIndex((e) => e.seq === seq);
    if (idx < 0) return;
    const c = await checkLink(entries[idx], entries[idx].prevHash);
    const next = entries.map((e, i) => (i === idx ? { ...e, hash: c.computed } : e));
    setEntries(next);
    setEdited((s) => new Set(s).add(seq));
    void run(next, idx, true);
  };

  const reset = () => {
    if (!original) return;
    setEntries(original); setEdited(new Set());
    void run(original, 0, true);
  };

  const editable = useMemo(() => {
    if (!selEntry) return [];
    const { ts, actor, action, payload } = selEntry;
    return leaves({ ts, actor, action, payload });
  }, [selEntry]);

  const tampered = edited.size > 0;
  const head = entries[entries.length - 1]?.hash;

  return (
    <Card padded={false} className={cx("mb-8 overflow-hidden transition-colors", done && firstBreak >= 0 && "border-coral/35")}>
      <div ref={box} />
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-divider px-5 py-4 max-sm:px-4">
        <div className="min-w-[320px] max-w-2xl flex-1 max-sm:min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[14px] font-semibold text-ink">Verify it yourself</h2>
            <Badge tone="outline">WebCrypto · SHA-256</Badge>
            {tampered && <Badge tone="warn">Local edits: {edited.size}</Badge>}
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
            Your browser downloads the raw entries, rebuilds each one&apos;s canonical JSON and recomputes{" "}
            <span className="font-mono text-[12px] text-ink-2">sha256(prevHash ‖ canonical(entry))</span>. It doesn&apos;t rely on the
            server&apos;s integrity flag. <Link href="/methodology#hash-chain" className="text-accent hover:underline">Spec</Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => original && run(entries, 0, true)} disabled={!original || running}
            className="inline-flex h-8 max-lg:h-10 items-center gap-1.5 rounded-md border border-divider bg-white px-2.5 text-[13px] text-ink shadow-sm hover:bg-ivory disabled:opacity-50">
            <Play size={13} /> Re-run
          </button>
          <button type="button" onClick={() => { setEditMode((m) => !m); if (!editMode && selected == null && entries.length) setSelected(entries[Math.min(entries.length - 1, Math.max(0, entries.findIndex((e) => e.action === "add_to_cart")))].seq); }}
            className={cx("inline-flex h-8 max-lg:h-10 items-center gap-1.5 rounded-md border px-2.5 text-[13px] shadow-sm",
              editMode ? "border-accent bg-accent-soft text-accent" : "border-divider bg-white text-ink hover:bg-ivory")}>
            <Pencil size={13} /> Edit history
          </button>
          {tampered && (
            <button type="button" onClick={reset} className="inline-flex h-8 max-lg:h-10 items-center gap-1.5 rounded-md border border-divider bg-white px-2.5 text-[13px] text-ink shadow-sm hover:bg-ivory">
              <RotateCcw size={13} /> Restore
            </button>
          )}
          <a href={`/api/traces/${encodeURIComponent(sessionId)}/raw?download=1`}
            className="inline-flex h-8 max-lg:h-10 items-center gap-1.5 rounded-md border border-divider bg-white px-2.5 text-[13px] text-ink shadow-sm hover:bg-ivory">
            <Download size={13} /> Raw JSON
          </a>
        </div>
      </div>

      {error && <div className="px-5 py-4 text-[13px] text-coral-ink">Couldn&apos;t load raw chain: {error}</div>}

      {original && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          {/* chain */}
          <div className="min-w-0 border-divider px-5 py-4 max-sm:px-3 lg:border-r">
            <Summary rows={rows} running={running} done={done} firstBreak={firstBreak} entries={entries} verified={verifiedCount} elapsed={elapsed} tampered={tampered} />
            <ol className="mt-3">
              <li className="flex items-center gap-3 pb-1 pl-[3px] text-[11.5px] text-ink-4">
                <span className="grid size-[18px] place-items-center rounded-full border border-dashed border-ink-5 font-mono text-[9px]">G</span>
                <span className="font-mono">GENESIS</span>
              </li>
              {entries.map((e, i) => {
                const r = rows[i] ?? { state: "pending" };
                const bad = r.state === "content" || r.state === "link";
                const isSel = selected === e.seq;
                return (
                  <li key={e.seq} className="relative">
                    {/* connector from previous */}
                    <span className={cx("absolute left-[14.5px] -top-[3px] h-[8px] w-px transition-colors duration-300",
                      r.state === "ok" ? "bg-pass" : r.state === "link" || r.state === "downstream" ? "bg-coral/45" : bad ? "bg-coral/45" : "bg-ink-5")} />
                    <button type="button" onClick={() => setSelected(isSel && !editMode ? null : e.seq)}
                      className={cx("mt-1 grid w-full grid-cols-[24px_52px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-0.5 py-[3px] text-left transition-colors max-lg:py-2 max-sm:grid-cols-[24px_40px_minmax(0,1fr)_auto]",
                        isSel ? "bg-canvas-sunk/80" : "hover:bg-ivory", bad && "bg-coral-soft hover:bg-coral-soft", r.state === "downstream" && "bg-coral-soft/40")}>
                      <StatusDot state={r.state} />
                      <span className="font-mono text-[12px] text-ink-3 tnum">#{e.seq}</span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className={cx("truncate text-[13px]", bad ? "font-medium text-coral-ink" : "text-ink")}>{e.action.replace(/_/g, " ")}</span>
                        {edited.has(e.seq) && <Badge tone="warn" className="h-[18px]">edited</Badge>}
                      </span>
                      <span className={cx("font-mono text-[11.5px] tnum", bad ? "text-coral-ink" : r.state === "ok" ? "text-ink-3" : "text-ink-4")}>
                        {r.state === "content" ? <>hash mismatch at #{e.seq}</> : r.state === "link" ? <>prevHash mismatch at #{e.seq}</>
                          : r.state === "downstream" ? <span className="text-coral">not anchored</span> : short(e.hash)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="mt-3 flex items-center gap-2 border-t border-divider pt-3 text-[11.5px] text-ink-3 max-sm:flex-wrap max-sm:gap-y-0">
              <span>Head</span>
              <span className="font-mono text-ink-2 max-sm:break-anywhere">{short(head, 24)}…</span>
              <span className="text-ink-4">· anyone who keeps this value can detect a full rewrite</span>
            </div>
          </div>

          {/* inspector */}
          <div className="min-w-0 bg-ivory/40 px-5 py-4 max-sm:px-3">
            {selEntry ? (
              <Inspector entry={selEntry} original={original[sel]} row={selRow} editMode={editMode} leaves={editable}
                onField={(p, raw, like) => updateField(selEntry.seq, p, raw, like)} onReseal={() => reseal(selEntry.seq)} isEdited={edited.has(selEntry.seq)} />
            ) : (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 text-center">
                <FlaskConical size={18} className="text-ink-5" />
                <p className="max-w-xs text-[13px] text-ink-3">
                  Select an entry to see the exact bytes that were hashed. Turn on <span className="font-medium text-ink-2">Edit history</span> to rewrite
                  one locally and see where verification fails.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      {!original && !error && <div className="h-[260px] animate-pulse bg-ivory" />}
    </Card>
  );
}

function StatusDot({ state }: { state: Row["state"] }) {
  const base = "relative z-[1] grid size-[24px] place-items-center rounded-full border transition-all duration-300";
  if (state === "ok") return <span className={cx(base, "border-pass/35 bg-pass-soft text-pass-ink")}><Check size={13} strokeWidth={2.5} /></span>;
  if (state === "content" || state === "link") return <span className={cx(base, "border-coral/35 bg-coral-soft text-coral-ink")}><X size={13} strokeWidth={2.5} /></span>;
  if (state === "downstream") return <span className={cx(base, "border-coral/35 bg-white text-coral/60")}><span className="size-1.5 rounded-full bg-coral/45" /></span>;
  if (state === "checking") return <span className={cx(base, "border-accent bg-accent-soft")}><span className="size-1.5 rounded-full bg-accent pulse-dot" /></span>;
  return <span className={cx(base, "border-divider bg-white")}><span className="size-1 rounded-full bg-ink-5" /></span>;
}

function Summary({ rows, running, done, firstBreak, entries, verified, elapsed, tampered }: {
  rows: Row[]; running: boolean; done: boolean; firstBreak: number; entries: LogEntry[]; verified: number; elapsed: number | null; tampered: boolean;
}) {
  const n = entries.length;
  const pct = n ? (rows.filter((r) => r.state !== "pending" && r.state !== "checking").length / n) * 100 : 0;
  const broken = firstBreak >= 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className={cx("text-[13.5px] font-medium", broken ? "text-coral-ink" : done ? "text-pass-ink" : "text-ink")}>
          {broken ? <>Chain broken at #{entries[firstBreak].seq}{rows[firstBreak].state === "link" ? ": prevHash doesn't match the previous entry" : ": recomputed hash ≠ recorded hash"}</>
            : done ? <>All {n} links recomputed and verified locally{tampered ? " (edits restored to original values)" : ""}</>
            : running ? <>Recomputing link {Math.min(n, rows.filter((r) => r.check).length + 1)} of {n}…</> : <>Ready to verify {n} links</>}
        </div>
        <span className="shrink-0 text-[11.5px] text-ink-4 tnum">{done && elapsed != null ? `${verified}/${n} ok` : ""}</span>
      </div>
      {broken && done && (
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
          {rows[firstBreak].state === "link"
            ? <>Re-sealing #{entries[firstBreak - 1]?.seq} only moves the break to the next link. To hide the edit, an attacker would have to rewrite every later hash, which changes the head.</>
            : <>Entries after #{entries[firstBreak].seq} still check out on their own, but they are no longer anchored to GENESIS through an honest link.</>}
        </p>
      )}
      <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-canvas-sunk">
        <div className={cx("h-full rounded-full transition-[width] duration-150", broken ? "bg-coral" : done ? "bg-pass" : "bg-accent")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Inspector({ entry, original, row, editMode, leaves: ls, onField, onReseal, isEdited }: {
  entry: LogEntry; original?: LogEntry; row?: Row; editMode: boolean; leaves: Leaf[]; onField: (p: (string | number)[], raw: string, like: unknown) => void; onReseal: () => void; isEdited: boolean;
}) {
  const c = row?.check;
  const rest = { ...entry } as Partial<LogEntry>;
  delete rest.hash;
  const canon = canonical(rest);
  const match = c && c.computed === entry.hash;
  const was = new Map(original ? leaves({ ts: original.ts, actor: original.actor, action: original.action, payload: original.payload }).map((l) => [pathLabel(l.path), l.value]) : []);
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 max-sm:flex-wrap">
        <div className="text-[13px] font-medium text-ink max-sm:min-w-0 max-sm:break-anywhere">Entry <span className="font-mono">#{entry.seq}</span> <span className="font-normal text-ink-3">· {entry.actor} · {entry.action}</span></div>
        {editMode && isEdited && (
          <button type="button" onClick={onReseal} title="Recompute this entry's own hash, as an attacker would. The next link then breaks."
            className="inline-flex h-7 max-lg:h-10 items-center gap-1.5 rounded-md border border-divider bg-white px-2 text-[12px] text-ink-2 hover:bg-ivory">
            <Stamp size={12} /> Re-seal this entry
          </button>
        )}
      </div>

      {editMode && (
        <div>
          <div className="mb-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-4">Fields (edits stay in this tab)</div>
          <div className="max-h-[220px] overflow-auto rounded-md border border-divider bg-white">
            {ls.map((l) => {
              const key = pathLabel(l.path);
              const changed = was.has(key) && was.get(key) !== l.value;
              return (
                <label key={key} className={cx("grid grid-cols-[minmax(0,40%)_1fr_auto] items-center gap-2 border-b border-divider px-2.5 py-1 last:border-b-0", changed && "bg-amber-soft/70")}>
                  <span className={cx("truncate font-mono text-[11.5px]", changed ? "text-amber-ink" : "text-ink-3")} title={key}>{key}</span>
                  <input defaultValue={l.value === null ? "null" : String(l.value)} key={`${entry.seq}:${key}:${String(l.value)}`}
                    onChange={(ev) => onField(l.path, ev.target.value, l.value)}
                    className="h-6 max-lg:h-10 max-md:text-[16px] min-w-0 rounded border border-transparent bg-transparent px-1.5 font-mono text-[12px] text-ink outline-none hover:border-divider focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/15" />
                  <span className="font-mono text-[11px] text-amber-ink">{changed ? <>was <span className="line-through">{String(was.get(key))}</span></> : null}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[11.5px]">
          <span className="font-medium uppercase tracking-[0.06em] text-ink-4">Preimage · exact bytes hashed</span>
          {c && <span className="text-ink-4 tnum">{c.bytes.toLocaleString()} bytes UTF-8</span>}
        </div>
        <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap break-all rounded-md border border-divider bg-white p-2.5 font-mono text-[11.5px] leading-[1.55] text-ink-2">
          <span className="text-accent">{entry.prevHash}</span><span className="text-ink-5">‖</span>{canon}
        </pre>
      </div>

      <dl className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-1.5 font-mono text-[11px] tracking-[-0.01em]">
        <dt className="font-sans text-ink-3">recomputed</dt>
        <dd className={cx("break-all", c ? (match ? "text-pass-ink" : "text-coral-ink") : "text-ink-4")}>{c?.computed ?? "…"}</dd>
        <dt className="font-sans text-ink-3">recorded</dt>
        <dd className="break-all text-ink-2">{entry.hash}</dd>
        <dt className="font-sans text-ink-3">prev link</dt>
        <dd className={cx("break-all", c && c.status === "link" ? "text-coral-ink" : "text-ink-3")}>
          {c ? (c.status === "link" ? <>expected {short(c.expectedPrev, 16)}…, entry says {short(entry.prevHash, 16)}…</> : <>matches {c.expectedPrev === GENESIS ? "GENESIS" : `previous entry (${short(c.expectedPrev, 16)}…)`}</>) : "…"}
        </dd>
      </dl>
    </div>
  );
}
