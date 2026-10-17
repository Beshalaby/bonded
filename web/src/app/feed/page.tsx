import LiveFeed from "@/components/LiveFeed";
import { recentTransactions } from "@/components/data";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function FeedPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Live feed" subtitle="Server-sent events from /api/feed — every transaction and Guardian verdict as it happens." />
      <Card pad={false}><LiveFeed initial={recentTransactions(50)} limit={50} /></Card>
    </div>
  );
}
