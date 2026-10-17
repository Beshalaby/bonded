import TracesView from "./TracesView";
export const metadata = { title: "Traces" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <TracesView initialModel={sp.model ?? ""} initialRun={sp.runId ?? ""} />;
}
