"use client";

import { usePathname } from "next/navigation";
import AdminNavbar from "@/components/AdminNavbar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-col">
      <AdminNavbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
