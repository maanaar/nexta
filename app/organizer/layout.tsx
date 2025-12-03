"use client";

import AdminNavbar from "@/components/AdminNavbar";
import { SearchProvider } from "@/context/SearchContext";


export default function organizerLayout({ children }: { children: React.ReactNode }) {
  return (
    <SearchProvider>
        <div className="flex flex-col min-h-screen bg-admin gap-10 pt-12">
          {/* <div className="h-2"></div> */}
          <AdminNavbar />
          <main className="flex-1 min-w-full mx-auto justify-center items-center px-8 py-8">
            {children}
          </main>
        </div>
    </SearchProvider>
  );
}