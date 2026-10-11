/* app/api/admin/events/route.ts
 * Server-Sent Events: one long-lived connection per open dashboard. The server
 * pushes "changed" with the ids of the jobs that changed (ETIAM, HL7, PDFs, a
 * phone save or card move), so the browser never polls and only refetches those. */
import { isAuthenticated } from "@/lib/auth";
import { onJobsChanged } from "@/lib/etiam-sync";

export const dynamic = "force-dynamic";

// Keeps proxies / the browser from closing an idle connection
const HEARTBEAT_MS = 25_000;
// Above this many changed jobs, tell tabs to reload their whole range instead
const MAX_IDS = 200;

export async function GET(req: Request) {
  if (!(await isAuthenticated())) {
    return new Response("Not signed in", { status: 401 });
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      send("retry: 3000\n\n");
      // Which jobs changed, so tabs fetch only those; a long list means "reload everything"
      const unsubscribe = onJobsChanged((ids) =>
        send(`event: changed\ndata: ${JSON.stringify(ids && ids.length <= MAX_IDS ? { ids } : {})}\n\n`)
      );
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
