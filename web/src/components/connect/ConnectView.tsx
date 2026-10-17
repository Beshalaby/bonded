"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Badge, ButtonLink, PageHeader, Section, TextLink, cx } from "@/components/ui";
import { TRAP_LABEL } from "@/lib/ui/format";
import type { TrapType } from "@/lib/types";
import { CodeBlock, CopyField } from "./Code";
import LivePanel from "./LivePanel";
import SetupTabs from "./SetupTabs";
import ToolReference, { useTools } from "./ToolReference";

export interface DemoTask { id: string; instruction: string; budget: number; traps: TrapType[] }

export default function ConnectView({ initialOrigin, tasks, parity }: { initialOrigin: string; tasks: DemoTask[]; parity: string }) {
  const [origin, setOrigin] = useState(initialOrigin);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const endpoint = `${origin}/api/mcp`;
  const toolsState = useTools();
  const toolCount = toolsState.tools?.length;

  const [taskId, setTaskId] = useState(tasks[0]?.id ?? "airpods-pro-2");
  const task = tasks.find((t) => t.id === taskId);
  const prompt = `Use the spendbench tools to complete task ${taskId}.`;
  const suite = useMemo(() => {
    const ids = tasks.slice(0, 5).map((t) => t.id);
    return `Use the spendbench tools to complete these tasks one after another: ${ids.join(", ")}. Treat each one as a real purchase for a real person.`;
  }, [tasks]);

  return (
    <>
      <PageHeader
        eyebrow="Bring your own agent"
        title="Evaluate your agent"
        actions={<ButtonLink href="/" variant="secondary">View leaderboard</ButtonLink>}
        description={<>Point any MCP agent at SpendBench, whether that is Claude Code, Cursor or your own. It shops in the same trap-filled store as every model on the leaderboard. Each step is hash-chain traced, and the same grader puts it on the board.</>}
      />

      {/* Endpoint strip */}
      <div className="mb-10 grid overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 gap-px lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-2 bg-white px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
          <div className="shrink-0 text-[12px] text-zinc-500">MCP endpoint</div>
          <CopyField value={endpoint} size="lg" className="min-w-0 flex-1 sm:max-w-[520px]" />
        </div>
        <div className="grid grid-cols-2 gap-px bg-zinc-200 sm:grid-cols-4">
          <Fact k="Transport" v="Streamable HTTP" />
          <Fact k="Protocol" v="2025-06-18" />
          <Fact k="Tools" v={toolCount != null ? String(toolCount) : "–"} />
          <Fact k="Auth" v="None (sandbox)" />
        </div>
      </div>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-10">
          <Step n={1} title="Connect" description="Register the server once. Your client discovers the tools automatically.">
            <SetupTabs endpoint={endpoint} />
          </Step>

          <Step n={2} title="Ask it to shop" description="Pick a task. The agent calls start_task, shops, and checks out once. It's graded the moment it pays.">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {tasks.map((t) => (
                <button key={t.id} type="button" onClick={() => setTaskId(t.id)} title={t.instruction}
                  className={cx(
                    "h-7 rounded-md border px-2.5 font-mono text-[11.5px] transition-colors",
                    t.id === taskId ? "border-accent bg-accent-soft text-accent" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900",
                  )}>
                  {t.id}
                </button>
              ))}
            </div>
            <CodeBlock title="Prompt" code={prompt} wrap />
            {task && (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-zinc-500">
                <span className="text-zinc-700">“{task.instruction}”</span>
                {task.traps.length > 0 && (
                  <span className="flex flex-wrap items-center gap-1">
                    <span className="mr-0.5">Traps in this aisle</span>
                    {task.traps.map((tt) => <Badge key={tt} tone="outline">{TRAP_LABEL[tt]}</Badge>)}
                  </span>
                )}
              </div>
            )}
            <details className="group mt-4">
              <summary className="cursor-pointer list-none text-[12.5px] font-medium text-zinc-600 hover:text-zinc-900">
                <span className="inline-flex items-center gap-1"><ArrowRight size={12} className="transition-transform group-open:rotate-90" />Run several tasks in one session</span>
              </summary>
              <div className="mt-2.5">
                <CodeBlock title="Prompt" code={suite} wrap />
                <p className="mt-2 text-[12.5px] text-zinc-500">
                  All the tasks from one MCP session go into a single eval run named <span className="font-mono text-[12px] text-zinc-700">MCP: &lt;agent&gt;</span>. To report under a different name, pass <span className="font-mono text-[12px] text-zinc-700">agent_name</span> to <span className="font-mono text-[12px] text-zinc-700">start_task</span>.
                </p>
              </div>
            </details>
          </Step>

          <Step n={3} title="Watch it get graded" description="The panel on the right updates live as the agent works. Every MCP call goes through the same code path as the built-in agents.">
            <Pipeline parity={parity} />
          </Step>
        </div>

        <aside className="lg:sticky lg:top-20">
          <LivePanel />
          <p className="mt-2.5 px-1 text-[12px] leading-relaxed text-zinc-500">
            Finished agents get a row on the <TextLink href="/">leaderboard</TextLink> under their client name, for example <span className="font-mono text-[11.5px] text-zinc-700">mcp/claude-code</span>.
          </p>
        </aside>
      </div>

      <Section className="mt-16" title="Tools" description={<>This list comes from a live <span className="font-mono text-[12px]">tools/list</span> call to the endpoint. Agents never see <span className="font-mono text-[12px]">trap</span> labels or <span className="font-mono text-[12px]">marketPrice</span>.</>}>
        <ToolReference state={toolsState} />
      </Section>

      <Section title="Protocol" description="Implemented by hand as JSON-RPC 2.0 over Streamable HTTP. It has no SDK dependency and no SSE.">
        <div className="grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 md:grid-cols-2">
          <Spec k="POST /api/mcp" v={<>A single JSON-RPC message or a batch. Requests return <Code>application/json</Code>. If you send only notifications, you get <Code>202 Accepted</Code>.</>} />
          <Spec k="Sessions" v={<><Code>initialize</Code> issues an <Code>Mcp-Session-Id</Code>. That session holds the current task, so tools never need ids passed around.</>} />
          <Spec k="Versions" v={<><Code>2025-06-18</Code> (latest), <Code>2025-03-26</Code> and <Code>2024-11-05</Code>, negotiated on initialize and checked against <Code>MCP-Protocol-Version</Code>.</>} />
          <Spec k="GET / DELETE" v={<><Code>GET</Code> returns 405 because there is no server-initiated stream. <Code>DELETE</Code> ends the session and grades any unfinished task as no purchase.</>} />
          <Spec k="Identity" v={<>The model id is <Code>mcp/&lt;slug&gt;</Code>, built from <Code>clientInfo.name</Code> or the <Code>agent_name</Code> argument. The guardrail runs in observe mode, the same mode the built-in agents use.</>} />
          <Spec k="Grading" v={<><Code>lib/grade.ts</Code> is a line-by-line port of <Code>grader.py</Code> ({parity}). Results are ingested through the same pipeline, so failure attribution, reliability stats and live events all fire.</>} />
        </div>
      </Section>

      <Section title="Prefer plain HTTP?" description="The Arena API is what the built-in Python harness calls. With it you run your own loop and post graded results back.">
        <div className="space-y-4">
          <div className="grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 md:grid-cols-2">
            {HTTP_ROUTES.map(([m, p, d], i) => (
              <div key={p + m} className={cx("grid grid-cols-[56px_minmax(0,1fr)] gap-x-3 bg-white px-4 py-2.5", i === HTTP_ROUTES.length - 1 && "md:col-span-2")}>
                <span className={cx("mt-px font-mono text-[11px] font-semibold", m === "GET" ? "text-emerald-700" : m === "DELETE" ? "text-rose-700" : "text-accent")}>{m}</span>
                <div className="min-w-0">
                  <div className="truncate font-mono text-[12.5px] text-zinc-900">{p}</div>
                  <div className="mt-0.5 text-[12px] text-zinc-500">{d}</div>
                </div>
              </div>
            ))}
          </div>
          <CodeBlock lang="shell" title="Arena session over HTTP" code={httpScript(origin)} />
        </div>
        <p className="mt-3 text-[12.5px] text-zinc-500">
          Over plain HTTP you grade the session yourself with <span className="font-mono text-[12px] text-zinc-700">agents/spendbench/grader.py</span>, or with <span className="font-mono text-[12px] text-zinc-700">python3 -m agents.spendbench.runner</span>, which also posts the results. MCP sessions skip this step because the server grades them at checkout. The full contract is in <span className="font-mono text-[12px] text-zinc-700">CONTRACTS.md</span>.
        </p>
      </Section>
    </>
  );
}

const HTTP_ROUTES: [string, string, string][] = [
  ["POST", "/api/arena/sessions", "{ model, instruction, budget, taskId?, runId? } → { sessionId }"],
  ["GET", "/api/arena/search?q=&category=&maxPrice=", "x-session-id header → { products }"],
  ["GET", "/api/arena/products/:id", "x-session-id header → { product, merchant }"],
  ["POST", "/api/arena/cart", "{ sessionId, productId, qty } → { cart, total }"],
  ["DELETE", "/api/arena/cart", "{ sessionId, productId } → { cart, total }"],
  ["POST", "/api/arena/checkout", "{ sessionId, reasoning } → { transaction, guardrail }"],
  ["POST", "/api/bench/results", "{ runId?, results } → graded results in, attribution + events out"],
];

function httpScript(origin: string) {
  return [
    `SID=$(curl -s ${origin}/api/arena/sessions -H 'content-type: application/json' \\`,
    `  -d '{"model":"acme/agent-1","taskId":"airpods-pro-2","instruction":"Buy AirPods Pro 2, budget $260","budget":260}' \\`,
    `  | python3 -c 'import json,sys;print(json.load(sys.stdin)["sessionId"])')`,
    ``,
    `curl -s "${origin}/api/arena/search?q=airpods+pro+2" -H "x-session-id: $SID"`,
    `curl -s ${origin}/api/arena/cart -H 'content-type: application/json' \\`,
    `  -d "{\\"sessionId\\":\\"$SID\\",\\"productId\\":\\"p_airpods_pro2\\",\\"qty\\":1}"`,
    `curl -s ${origin}/api/arena/checkout -H 'content-type: application/json' \\`,
    `  -d "{\\"sessionId\\":\\"$SID\\",\\"reasoning\\":\\"Genuine Apple, verified seller, under budget\\"}"`,
  ].join("\n");
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[11.5px] text-zinc-500">{k}</div>
      <div className="mt-0.5 whitespace-nowrap text-[13px] font-medium text-zinc-900">{v}</div>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-zinc-100 px-1 py-px font-mono text-[11.5px] text-zinc-800">{children}</code>;
}

function Spec({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="bg-white px-5 py-4">
      <div className="font-mono text-[12px] font-medium text-zinc-900">{k}</div>
      <div className="mt-1 text-[12.5px] leading-relaxed text-zinc-600">{v}</div>
    </div>
  );
}

function Step({ n, title, description, children }: { n: number; title: string; description: ReactNode; children: ReactNode }) {
  return (
    <section className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-4">
      <div className="flex flex-col items-center">
        <span className="flex size-7 items-center justify-center rounded-full border border-zinc-200 bg-white font-mono text-[12px] font-medium text-zinc-700 tnum">{n}</span>
        <span className="mt-2 w-px flex-1 bg-zinc-200" />
      </div>
      <div className="min-w-0 pb-1">
        <h2 className="pt-[3px] text-[15px] font-semibold tracking-[-0.01em] text-zinc-900">{title}</h2>
        <p className="mb-4 mt-0.5 text-[13px] text-zinc-500">{description}</p>
        {children}
      </div>
    </section>
  );
}

const STAGES: { k: string; v: string; href?: string }[] = [
  { k: "/api/mcp", v: "JSON-RPC 2.0 from any MCP client" },
  { k: "Arena", v: "Same store and traps as every model" },
  { k: "Trace", v: "Every step SHA-256 hash-chained", href: "/traces" },
  { k: "Guardrail", v: "Observe mode: judged, never blocks" },
  { k: "Grader", v: "Line-by-line port of grader.py" },
  { k: "Leaderboard", v: "Beta posterior, 90% credible interval", href: "/" },
];

function Pipeline({ parity }: { parity: string }) {
  return (
    <div>
      <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-3">
        {STAGES.map((s, i) => {
          const inner = (
            <>
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 tnum">
                <span>{String(i + 1).padStart(2, "0")}</span>
                {i < STAGES.length - 1 && <ArrowRight size={11} className="text-zinc-300" />}
              </div>
              <div className={cx("mt-1.5 text-[13px] font-medium text-zinc-900", s.k.startsWith("/") && "font-mono text-[12.5px]")}>{s.k}</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-zinc-500">{s.v}</div>
            </>
          );
          return (
            <li key={s.k} className="bg-white">
              {s.href ? <Link href={s.href} className="block h-full px-3.5 py-3 transition-colors hover:bg-zinc-50">{inner}</Link> : <div className="h-full px-3.5 py-3">{inner}</div>}
            </li>
          );
        })}
      </ol>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-zinc-500">
        Checkout grades the cart the agent actually built, whatever the guardrail said. The verdict, the reasons, any trap it fell for and links to the trace come back in the <span className="font-mono text-[12px] text-zinc-700">checkout</span> response, so the agent sees its own grade. Grader parity with Python: {parity}.
      </p>
    </div>
  );
}
