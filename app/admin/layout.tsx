"use client";

import AdminNavbar from "@/components/AdminNavbar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-admin">
      <AdminNavbar/>
      
      <main className="flex-1 overflow-y-auto w-full max-w-6xl mx-auto px-8 py-8">
        {children}
      </main>
    </div>
  );
}