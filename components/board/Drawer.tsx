"use client";

import { useEffect } from "react";

/** A panel that slides in from the right over the page. The wrapper clips it, so a closed drawer never widens the page. */
export default function Drawer({
  open,
  onClose,
  z = 50,
  children,
}: {
  open: boolean;
  onClose: () => void;
  z?: number;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 overflow-hidden ${open ? "" : "pointer-events-none"}`} style={{ zIndex: z }} aria-hidden={!open}>
      <div onClick={onClose} className={`absolute inset-0 bg-ink-950/40 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} />
      <aside
        role="dialog"
        aria-modal="true"
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {open && children}
      </aside>
    </div>
  );
}
