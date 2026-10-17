// OWNER: Team 1. POST {reset?, wipe?, seed?} — (re)seed the Arena catalog.
import { body, handle, seedArena } from "@/lib/arena";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await body<{ reset?: boolean; wipe?: boolean; seed?: number }>(req);
  return handle(() => seedArena(b));
}
export async function GET() {
  return handle(() => seedArena({}));
}
