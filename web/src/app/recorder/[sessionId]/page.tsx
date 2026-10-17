import Link from "next/link";
import RecorderView from "@/components/RecorderView";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RecorderSession({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return (
    <div>
      <PageHeader
        title={<>Flight recorder <span className="font-mono text-lg text-zinc-400">{sessionId}</span></>}
        subtitle="Every agent action, Guardian verdict, risk quote and adjuster decision — hash-chained and tamper-evident."
        right={<Link href="/recorder" className="text-sm text-zinc-400 hover:text-white">← all sessions</Link>}
      />
      <RecorderView sessionId={sessionId} />
    </div>
  );
}
