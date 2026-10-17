// Finds which PDFs belong to which job when the file name only *contains* the
// job's accession number / patient ID: 112344_330930.pdf, 4544_330930_45456.pdf.
//
// A key matches only as a whole piece of the name: it must have a non-letter,
// non-digit character (or the start / end of the name) on both sides. So 330930
// is found in "4544_330930_45456" but never in "1330930" or "3309301". Keys with
// letters or dashes ("AB-123") work the same way.
//
// Pure functions with no imports, so they can be tested on their own.

const ALNUM = /[\p{L}\p{N}]/u;
const ALNUM_RUN = /[\p{L}\p{N}]+/gu;

/** The most pieces joined together when looking for a key like "AB-123" inside a name. */
const MAX_PIECES = 6;

type Piece = { text: string; start: number; end: number };

function pieces(text: string): Piece[] {
  return [...text.matchAll(ALNUM_RUN)].map((m) => ({ text: m[0], start: m.index!, end: m.index! + m[0].length }));
}

/** "112344_330930.pdf" -> "112344_330930" */
export function stemOf(fileName: string): string {
  return fileName.replace(/\.pdf$/i, "");
}

/** Whether `key` appears in `stem` as a whole piece (see the top of this file). Case-insensitive. */
export function containsKey(stem: string, key: string): boolean {
  const s = stem.toLowerCase();
  const k = key.toLowerCase().trim();
  if (!k) return false;
  for (let at = s.indexOf(k); at !== -1; at = s.indexOf(k, at + 1)) {
    const end = at + k.length;
    const before = at === 0 || !ALNUM.test(s[at - 1]);
    const after = end === s.length || !ALNUM.test(s[end]);
    if (before && after) return true;
  }
  return false;
}

type Candidate = { key: string; first: number; last: number };

/** Every run of consecutive pieces of a name, as it is written, lower-cased: "ab-123" from "x_AB-123_9". */
function candidates(stem: string): Candidate[] {
  const ps = pieces(stem);
  const out: Candidate[] = [];
  for (let i = 0; i < ps.length; i++) {
    for (let j = i; j < Math.min(ps.length, i + MAX_PIECES); j++) {
      out.push({ key: stem.slice(ps[i].start, ps[j].end).toLowerCase(), first: i, last: j });
    }
  }
  return out;
}

/** Every known key (see `isKnown`) that a file name contains. Used to find the jobs a new file may be for. */
export function allKeysIn(stem: string, isKnown: (key: string) => boolean): string[] {
  return [...new Set(candidates(stem).filter((c) => isKnown(c.key)).map((c) => c.key))];
}

/**
 * The known keys a file name is *about*: like allKeysIn, but a key that is only
 * part of a longer known key ("123" inside "AB-123") doesn't count. More than
 * one result means the name points at several jobs, so it can't be trusted for any.
 */
export function keysOf(stem: string, isKnown: (key: string) => boolean): string[] {
  const hits = candidates(stem).filter((c) => isKnown(c.key));
  const inside = (h: Candidate, o: Candidate) =>
    o !== h && o.first <= h.first && o.last >= h.last && (o.first < h.first || o.last > h.last);
  return [...new Set(hits.filter((h) => !hits.some((o) => inside(h, o))).map((h) => h.key))];
}

/**
 * The PDF folder's file names, indexed by the pieces of each name, so the files
 * that may contain a key are found without going through every file.
 */
export class FolderIndex {
  private files = new Map<string, string[]>();
  private byPiece = new Map<string, Set<string>>();

  get size() {
    return this.files.size;
  }

  clear() {
    this.files.clear();
    this.byPiece.clear();
  }

  add(fileName: string) {
    this.remove(fileName);
    const words = pieces(stemOf(fileName)).map((p) => p.text.toLowerCase());
    this.files.set(fileName, words);
    for (const word of new Set(words)) {
      let names = this.byPiece.get(word);
      if (!names) this.byPiece.set(word, (names = new Set()));
      names.add(fileName);
    }
  }

  remove(fileName: string) {
    const words = this.files.get(fileName);
    if (!words) return;
    this.files.delete(fileName);
    for (const word of new Set(words)) {
      const names = this.byPiece.get(word);
      names?.delete(fileName);
      if (names?.size === 0) this.byPiece.delete(word);
    }
  }

  /** File names that contain `key` as a whole piece. */
  filesContaining(key: string): string[] {
    const first = pieces(key)[0]?.text.toLowerCase();
    if (!first) return [];
    return [...(this.byPiece.get(first) ?? [])].filter((name) => containsKey(stemOf(name), key));
  }
}
