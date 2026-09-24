// Runs once when the Next.js server starts.
export async function register() {
  // better-sqlite3 and fs only exist in the Node.js runtime, not the edge runtime
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startEtiamWatcher } = await import("./lib/etiam-sync");
    startEtiamWatcher();
  }
}
