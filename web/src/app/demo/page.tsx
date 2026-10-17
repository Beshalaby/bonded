import DemoPanel from "@/components/DemoPanel";
import LiveFeed from "@/components/LiveFeed";
import { recentTransactions } from "@/components/data";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function DemoPage() {
  return (
    <div>
      <PageHeader title="Demo control panel" subtitle="The 2-minute pitch, one button per beat. Every step runs real agents against the live Arena." />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3"><DemoPanel /></div>
        <div className="lg:col-span-2">
          <Card title="Live transactions" pad={false} className="lg:sticky lg:top-20"><LiveFeed initial={recentTransactions(12)} limit={12} /></Card>
        </div>
      </div>
    </div>
  );
}
