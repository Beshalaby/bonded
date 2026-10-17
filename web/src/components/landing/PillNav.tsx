import Link from "next/link";

// Floating pill nav over the hero photograph — SpendBench wordmark + a link into the live app
// ("Open the leaderboard" → /). Matching the reference pill control.
export function PillNav() {
  return (
    <nav className="pointer-events-auto sticky top-5 z-30 mx-auto flex w-max items-center gap-5 rounded-full border border-white/60 bg-white/80 px-6 py-2.5 shadow-[0_8px_30px_rgba(80,70,30,0.14)] backdrop-blur-md">
      <Link href="/" className="flex items-center gap-2">
        <CoinTree className="h-6 w-6" />
        <span className="text-[15px] font-semibold tracking-tight text-ink">SpendBench</span>
      </Link>
      <Link
        href="/"
        className="rounded-full bg-forest px-4 py-1.5 text-[13px] font-medium text-cream transition-colors hover:bg-leaf"
      >
        Open the leaderboard
      </Link>
    </nav>
  );
}

// Money-tree wordmark: a coin roundel with a sprouting leaf, echoing the reference art.
export function CoinTree({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" fill="#d9a441" />
      <circle cx="12" cy="12" r="6.4" fill="#fdf9ec" />
      <path d="M8.5 15c3.8-1.2 6.2-3.6 7.4-7.4" stroke="#5f7f47" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.2 9.2l2.7-1.6.5 3" stroke="#5f7f47" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
