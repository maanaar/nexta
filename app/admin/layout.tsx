"use client";

import AdminNavbar from "@/components/AdminNavbar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify- min-h-screen lg:mt-6 bg-admin gap-10">
      <AdminNavbar/>
      
      <main className="flex-1 overflow-y-auto min-w-full mx-auto px-8 py-8">
        {children}
      </main>
    </div>
  );
}