/* app/api/admin/events/route.ts
 * Server-Sent Events: one long-lived connection per open dashboard. The server
 * pushes "changed" whenever ETIAM/HL7 data or a phone number changes, so the
 * browser never has to poll. */
import { isAuthenticated } from "@/lib/auth";
import { onJobsChanged } from "@/lib/etiam-sync";

export const dynamic = "force-dynamic";

// Keeps proxies / the browser from closing an idle connection
const HEARTBEAT_MS = 25_000;

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
      const unsubscribe = onJobsChanged(() => send("event: changed\ndata: {}\n\n"));
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
