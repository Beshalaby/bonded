"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { Card, Chip, PageHeader, ProviderBadge, buttonClass, cx } from "@/components/ui";
import type { EvalRun, GuardrailMode } from "@/lib/types";
import { postJSON, useApi, type LeaderboardResponse, type TasksResponse } from "@/lib/ui/api";

const KNOWN: { model: string; displayName: string; provider: string; simulated: boolean; note?: string }[] = [
  { model: "sim/careful", displayName: "Atlas Careful", provider: "Simulated", simulated: true, note: "Checks brand, merchant, price and budget. Baseline." },
  { model: "sim/bargain-hunter", displayName: "Bargain Hunter", provider: "Simulated", simulated: true, note: "Picks the biggest advertised discount." },
  { model: "sim/gullible", displayName: "Gullible", provider: "Simulated", simulated: true, note: "Follows instructions found in listings." },
  { model: "sim/hasty", displayName: "Hasty", provider: "Simulated", simulated: true, note: "Takes the first result and skips checks." },
  { model: "sim/brand-blind", displayName: "Brand Blind", provider: "Simulated", simulated: true, note: "Matches on keywords and buys the cheapest." },
];

const GUARDRAIL: { mode: GuardrailMode; title: string; body: string }[] = [
  { mode: "observe", title: "Observe", body: "Checks every cart before checkout and records its verdict, but never blocks. Measures the guardrail’s catch rate without changing outcomes. Recommended." },
  { mode: "enforce", title: "Enforce", body: "Blocks carts the guardrail rejects. Use this to measure how much the guardrail improves agent outcomes." },
  { mode: "off", title: "Off", body: "No pre-checkout check. Measures raw agent behaviour only." },
];

export default function NewRunForm() {
  const router = useRouter();
  const lb = useApi<LeaderboardResponse>("/api/leaderboard");
  const tasks = useApi<TasksResponse>("/api/tasks");

  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [extra, setExtra] = useState<string[]>([]);
  const [taskMode, setTaskMode] = useState<"sample" | "tags">("sample");
  const [taskCount, setTaskCount] = useState(20);
  const [tags, setTags] = useState<string[]>([]);
  const [adversarial, setAdversarial] = useState(true);
  const [guardrail, setGuardrail] = useState<GuardrailMode>("observe");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string>();

  const models = useMemo(() => {
    const map = new Map<string, { model: string; displayName: string; provider: string; simulated: boolean; note?: string; n?: number }>();
    for (const r of lb.data?.rows ?? []) map.set(r.model, { model: r.model, displayName: r.displayName.replace(/\s*\(sim\)\s*$/i, ""), provider: r.provider, simulated: r.simulated, n: r.n });
    for (const k of KNOWN) if (!map.has(k.model)) map.set(k.model, k); else map.set(k.model, { ...k, ...map.get(k.model)!, note: k.note });
    for (const e of extra) if (!map.has(e)) map.set(e, { model: e, displayName: e, provider: e.split("/")[0] || "Custom", simulated: e.startsWith("sim/") });
    const rank = new Map((lb.data?.rows ?? []).map((r, i) => [r.model, i]));
    return [...map.values()].sort((a, b) =>
      Number(a.simulated) - Number(b.simulated) || (rank.get(a.model) ?? 99) - (rank.get(b.model) ?? 99) || a.model.localeCompare(b.model));
  }, [lb.data, extra]);

  const allTasks = tasks.data?.tasks ?? [];
  const matching = useMemo(() => {
    let t = allTasks;
    if (!adversarial) t = t.filter((x) => !x.adversarial);
    if (taskMode === "tags" && tags.length) t = t.filter((x) => tags.some((g) => x.tags.includes(g)));
    return t.length;
  }, [allTasks, adversarial, taskMode, tags]);
  const nTasks = taskMode === "sample" ? Math.min(taskCount, matching || taskCount) : matching;
  const episodes = selected.length * nTasks;

  const toggle = (m: string) => setSelected((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));
  const addCustom = () => {
    const v = custom.trim();
    if (!v) return;
    setExtra((e) => (e.includes(v) ? e : [...e, v]));
    setSelected((s) => (s.includes(v) ? s : [...s, v]));
    setCustom("");
  };

  async function submit() {
    setSubmitting(true); setErr(undefined);
    try {
      const body: Record<string, unknown> = { models: selected, includeAdversarial: adversarial, guardrail };
      if (taskMode === "sample") body.taskCount = taskCount;
      else if (tags.length) body.tags = tags;
      const { run } = await postJSON<{ run: EvalRun }>("/api/runs", body);
      router.push(`/runs/${encodeURIComponent(run.id)}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <>
      <nav className="mb-3 flex items-center gap-1.5 text-[13px] text-zinc-500">
        <Link href="/runs" className="hover:text-zinc-900">Runs</Link><span className="text-zinc-300">/</span><span>New</span>
      </nav>
      <PageHeader title="New run" description="Pick models and tasks. The run starts immediately; results stream in as each task is graded." />

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_300px]">
        <div className="space-y-10">
          <FormSection n={1} title="Models" description="Models from the leaderboard plus the built-in simulated agents. Simulated agents run instantly and cost nothing."
            action={<button type="button" className="text-[13px] text-accent hover:underline"
              onClick={() => setSelected((s) => (s.length === models.length ? [] : models.map((m) => m.model)))}>
              {selected.length === models.length && models.length ? "Clear" : "Select all"}</button>}>
            <div className="grid gap-2 sm:grid-cols-2">
              {models.map((m) => {
                const on = selected.includes(m.model);
                return (
                  <label key={m.model}
                    className={cx("flex cursor-pointer items-start gap-3 rounded-lg border bg-white px-3.5 py-3 transition-colors",
                      on ? "border-accent ring-1 ring-accent" : "border-zinc-200 hover:border-zinc-300")}>
                    <input type="checkbox" checked={on} onChange={() => toggle(m.model)} className="sr-only" />
                    <span className={cx("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                      on ? "border-accent bg-accent text-white" : "border-zinc-300 bg-white")}>
                      {on && <Check size={12} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-medium text-zinc-900">{m.displayName}</span>
                        <ProviderBadge provider={m.provider} simulated={m.simulated} />
                      </span>
                      <span className="block truncate font-mono text-[11.5px] text-zinc-400">{m.model}{m.n ? ` · ${m.n} results` : ""}</span>
                      {m.note && <span className="mt-1 block text-[12px] leading-snug text-zinc-500">{m.note}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
                placeholder="Add a model id, e.g. openai/gpt-4o-mini"
                className="h-8 w-full max-w-sm rounded-md border border-zinc-200 px-2.5 font-mono text-[12.5px] shadow-sm outline-none placeholder:font-sans placeholder:text-zinc-400 focus:border-accent focus:ring-2 focus:ring-accent/15" />
              <button type="button" onClick={addCustom} className={buttonClass("secondary")}><Plus size={14} /> Add</button>
            </div>
          </FormSection>

          <FormSection n={2} title="Tasks" description={tasks.data ? `${allTasks.length} tasks in the library, ${allTasks.filter((t) => t.adversarial).length} of them adversarial.` : "Loading task library…"}>
            <div className="flex gap-1 rounded-md bg-zinc-100 p-0.5 text-[13px] w-fit">
              {(["sample", "tags"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setTaskMode(m)}
                  className={cx("rounded px-3 py-1", taskMode === m ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900")}>
                  {m === "sample" ? "Random sample" : "Filter by tag"}
                </button>
              ))}
            </div>
            {taskMode === "sample" ? (
              <div className="mt-4 flex items-center gap-3">
                <input type="range" min={5} max={Math.max(5, Math.min(200, allTasks.length || 100))} step={5} value={taskCount}
                  onChange={(e) => setTaskCount(Number(e.target.value))} className="w-64 accent-[var(--color-accent)]" />
                <input type="number" min={1} value={taskCount} onChange={(e) => setTaskCount(Math.max(1, Number(e.target.value) || 1))}
                  className="h-8 w-20 rounded-md border border-zinc-200 px-2 text-right text-[13px] tnum shadow-sm outline-none focus:border-accent" />
                <span className="text-[13px] text-zinc-500">tasks, sampled</span>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {(tasks.data?.tags ?? []).map((t) => (
                  <Chip key={t.tag} active={tags.includes(t.tag)} count={t.count}
                    onClick={() => setTags((s) => (s.includes(t.tag) ? s.filter((x) => x !== t.tag) : [...s, t.tag]))}>{t.tag}</Chip>
                ))}
                {!tasks.data?.tags?.length && <span className="text-[13px] text-zinc-500">No tags available.</span>}
              </div>
            )}
            <label className="mt-4 flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" checked={adversarial} onChange={(e) => setAdversarial(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-accent)]" />
              <span>
                <span className="text-[13.5px] font-medium text-zinc-900">Include adversarial tasks</span>
                <span className="block text-[12.5px] text-zinc-500">Tasks generated by the red team from scams that fooled at least one model.</span>
              </span>
            </label>
          </FormSection>

          <FormSection n={3} title="Guardrail" description="A pre-checkout checker that reviews the cart. It is evaluated alongside the agents.">
            <div className="grid gap-2 sm:grid-cols-3">
              {GUARDRAIL.map((g) => {
                const on = guardrail === g.mode;
                return (
                  <label key={g.mode}
                    className={cx("cursor-pointer rounded-lg border bg-white px-3.5 py-3 transition-colors",
                      on ? "border-accent ring-1 ring-accent" : "border-zinc-200 hover:border-zinc-300")}>
                    <input type="radio" name="guardrail" checked={on} onChange={() => setGuardrail(g.mode)} className="sr-only" />
                    <span className="flex items-center gap-2">
                      <span className={cx("flex size-4 items-center justify-center rounded-full border", on ? "border-accent" : "border-zinc-300")}>
                        {on && <span className="size-2 rounded-full bg-accent" />}
                      </span>
                      <span className="text-[13.5px] font-medium text-zinc-900">{g.title}</span>
                    </span>
                    <span className="mt-1.5 block text-[12.5px] leading-snug text-zinc-500">{g.body}</span>
                  </label>
                );
              })}
            </div>
          </FormSection>
        </div>

        <div className="lg:sticky lg:top-20">
          <Card>
            <div className="text-[14px] font-semibold text-zinc-900">Summary</div>
            <dl className="mt-3 space-y-2 text-[13px]">
              <Row k="Models" v={selected.length || "—"} />
              <Row k="Tasks" v={taskMode === "tags" && !tags.length ? `all (${matching})` : nTasks || "—"} />
              <Row k="Adversarial" v={adversarial ? "Included" : "Excluded"} />
              <Row k="Guardrail" v={<span className="capitalize">{guardrail}</span>} />
              <div className="border-t border-zinc-100 pt-2"><Row k="Episodes" v={<span className="font-semibold text-zinc-900">{episodes || "—"}</span>} /></div>
            </dl>
            {selected.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {selected.map((m) => <span key={m} className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600">{m}</span>)}
              </div>
            )}
            <button type="button" disabled={!selected.length || submitting} onClick={submit} className={cx(buttonClass("primary"), "mt-4 w-full h-9")}>
              {submitting ? <><Loader2 size={14} className="animate-spin" /> Starting…</> : "Start run"}
            </button>
            {!selected.length && <p className="mt-2 text-center text-[12px] text-zinc-500">Select at least one model.</p>}
            {err && <p className="mt-2 text-[12.5px] text-rose-700">{err}</p>}
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><dt className="text-zinc-500">{k}</dt><dd className="text-right text-zinc-800 tnum">{v}</dd></div>;
}

function FormSection({ n, title, description, children, action }: { n: number; title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2.5">
        <span className="text-[13px] text-zinc-400 tnum">{n}</span>
        <div className="flex-1">
          <h2 className="text-[15px] font-semibold text-zinc-900">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-zinc-500">{description}</p>}
        </div>
        {action}
      </div>
      <div className="pl-[22px]">{children}</div>
    </section>
  );
}
