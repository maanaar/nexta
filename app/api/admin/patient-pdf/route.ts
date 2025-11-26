/* app/api/admin/patient-pdf/route.ts */
import { NextResponse } from "next/server";
import { FALLBACK_PDF_URL } from "@/lib/patient-data";


export async function GET(req: Request) {
const { searchParams } = new URL(req.url);
const url = searchParams.get("url");


if (!url) {
return NextResponse.json({ error: "Missing 'url' query parameter" }, { status: 400 });
}


const headers = new Headers({
"Content-Type": "application/pdf",
"Cache-Control": "max-age=0, s-maxage=60",
"Content-Disposition": `inline; filename="patient.pdf"`,
});


try {
const response = await fetch(url);
if (!response.ok) throw new Error(`Remote PDF fetch failed: ${response.status}`);
const buffer = await response.arrayBuffer();
return new Response(buffer, { headers });
} catch (err) {
console.error("PDF proxy error:", err);
// fallback
try {
const fb = await fetch(FALLBACK_PDF_URL);
const fbBuffer = await fb.arrayBuffer();
return new Response(fbBuffer, { headers });
} catch (fbErr) {
console.error("Fallback PDF fetch failed:", fbErr);
return NextResponse.json({ error: "Failed to load PDF" }, { status: 502 });
}
}
}