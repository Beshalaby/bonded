import { NextResponse } from "next/server";
import { ingestResults } from "@/lib/bench";
import { read } from "@/lib/db";

export const dynamic = "force-dynamic";

/** POST {results: BenchResult[]} → stores, recomputes model priors. */
export async function POST(req: Request) {
  let body: { results?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const results = Array.isArray(body?.results) ? body.results : Array.isArray(body) ? (body as unknown[]) : null;
  if (!results) return NextResponse.json({ error: "expected {results: BenchResult[]}" }, { status: 400 });
  return NextResponse.json(ingestResults(results));
}

/** GET ?runId=&model=&limit= → raw stored results (newest first). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const runId = u.searchParams.get("runId");
  const model = u.searchParams.get("model");
  const limit = Math.min(Number(u.searchParams.get("limit") ?? 500) || 500, 5000);
  let rs = read().benchResults;
  if (runId) rs = rs.filter((r) => r.runId === runId);
  if (model) rs = rs.filter((r) => r.model === model);
  return NextResponse.json({ results: rs.slice(-limit).reverse(), total: rs.length });
}
