import { computeFindings, heroStats } from "@/lib/findings";
import HomeView from "./HomeView";

// Findings and hero counters are computed from the live store on every request; the client view calls
// router.refresh() when runs complete, so they stay current without a dedicated API route.
export const dynamic = "force-dynamic";

export default function Page() {
  return <HomeView hero={heroStats()} findings={computeFindings()} />;
}
