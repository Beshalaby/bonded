// GET -> text/event-stream of FeedEvent (event: <type>, data: FeedEvent JSON). ?types=run,result filters. Keepalive every 15s.
import { bus } from "@/lib/events";
import type { FeedEvent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const enc = new TextEncoder();
  const types = new URL(req.url).searchParams.get("types")?.split(",").filter(Boolean);
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (s: string) => {
        if (closed) return;
        try { controller.enqueue(enc.encode(s)); } catch { cleanup(); }
      };
      const onEvent = (ev: FeedEvent) => {
        if (types && !types.includes(ev.type)) return;
        send(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
      };
      const ping = setInterval(() => send(`: ping ${Date.now()}\n\n`), 15000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        bus.off("event", onEvent);
        try { controller.close(); } catch {}
      };
      bus.on("event", onEvent);
      send(`retry: 3000\nevent: hello\ndata: {"ok":true}\n\n`);
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
