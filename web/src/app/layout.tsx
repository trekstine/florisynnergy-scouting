import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/components/Providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Florisynergy IPM",
  description: "Geofenced scouting, spraying & agronomy for flower farms.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/brand/florisynergy-mark.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
