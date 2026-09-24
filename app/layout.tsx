import type { Metadata } from "next";
import { Inter, Montserrat_Alternates } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { SearchProvider } from "@/context/SearchContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const montserratAlternates = Montserrat_Alternates({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-montserrat-alternates",
});

export const metadata: Metadata = {
  title: "Nexta",
  description: "Track study reports from print to WhatsApp delivery.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${montserratAlternates.variable} h-full`}>
      <body className="min-h-full font-sans">
        <SearchProvider>
          <AppShell>{children}</AppShell>
        </SearchProvider>
      </body>
    </html>
  );
}
