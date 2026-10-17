// POST {runId?, results: BenchResult[]} (Python runner) -> {stored, failures}. Failures get an attribution;
// publishes `result` events and `run` progress.
// GET ?runId=&model=&limit= -> {results (newest first), total}
import { NextResponse } from "next/server";
import { ingestResults } from "@/lib/bench";
import { read } from "@/lib/db";
import { intParam } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { results?: unknown; runId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const results = Array.isArray(body?.results) ? body.results : Array.isArray(body) ? (body as unknown[]) : null;
  if (!results) return NextResponse.json({ error: "expected {results: BenchResult[]}" }, { status: 400 });
  if (results.length > 1000) return NextResponse.json({ error: "at most 1000 results per request" }, { status: 413 });
  const runId = typeof body?.runId === "string" ? body.runId : undefined;
  return NextResponse.json(ingestResults(results, runId));
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const runId = u.searchParams.get("runId");
  const model = u.searchParams.get("model");
  const limit = intParam(u.searchParams.get("limit"), 500, 1, 5000);
  let rs = read().benchResults;
  if (runId) rs = rs.filter((r) => r.runId === runId);
  if (model) rs = rs.filter((r) => r.model === model);
  return NextResponse.json({ results: rs.slice(-limit).reverse(), total: rs.length });
}
