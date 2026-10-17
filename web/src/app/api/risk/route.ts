import { NextResponse } from "next/server";
import { riskSnapshot } from "@/lib/risk";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(riskSnapshot());
}
