"use client";

import { usePathname } from 'next/navigation'
import Navbar from "@/components/AdminNavbar";


export default function NavbarWrapper() {
    const path = usePathname();
    const hidenavbar = path === '/login';
    const isAdminPage = path?.startsWith('/admin') || path?.startsWith('/organizer') || path?.startsWith('/patients');

  // Don't render navbar here for admin pages - it's handled in admin layout
  if (isAdminPage || hidenavbar) {
    return null;
  }

  // For other pages, render navbar
  return (
    <div className="bg-transparent">
      <div className="h-2 lg:h-2"></div>
      <Navbar/>
    </div>
  )
}
