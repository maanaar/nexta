"use client";

import { Montserrat_Alternates } from 'next/font/google';
import './globals.css';
import { usePathname } from 'next/navigation';
import Navbar from '@/components/AdminNavbar';

const montserratAlternates = Montserrat_Alternates({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-montserrat-alternates',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  
  const pathname = usePathname();
  const hideNavbar = pathname === "/login";
  const isAdminPage = pathname?.startsWith('/admin') || pathname?.startsWith('/organizer') || pathname?.startsWith('/patients');
  
  return (
    <html lang="en" className="h-full">
      <body className="h-full min-h-screen">
        {!hideNavbar && !isAdminPage && (
          <>
            <div className="h-2 lg:h-2"></div>
            <Navbar />
          </>
        )}
        {children}
      </body>
    </html>
  );
}
