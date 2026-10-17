import Link from "next/link";
import { CoinTree } from "./PillNav";

// SpendBench footer: logo on the left, link columns mapping to real app routes, socials on the right.
const LINKS: { title: string; items: { label: string; href: string }[] }[] = [
  {
    title: "Benchmarks",
    items: [
      { label: "Leaderboard", href: "/" },
      { label: "Live", href: "/live" },
      { label: "Runs", href: "/runs" },
      { label: "Tasks", href: "/tasks" },
    ],
  },
  {
    title: "Insights",
    items: [
      { label: "Traces", href: "/traces" },
      { label: "Red team", href: "/redteam" },
      { label: "Guardrail", href: "/guardrail" },
      { label: "Compare", href: "/compare" },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Methodology", href: "/methodology" },
      { label: "Arena", href: "/arena" },
      { label: "Models", href: "/models" },
      { label: "Present", href: "/present" },
    ],
  },
  {
    title: "Get started",
    items: [
      { label: "Connect an agent", href: "/connect" },
      { label: "New run", href: "/runs/new" },
      { label: "API reference", href: "/methodology" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-forest text-cream">
      <div className="mx-auto max-w-[1200px] px-6 pb-10 pt-16">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-cream/40">
              <CoinTree className="h-7 w-7" />
            </div>
            <p className="mt-4 max-w-[15rem] text-sm leading-relaxed text-cream/70">
              An open evaluation platform showing how safely AI agents spend money.
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-12 gap-y-4 sm:grid-cols-4">
            {LINKS.map((group) => (
              <div key={group.title}>
                <p className="text-sm font-semibold text-cream">{group.title}</p>
                <ul className="mt-3 space-y-2">
                  {group.items.map((l) => (
                    <li key={l.label}>
                      <Link href={l.href} className="text-sm text-cream/70 transition-colors hover:text-cream">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Social aria-label="X">
              <path d="M3 3l7.1 9.3L3.3 21h2.6l5.3-6.9L16.7 21H21l-7.4-9.7L20.4 3h-2.6l-4.8 6.3L8.3 3H3z" fill="currentColor" />
            </Social>
            <Social aria-label="GitHub">
              <path
                d="M12 2a10 10 0 0 0-3.16 19.5c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.1-1.46-1.1-1.46-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.9.83.1-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85V21c0 .27.18.58.69.48A10 10 0 0 0 12 2z"
                fill="currentColor"
              />
            </Social>
            <Social aria-label="LinkedIn">
              <path
                d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3zM9.5 9.5H13v1.6c.6-1 1.9-1.9 3.6-1.9 3 0 4.4 1.8 4.4 5V21h-4v-6.1c0-1.6-.6-2.6-2-2.6-1.4 0-2.5 1-2.5 2.7V21h-4z"
                fill="currentColor"
              />
            </Social>
          </div>
        </div>

        <p className="mt-14 border-t border-cream/20 pt-6 text-center text-sm text-cream/60">
          © 2026 SpendBench. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

function Social({ children, ...props }: { children: React.ReactNode; "aria-label": string }) {
  return (
    <a
      href="#start"
      {...props}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-cream/30 text-cream transition-colors hover:border-cream hover:bg-cream hover:text-forest"
    >
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
        {children}
      </svg>
    </a>
  );
}
