import { NextResponse } from "next/server";

/**
 * Turns an unexpected error in an API route into a readable JSON answer (and
 * logs it), instead of an empty 500 the browser can't explain.
 */
export function apiError(err: unknown, where: string) {
  console.error(`${where} failed:`, err);
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: `${where} failed: ${message}` }, { status: 500 });
}
