import TraceView from "./TraceView";
export async function generateMetadata({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return { title: `Trace ${decodeURIComponent(sessionId)}` };
}
export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <TraceView sessionId={decodeURIComponent(sessionId)} />;
}
