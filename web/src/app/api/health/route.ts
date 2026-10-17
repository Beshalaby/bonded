// GET /api/health — liveness/readiness for load balancers and the Docker HEALTHCHECK. Public, no secrets.
import { execFile } from "node:child_process";
import { NextResponse } from "next/server";
import { read, storeStatus } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const g = globalThis as unknown as { __sbPyVer?: Promise<string | null> };

/** `python3 --version` (cached once it succeeds). Runs need Python, so null means runs will fail. */
function pythonVersion(): Promise<string | null> {
  if (!g.__sbPyVer) {
    g.__sbPyVer = new Promise((resolve) => {
      execFile(process.env.PYTHON || "python3", ["--version"], { timeout: 3000 }, (err, stdout, stderr) => {
        const m = /Python\s+(\S+)/.exec(`${stdout} ${stderr}`);
        resolve(err || !m ? null : m[1]);
      });
    });
    g.__sbPyVer.then((v) => { if (!v) g.__sbPyVer = undefined; });
  }
  return g.__sbPyVer;
}

export async function GET() {
  const s = storeStatus();
  let products = 0, results = 0, ok = s.loaded;
  let error: string | undefined;
  try {
    const db = read();
    products = db.products.length;
    results = db.benchResults.length;
    ok = true;
  } catch (e) {
    ok = false;
    error = (e as Error).message.replace(/postgres(ql)?:\/\/[^\s]+/g, "postgres://***");
  }
  // A store whose last flush failed is serving, but not durable: report it without failing liveness.
  const lastFlush = s.lastFlush ? { at: s.lastFlush.at, ok: s.lastFlush.ok } : null;
  const body = {
    ok, store: s.store, products, results,
    uptimeS: Math.round(process.uptime()),
    python: await pythonVersion(),
    durable: !s.lastFlush || s.lastFlush.ok,
    lastFlush,
    ...(error ? { error } : {}),
  };
  return NextResponse.json(body, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
