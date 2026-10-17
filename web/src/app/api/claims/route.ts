import { NextResponse } from "next/server";
import { fileClaim, listClaims } from "@/lib/claims";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ claims: listClaims() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { transactionId, complaint } = body as { transactionId?: string; complaint?: string };
  if (!transactionId) return NextResponse.json({ error: "transactionId required" }, { status: 400 });
  try {
    const claim = await fileClaim(transactionId, complaint?.trim() || "The agent bought the wrong thing.");
    return NextResponse.json(claim);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}
