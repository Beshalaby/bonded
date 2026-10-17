import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bonded — insurance for AI agents that spend money",
  description: "Underwrite, guard, and insure AI shopping agents. SpendBench, Guardian, Flight Recorder, Claims.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Nav />
        <main className="mx-auto max-w-7xl px-4 sm:px-6 pb-20 pt-6">{children}</main>
      </body>
    </html>
  );
}
