// Turns an HTML page into a PDF with a headless Chrome or Edge, so a report designed as a web page can be
// sent on WhatsApp (which accepts PDFs, not HTML). The browser gets its own throw-away profile, so it never
// clashes with one that is already open on the server.
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { getConfig } from "@/lib/config";

const TIMEOUT_MS = 60_000;

const WINDOWS_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const OTHER_CANDIDATES = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

/** The browser to use: the one set in Server settings, or the first Chrome / Edge found. */
export function findBrowser(configured: string = getConfig().browserPath): string | null {
  const candidates = [configured];
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA;
    if (local) candidates.push(path.join(local, "Google", "Chrome", "Application", "chrome.exe"));
    candidates.push(...WINDOWS_CANDIDATES);
  } else {
    candidates.push(...OTHER_CANDIDATES);
  }
  for (const c of candidates) {
    if (!c) continue;
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      // not here
    }
  }
  return null;
}

/** HTML in, PDF bytes out. Throws a plain-English error when no browser is found or it fails. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = findBrowser();
  if (!browser) {
    throw new Error("No Chrome or Edge was found on this server to make the report PDF. Install one, or set its path in Server settings.");
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "nexta-report-"));
  const page = path.join(work, "report.html");
  const out = path.join(work, "report.pdf");
  fs.writeFileSync(page, html, "utf8");

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        browser,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-sandbox",
          "--no-first-run",
          "--no-pdf-header-footer",
          `--user-data-dir=${path.join(work, "profile")}`,
          `--print-to-pdf=${out}`,
          `file:///${page.replace(/\\/g, "/")}`,
        ],
        { stdio: "ignore", windowsHide: true }
      );
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Making the report PDF took too long."));
      }, TIMEOUT_MS);
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Couldn't start the browser to make the report PDF: ${err.message}`));
      });
      child.on("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    if (!fs.existsSync(out)) throw new Error("The browser didn't produce the report PDF.");
    // Chrome may still be flushing the file when it exits: give it a moment to settle
    for (let i = 0; i < 10; i++) {
      const size = fs.statSync(out).size;
      await new Promise((r) => setTimeout(r, 150));
      if (fs.statSync(out).size === size && size > 0) break;
    }
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
