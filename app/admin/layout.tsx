"use client";
import AdminNavbar from "@/components/AdminNavbar";
import { SearchProvider } from "@/context/SearchContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SearchProvider>
      <div className="flex flex-col min-h-screen bg-admin gap-10 pt-12">
        <AdminNavbar />
        <main className="flex-1 overflow-y-auto min-w-full mx-auto px-8 py-8">
          {children}
        </main>
      </div>
    </SearchProvider>
  );
}