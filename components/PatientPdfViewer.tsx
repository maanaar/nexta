// components/PatientPdfViewer.tsx
"use client";
import React from "react";


export default function PatientPdfViewer({ pdfUrl }: { pdfUrl: string }) {
const endpoint = `/api/admin/patient-pdf?url=${encodeURIComponent(pdfUrl)}`;


return (
<div className="flex flex-row min-w-full gap-y-3">
<object
data={endpoint}
type="application/pdf"
className="w-full min-h-[420px] rounded-xl border border-gray-200 bg-white"
>
<div className="flex h-[420px] items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-600">
PDF preview is loading or not available yet.
</div>
</object>


<a
href={endpoint}
target="_blank"
rel="noreferrer"
className="inline-flex items-center justify-center h-10 w-30 rounded-full bg-cyan-600 px-4 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-cyan-500"
>
Download PDF
</a>
</div>
);
}