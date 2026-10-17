"use client";
import { useEffect, useState } from "react";
import { Badge, ErrorState, Skeleton, cx } from "@/components/ui";

interface Prop { type?: string; description?: string; enum?: string[]; minimum?: number; maximum?: number; default?: unknown; minLength?: number; maxLength?: number; exclusiveMinimum?: number }
export interface ToolDef {
  name: string; title?: string; description: string;
  inputSchema: { properties?: Record<string, Prop>; required?: string[] };
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
}

/** Fetch the live tool catalog from the MCP endpoint (sessionless tools/list). */
export function useTools() {
  const [tools, setTools] = useState<ToolDef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setError(null);
    try {
      const r = await fetch("/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      setTools(d.result.tools);
    } catch (e) { setError(String((e as Error).message || e)); }
  };
  useEffect(() => { void load(); }, []);
  return { tools, error, reload: load };
}

function kind(t: ToolDef): { label: string; tone: "neutral" | "accent" | "warn" | "outline" } {
  if (t.annotations?.readOnlyHint) return { label: "Read only", tone: "outline" };
  if (t.name === "checkout") return { label: "Spends · grades", tone: "accent" };
  if (t.name === "start_task" || t.name === "end_task") return { label: "Lifecycle", tone: "neutral" };
  return { label: "Writes cart", tone: "neutral" };
}

function typeOf(p: Prop): string {
  if (p.enum) return "enum";
  return p.type ?? "any";
}

function constraintText(p: Prop): string | null {
  const bits: string[] = [];
  if (p.minimum != null && p.maximum != null) bits.push(`${p.minimum}–${p.maximum}`);
  else if (p.minimum != null) bits.push(`≥ ${p.minimum}`);
  if (p.exclusiveMinimum != null) bits.push(`> ${p.exclusiveMinimum}`);
  if (p.maxLength != null) bits.push(`≤ ${p.maxLength} chars`);
  if (p.default !== undefined) bits.push(`default ${JSON.stringify(p.default)}`);
  return bits.length ? bits.join(" · ") : null;
}

export default function ToolReference({ state }: { state: ReturnType<typeof useTools> }) {
  const { tools, error, reload } = state;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!tools) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      {tools.map((t, i) => {
        const props = Object.entries(t.inputSchema.properties ?? {});
        const req = new Set(t.inputSchema.required ?? []);
        const k = kind(t);
        return (
          <div key={t.name} id={`tool-${t.name}`} className={cx("grid grid-cols-1 gap-x-8 gap-y-3 px-5 py-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]", i > 0 && "border-t border-zinc-100")}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[13px] font-semibold text-zinc-900">{t.name}</span>
                <span className="font-mono text-[12px] text-zinc-400">({props.map(([n]) => (req.has(n) ? n : `${n}?`)).join(", ")})</span>
                <Badge tone={k.tone}>{k.label}</Badge>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-600">{t.description}</p>
            </div>
            <div className="min-w-0">
              {props.length === 0 ? (
                <div className="text-[12px] text-zinc-400 lg:pt-0.5">No arguments</div>
              ) : (
                <dl className="divide-y divide-zinc-100 rounded-md border border-zinc-100">
                  {props.map(([n, p]) => {
                    const c = constraintText(p);
                    return (
                      <div key={n} className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 px-3 py-2">
                        <dt className="flex items-baseline gap-1.5">
                          <span className="font-mono text-[12px] font-medium text-zinc-900">{n}</span>
                          <span className="font-mono text-[11px] text-zinc-400">{typeOf(p)}</span>
                        </dt>
                        <dd className="min-w-0 text-[12px] leading-relaxed text-zinc-600">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            {req.has(n) ? <span className="text-[11px] font-medium text-zinc-900">required</span> : <span className="text-[11px] text-zinc-400">optional</span>}
                            {c && <span className="text-[11px] text-zinc-400">{c}</span>}
                          </div>
                          <div>{p.description}</div>
                          {p.enum && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {p.enum.map((e) => <span key={e} className="rounded border border-zinc-200 px-1 font-mono text-[10.5px] text-zinc-600">{e}</span>)}
                            </div>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
