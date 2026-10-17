import type { BenchResult } from "./types";

const INFRA = /HTTP 5\d\d|HTTP 429|timeout|timed out|connection|URLError|RemoteDisconnected|OPENROUTER|rate limit|CERTIFICATE_VERIFY_FAILED|network error/i;

/** The episode died from infrastructure (network, rate limit, provider outage) before the agent bought anything.
 *  Such results say nothing about the agent, so leaderboards treat them as ungraded rather than failed. */
export function isInfraError(r: Pick<BenchResult, "error" | "bought">): boolean {
  return !!r.error && !r.bought && INFRA.test(r.error);
}
