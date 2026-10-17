import LiveView from "./LiveView";

export const metadata = { title: "Live" };

export default async function Page({ searchParams }: { searchParams: Promise<{ replay?: string; model?: string; task?: string }> }) {
  const sp = await searchParams;
  return <LiveView replayId={sp.replay || undefined} initialModel={sp.model} initialTask={sp.task} />;
}
