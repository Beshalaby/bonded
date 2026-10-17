// Route helpers for the eval API.
import { NextResponse } from "next/server";

/** Any error carrying a numeric `status` (ArenaError, RunError) maps to that HTTP status. */
export async function respond(fn: () => unknown | Promise<unknown>) {
  try {
    return NextResponse.json(await fn());
  } catch (e) {
    const status = typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : 500;
    if (status >= 500) console.error("[api]", e);
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status });
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function jsonBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}

export function intParam(v: string | null, def: number, min: number, max: number) {
  const n = Math.floor(Number(v ?? def));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def;
}
