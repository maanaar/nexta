// Runs once when the Next.js server starts.
export async function register() {
  // better-sqlite3 and fs only exist in the Node.js runtime, not the edge runtime
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startEtiamWatcher } = await import("./lib/etiam-sync");
    startEtiamWatcher();
    // Compresses PDFs from the folder before compression into the PDF folder, when one is set
    const { startCompressor } = await import("./lib/pdf-compress");
    startCompressor();
    // Sends ready reports over WhatsApp when "Send reports automatically" is on
    const { startSender } = await import("./lib/sender");
    startSender();
  }
}
