// GET -> {mode: "open"|"token"|"closed", admin: boolean}. Public; drives /login and the AdminBadge.
import { NextResponse } from "next/server";
import { authMode, isAdminRequest } from "@/lib/auth";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const mode = authMode();
  return NextResponse.json({ mode, admin: mode === "token" ? await isAdminRequest(req) : mode === "open" });
}
