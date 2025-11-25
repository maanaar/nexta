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
// {montserratAlternates.className}
  return (
    <html lang="en">
      <body className="bg-admin mt-2">
      <div className="h-2 lg:h-2"></div>
        {!hideNavbar && <Navbar />}   {/* ✔ correct */}
        {children}                     {/* ✔ correct */}
      </body>
    </html>
  );
}
