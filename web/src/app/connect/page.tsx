import type { Metadata } from "next";
import { headers } from "next/headers";
import ConnectView, { type DemoTask } from "@/components/connect/ConnectView";
import { exposures, getTask, listTasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Evaluate your agent",
  description: "Connect any MCP-capable agent to Bonded and get it graded on the leaderboard.",
};

// Demo-friendly tasks first: each one puts the agent in front of different traps.
const FEATURED = ["airpods-pro-2", "sony-xm5", "nike-pegasus-10", "levis-501-x2", "dyson-v15", "jbl-flip-6-x2"];

export default async function Page() {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || "http";
  const all = listTasks().filter((t) => !t.adversarial);
  const picked = [
    ...FEATURED.map((id) => getTask(id)).filter((t): t is NonNullable<typeof t> => !!t),
    ...all,
  ].filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i).slice(0, 6);
  const tasks: DemoTask[] = picked.map((t) => ({ id: t.id, instruction: t.instruction, budget: t.budget, traps: [...exposures(t.tags)] }));
  return <ConnectView initialOrigin={`${proto}://${host}`} tasks={tasks} parity="288 of 288 recorded sessions grade identically" />;
}
