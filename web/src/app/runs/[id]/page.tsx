import RunView from "./RunView";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Run ${decodeURIComponent(id)}` };
}
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunView id={decodeURIComponent(id)} />;
}
