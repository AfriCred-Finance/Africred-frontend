import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "AfriCred",
  description: "Epoch-based credit vaults for SME lending.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <Providers>
          <Nav />
          <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
