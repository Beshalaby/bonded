"use client";
import Link from "next/link";
import type { EvalRun } from "@/lib/types";
import { ago, runHref } from "@/lib/ui/format";
import { RunStatusBadge, Table, Td, Th, Tr, cx } from "./ui";
import { useRouter } from "next/navigation";

export function runModelsLabel(models: string[], max = 3) {
  const short = models.map((m) => m.replace(/^sim\//, ""));
  return short.length <= max ? short.join(", ") : `${short.slice(0, max).join(", ")} +${short.length - max}`;
}

export default function RunsList({ runs, compact = false }: { runs: EvalRun[]; compact?: boolean }) {
  const router = useRouter();
  return (
    <>
    {/* Phones: one card per run */}
    <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white sm:hidden">
      {runs.map((r) => {
        const p = r.progress.total ? r.progress.done / r.progress.total : 0;
        return (
          <li key={r.id}>
            <Link href={runHref(r.id)} className="block px-4 py-3 transition-colors active:bg-zinc-50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-zinc-900">{r.name}</div>
                  <div className="truncate font-mono text-[12px] text-zinc-400">{r.id}</div>
                </div>
                <RunStatusBadge status={r.status} />
              </div>
              <div className="mt-2 flex items-center gap-2.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                  <div className={cx("h-full rounded-full", r.status === "failed" ? "bg-rose-500" : r.status === "completed" ? "bg-zinc-400" : "bg-accent")}
                    style={{ width: `${p * 100}%` }} />
                </div>
                <span className="text-[12px] text-zinc-500 tnum">{r.progress.done}/{r.progress.total}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-zinc-500">
                <span className="truncate font-mono">{runModelsLabel(r.models, 2)}</span>
                <span>{r.taskIds.length} tasks</span>
                {!compact && <span className="capitalize">{r.guardrail}</span>}
                <span className="ml-auto">{ago(r.createdAt)}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
    <Table className="max-sm:hidden" stickyFirst>
      <thead>
        <tr>
          <Th>Run</Th>
          <Th>Status</Th>
          <Th>Models</Th>
          <Th align="right">Tasks</Th>
          <Th className="w-[180px]">Progress</Th>
          {!compact && <Th>Guardrail</Th>}
          <Th align="right">Started</Th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => {
          const p = r.progress.total ? r.progress.done / r.progress.total : 0;
          return (
            <Tr key={r.id} onClick={() => router.push(runHref(r.id))}>
              <Td className="max-w-[260px] max-lg:max-w-[200px]">
                <Link href={runHref(r.id)} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-zinc-900 hover:text-accent">{r.name}</Link>
                <div className="font-mono text-[11.5px] text-zinc-400">{r.id}</div>
              </Td>
              <Td><RunStatusBadge status={r.status} /></Td>
              <Td className="whitespace-nowrap font-mono text-[12px] text-zinc-600"><span title={r.models.join(", ")}>{runModelsLabel(r.models, 2)}</span></Td>
              <Td align="right" className="text-zinc-700">{r.taskIds.length}</Td>
              <Td>
                <div className="flex items-center gap-2.5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                    <div className={cx("h-full rounded-full", r.status === "failed" ? "bg-rose-500" : r.status === "completed" ? "bg-zinc-400" : "bg-accent")}
                      style={{ width: `${p * 100}%` }} />
                  </div>
                  <span className="w-[64px] text-right text-[12px] text-zinc-500 tnum">{r.progress.done}/{r.progress.total}</span>
                </div>
              </Td>
              {!compact && <Td className="capitalize text-zinc-600">{r.guardrail}</Td>}
              <Td align="right" className="whitespace-nowrap text-zinc-500" >{ago(r.createdAt)}</Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
    </>
  );
}
