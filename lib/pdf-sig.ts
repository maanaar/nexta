// Fingerprints of PDF content. A job's fingerprint changes when any of its
// files is replaced or a new print (_2, _3 …) is added, which is how Nexta
// notices a report changed after it was sent. Pure hashing, no database.
import crypto from "crypto";
import fs from "fs";

export function hashBytes(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/** One fingerprint for a job's files, in print order. */
export function combineHashes(hashes: string[]): string {
  return crypto.createHash("sha256").update(hashes.join("|")).digest("hex");
}

// Reading a file is only needed when it changed on disk, so repeated syncs
// cost a stat() per file. Bounded so a huge archive can't grow it forever.
const MAX_CACHED = 5000;
const cache = new Map<string, { size: number; mtimeMs: number; hash: string }>();

/** SHA-256 of a file's content, re-read only when its size or modified time changed. */
export function fileHash(file: string): string {
  const stat = fs.statSync(file);
  const hit = cache.get(file);
  if (hit && hit.size === stat.size && hit.mtimeMs === stat.mtimeMs) return hit.hash;
  const hash = hashBytes(fs.readFileSync(file));
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
  cache.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, hash });
  return hash;
}

/** Fingerprint of a job's PDF files on disk. */
export function signFiles(files: string[]): string {
  return combineHashes(files.map(fileHash));
}
