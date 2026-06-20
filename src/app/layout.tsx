import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { DisclaimerDialog } from "@/components/DisclaimerDialog";

const inter = Inter({
  variable: "--font-inter",
  weight: ["300", "400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AfriCred",
  description: "Credit vaults for SME lending.",
};

/**
 * Pre-paint theme bootstrap. Reads the persisted theme from localStorage and
 * applies `theme-light` or `theme-dark` on <html> before any CSS evaluates,
 * which avoids the flash that would happen if we waited for React to mount.
 */
const themeBootstrap = `(function(){try{var s=localStorage.getItem('africred-theme');var t=s||'light';document.documentElement.classList.toggle('theme-light',t==='light');document.documentElement.classList.toggle('theme-dark',t==='dark');}catch(e){document.documentElement.classList.add('theme-light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="bg-blobs font-sans">
        <Providers>
          <Nav />
          <main>{children}</main>
          <DisclaimerDialog />
        </Providers>
      </body>
    </html>
  );
}
