// components/PatientPdfViewer.tsx
"use client";
import { Download, ExternalLink } from "lucide-react";

export default function PatientPdfViewer({ pdfUrl }: { pdfUrl: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-2">
        <a
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
        >
          <ExternalLink className="h-4 w-4" />
          Open
        </a>
        <a
          href={`${pdfUrl}?download`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-linear-to-r from-brand-600 to-teal-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      </div>

      <object data={pdfUrl} type="application/pdf" className="h-[75vh] w-full rounded-xl border border-slate-200 bg-slate-50">
        <div className="flex h-[75vh] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
          This browser can&apos;t preview PDFs here. Use Open or Download instead.
        </div>
      </object>
    </div>
  );
}
