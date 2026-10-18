"use client";
import { useRef } from "react";
import { Plus } from "lucide-react";
import RunsList from "@/components/RunsList";
import { ButtonLink, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui";
import { useEvents } from "@/components/useEvents";
import { useApi, type RunsResponse } from "@/lib/ui/api";

export default function RunsView() {
  const { data, error, loading, reload } = useApi<RunsResponse>("/api/runs");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEvents(["run"], () => {
    if (t.current) return;
    t.current = setTimeout(() => { t.current = null; reload(); }, 800);
  });
  const runs = data?.runs ?? [];
  return (
    <>
      <PageHeader tone="sky" title="Runs"
        description="Each run evaluates a set of models on a set of tasks. Results stream in as each task is graded."
        actions={<ButtonLink href="/runs/new" variant="secondary"><Plus size={14} /> New run</ButtonLink>} />
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data ? <LoadingBlock /> : runs.length ? <RunsList runs={runs} /> : !error && (
        <EmptyState title="No runs yet" description="Start a run to grade models against the task suite."
          action={<ButtonLink href="/runs/new">New run</ButtonLink>} />
      )}
    </>
  );
}
