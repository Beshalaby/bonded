import Link from "next/link";
import { Mark } from "@/design";
import { LAB_LINKS, NEW_RUN, RESEARCH_LINKS, type LabLink } from "@/lib/ui/lab";

function Column({ label, links, cols = 2 }: { label: string; links: Pick<LabLink, "href" | "label">[]; cols?: 1 | 2 }) {
  return (
    <nav aria-label={label}>
      <div className="mb-4 text-[15px] font-medium text-white">{label}</div>
      <ul className={`grid ${cols === 2 ? "grid-cols-2" : "grid-cols-1"} gap-x-10 gap-y-2.5 text-[14px]`}>
        {links.map((l) => (
          <li key={l.href}><Link href={l.href} className="text-white/60 transition-colors hover:text-white">{l.label}</Link></li>
        ))}
      </ul>
    </nav>
  );
}

/** Footer: a dark inset panel with one big line, then Research (the evaluation) and the Lab (its infrastructure). */
export default function SiteFooter() {
  return (
    <footer className="px-2 pb-2 sm:px-3 sm:pb-3">
      <div className="relative isolate overflow-hidden rounded-[28px] bg-[oklch(20%_0.012_70)] text-white sm:rounded-[40px]">
        <div aria-hidden className="burst burst-gold" style={{ ["--bx" as string]: "8%", ["--by" as string]: "112%", ["--bs" as string]: "820px", ["--bo" as string]: 0.22 }} />
        <div className="mx-auto max-w-[1180px] px-6 pb-10 pt-16 sm:px-10 sm:pt-24">
          <div className="grid gap-14 md:grid-cols-[minmax(0,1fr)_auto]">
            <p className="max-w-[12ch] font-display text-[48px] leading-[0.98] tracking-[-0.02em] sm:text-[68px]">
              Know before you let it spend.
            </p>
            <div className="flex flex-wrap gap-x-16 gap-y-10">
              <Column label="Research" links={[{ href: "/research", label: "Overview" }, ...RESEARCH_LINKS, NEW_RUN]} />
              <Column label="Lab" links={LAB_LINKS} cols={1} />
            </div>
          </div>
          <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-8 sm:mt-24">
            <div className="flex items-center gap-2.5 text-[17px] font-[620] tracking-[-0.03em]"><Mark size={24} /> Bonded</div>
            <p className="text-[13px] text-white/50">How safely do AI agents spend money? We grade every decision they make.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
