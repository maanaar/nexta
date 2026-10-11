// components/PatientPdfViewer.tsx
"use client";
import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText } from "lucide-react";

type Pdf = { label: string; url: string };

/** Shows a job's PDFs; one tab per file when an accession was printed more than once. */
export default function PatientPdfViewer({ pdfs }: { pdfs: Pdf[] }) {
  const [active, setActive] = useState(0);
  // A new print (e.g. 330930_2.pdf) can arrive while the page is open
  useEffect(() => {
    if (active >= pdfs.length) setActive(0);
  }, [pdfs.length, active]);
  const pdf = pdfs[Math.min(active, pdfs.length - 1)];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {pdfs.map((p, i) => (
            <button
              key={p.url}
              type="button"
              onClick={() => setActive(i)}
              title={p.label}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                p.url === pdf.url ? "bg-white text-brand-600 shadow-sm" : "text-slate-500 hover:text-ink-900"
              }`}
            >
              <FileText className="h-4 w-4" />
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <a
            href={pdf.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" />
            Open
          </a>
          <a
            href={`${pdf.url}&download`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-linear-to-r from-brand-600 to-teal-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        </div>
      </div>

      <object key={pdf.url} data={pdf.url} type="application/pdf" className="h-[75vh] w-full rounded-xl border border-slate-200 bg-slate-50">
        <div className="flex h-[75vh] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
          This browser can&apos;t preview PDFs here. Use Open or Download instead.
        </div>
      </object>
    </div>
  );
}
