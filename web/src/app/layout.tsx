import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "SpendBench", template: "%s · SpendBench" },
  description: "How safely do AI agents spend money? An evaluation of shopping agents against scams, injections and budget traps.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Nav />
        <main className="mx-auto max-w-[1200px] px-5 pb-24 pt-8 sm:px-8">{children}</main>
      </body>
    </html>
  );
}
