import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import PageMain from "@/components/home/PageMain";
import SiteFooter from "@/components/home/SiteFooter";
import { MotionProvider } from "@/design";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Bonded: would you trust an AI with your wallet?", template: "%s · Bonded" },
  description: "We give AI agents a budget, a store full of scams, and grade every decision.",
};

// The browser chrome (and iOS overscroll) takes the canvas colour.
export const viewport: Viewport = { themeColor: "#fdfcfa", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="flex min-h-svh flex-col">
        <MotionProvider>
          <Nav />
          <PageMain>{children}</PageMain>
          <SiteFooter />
        </MotionProvider>
      </body>
    </html>
  );
}
