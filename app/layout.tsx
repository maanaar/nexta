import { Montserrat_Alternates } from 'next/font/google';
import './globals.css';
import { usePathname } from 'next/navigation'
import Navbar from '@/components/AdminNavbar'

const montserratAlternates = Montserrat_Alternates({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'], // Choose the weights you need
  variable: '--font-montserrat-alternates',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname()
  const hideNavbar = pathname === '/login'
  return (
    <html lang="en">
      <body className={montserratAlternates.className}>
        <Navbar/>
        {children}
      </body>
    </html>
  );
}