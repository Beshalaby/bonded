"use client";
// Try it on a real listing: one input pill that hands the link to /check, which fetches it, runs Bonded Shield and
// sends the vetted listing back instead of buying it.
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

export default function TryCheck() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const v = url.trim();
    if (!v) { router.push("/check"); return; }
    router.push(`/check?u=${encodeURIComponent(/^https?:\/\//i.test(v) ? v : `https://${v}`)}`);
  };
  return (
    <section aria-labelledby="try-check-title" className="relative isolate overflow-x-clip px-5 pb-24 pt-20 text-center sm:pb-36 sm:pt-28">
      <div aria-hidden className="burst burst-gold" style={{ ["--bx" as string]: "50%", ["--by" as string]: "62%", ["--bs" as string]: "min(980px, 140vw)", ["--bo" as string]: 0.7 }} />
      <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-ink-3">Bonded Shield</p>
      <h2 id="try-check-title" className="mx-auto mt-4 max-w-[16ch] font-[600] leading-[1] tracking-[-0.045em] text-ink [font-size:clamp(38px,5vw,64px)] [text-wrap:balance]">Try it on a real listing.</h2>
      <p className="mx-auto mt-5 max-w-[44ch] text-[16px] leading-[1.6] text-ink-3 sm:text-[17px]">Paste a link from eBay, Amazon or any store. Shield checks it like an agent would and sends it back. Nothing gets bought.</p>
      <form onSubmit={go} className="mx-auto mt-10 flex w-full max-w-[720px] items-center gap-2 rounded-full bg-surface py-2 pl-6 pr-2 shadow-float" aria-label="Check a listing">
        <label htmlFor="home-listing-url" className="sr-only">Listing link</label>
        <input id="home-listing-url" value={url} onChange={(e) => setUrl(e.target.value)} type="url" inputMode="url" autoComplete="off" spellCheck={false}
          placeholder="Paste a listing link" className="h-11 min-w-0 flex-1 bg-transparent text-left text-[16px] text-ink outline-none placeholder:text-ink-4" />
        <button type="submit" className="inline-flex h-11 shrink-0 items-center rounded-full bg-ink px-6 text-[15px] font-medium text-white transition-colors hover:bg-ink-2">Check</button>
      </form>
      <Link href="/check" className="group mt-8 inline-flex items-center gap-1.5 text-[15px] font-medium text-ink-2 transition-colors hover:text-ink">
        Or try an example
        <ArrowRight size={15} aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5" />
      </Link>
    </section>
  );
}
