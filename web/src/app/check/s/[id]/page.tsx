// A listing an agent vetted and sent to its user instead of buying it (MCP send_listing). Read-only.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sentListing } from "@/lib/shield/web/service";
import { VerdictView } from "../../Verdict";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const s = sentListing((await params).id);
  return s ? { title: s.listing.title.slice(0, 60), description: s.verdict.headline } : { title: "Listing not found" };
}

export default async function Page({ params }: { params: Params }) {
  const s = sentListing((await params).id);
  if (!s) notFound();
  return (
    <div className="relative isolate -mx-4 overflow-x-clip px-4 pb-10 pt-6 sm:-mx-8 sm:px-8 sm:pt-10">
      <VerdictView l={s.listing} v={s.verdict} note={{ by: s.agent, text: s.note }} />
      <p className="mt-10 text-center text-[13px] text-ink-4">
        Sent {new Date(s.createdAt).toUTCString().replace(/:\d\d GMT/, " UTC")} ·{" "}
        <Link href={`/check?u=${encodeURIComponent(s.url)}`} className="text-ink-3 underline-offset-4 hover:text-ink hover:underline">Check it again now</Link>
      </p>
    </div>
  );
}
