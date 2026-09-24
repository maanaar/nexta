// components/PatientPdfViewer.tsx
"use client";
import { Download, ExternalLink, FileText } from "lucide-react";

export default function PatientPdfViewer({ pdfUrl }: { pdfUrl: string }) {
  const endpoint = `/api/admin/patient-pdf?url=${encodeURIComponent(pdfUrl)}`;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-ink-900">
          <FileText className="h-4 w-4 text-brand-500" />
          Report
        </h2>
        <div className="flex gap-2">
          <a
            href={endpoint}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" />
            Open
          </a>
          <a
            href={endpoint}
            download="patient-report.pdf"
            className="inline-flex items-center gap-1.5 rounded-lg bg-linear-to-r from-brand-600 to-teal-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        </div>
      </div>

      <object
        data={endpoint}
        type="application/pdf"
        className="min-h-[70vh] w-full flex-1 rounded-xl border border-slate-200 bg-slate-50"
      >
        <div className="flex h-[70vh] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
          PDF preview isn&apos;t available in this browser. Use Open or Download instead.
        </div>
      </object>
    </div>
  );
}
