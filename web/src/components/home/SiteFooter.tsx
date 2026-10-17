import Link from "next/link";
import { Mark } from "@/design";
import { LAB_LINKS, NEW_RUN } from "@/lib/ui/lab";

/** Quiet footer: the name, one line, and the Lab (every power tool that stays off the home page). */
export default function SiteFooter() {
  return (
    <footer className="relative isolate overflow-hidden">
      <div aria-hidden className="burst burst-gold" style={{ ["--bx" as string]: "12%", ["--by" as string]: "110%", ["--bs" as string]: "820px", ["--bo" as string]: 0.7 }} />
      <div aria-hidden className="burst burst-sage" style={{ ["--bx" as string]: "92%", ["--by" as string]: "120%", ["--bs" as string]: "720px", ["--bo" as string]: 0.55 }} />
      <div className="mx-auto grid max-w-[1200px] gap-10 px-5 pb-14 pt-20 sm:px-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <div className="flex items-center gap-2.5 text-[16px] font-[620] tracking-[-0.03em] text-ink"><Mark size={24} /> Bonded</div>
          <p className="mt-3 max-w-[34ch] text-[14px] leading-relaxed text-ink-3">How safely do AI agents spend money? We grade every decision they make.</p>
        </div>
        <nav aria-label="Lab">
          <div className="mb-3 text-[12px] font-medium uppercase tracking-[0.14em] text-ink-4">Lab</div>
          <ul className="grid grid-cols-3 gap-x-8 gap-y-2 text-[14px] max-sm:grid-cols-2">
            {[...LAB_LINKS, NEW_RUN].map((l) => (
              <li key={l.href}><Link href={l.href} className="text-ink-2 transition-colors hover:text-ink">{l.label}</Link></li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
