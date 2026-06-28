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

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ??
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ??
  "http://localhost:3000";

const miniAppEmbed = {
  version: "1",
  imageUrl: `${APP_URL}/africred-logo.png`,
  button: {
    title: "Earn yield",
    action: {
      type: "launch_miniapp",
      name: "AfriCred",
      url: `${APP_URL}/vaults`,
      splashImageUrl: `${APP_URL}/africred-logo.png`,
      splashBackgroundColor: "#F5F1E8",
    },
  },
};

export const metadata: Metadata = {
  title: "AfriCred",
  description: "Credit vaults for SME lending.",
  other: {
    "fc:miniapp": JSON.stringify(miniAppEmbed),
    "fc:frame": JSON.stringify(miniAppEmbed),
  },
};

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
