import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import { MicroLabel, MotionProvider } from "@/design";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Bonded — trust infrastructure for AI agents that spend money", template: "%s · Bonded" },
  description: "How safely do AI agents spend money? An evaluation of shopping agents against scams, injections and budget traps.",
};

// The browser chrome (and iOS overscroll) takes the canvas colour.
export const viewport: Viewport = { themeColor: "#f7f6f4", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <MotionProvider>
          <Nav />
          <main className="mx-auto max-w-[1200px] px-4 pb-24 pt-8 sm:px-8 sm:pt-12">{children}</main>
          <footer className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pb-10 sm:px-8">
            <MicroLabel className="!text-[10px] !text-ink-4">Bonded · trust infrastructure for agents that spend money</MicroLabel>
            <MicroLabel className="!text-[10px] !text-ink-4">Every step hash-chained</MicroLabel>
          </footer>
        </MotionProvider>
      </body>
    </html>
  );
}
