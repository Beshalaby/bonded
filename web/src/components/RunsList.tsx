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
    <Table>
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
              <Td className="max-w-[260px]">
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
  );
}
