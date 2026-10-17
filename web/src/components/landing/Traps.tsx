import Link from "next/link";

// The five trap classes SpendBench plants in its store. Cards link into the live app so a reader can
// see the evidence. Copy is drawn from the domain model (lib/types.ts TrapType).
const TRAPS = [
  {
    name: "Knockoff listings",
    whose: "Counterfeit of a real brand — similar title, wrong brand or specs.",
    color: "bg-gold/15",
    ring: "border-gold/40",
    accent: "text-gold-deep",
    href: "/traces",
  },
  {
    name: "Fake discounts",
    whose: "Inflated list price so the discount looks huge; the price is at or above market.",
    color: "bg-forest/10",
    ring: "border-forest/30",
    accent: "text-forest",
    href: "/traces",
  },
  {
    name: "Hidden prompt injections",
    whose: "Product description contains hidden instructions aimed at the agent.",
    color: "bg-leaf/15",
    ring: "border-leaf/40",
    accent: "text-forest",
    href: "/redteam",
  },
  {
    name: "Brand-new merchants",
    whose: "Sold by a merchant created days ago, with no history or reviews.",
    color: "bg-sage/20",
    ring: "border-sage/50",
    accent: "text-forest",
    href: "/traces",
  },
  {
    name: "Price gouging",
    whose: "Priced far above the true market value for the same item.",
    color: "bg-gold/15",
    ring: "border-gold/40",
    accent: "text-gold-deep",
    href: "/compare",
  },
];

// "The store is rigged on purpose." A band of the trap types SpendBench puts in front of every agent.
export function Traps() {
  return (
    <section className="relative overflow-hidden bg-cream py-24">
      <div className="mx-auto flex max-w-[1100px] flex-col px-6">
        <div className="max-w-[640px]">
          <span className="rounded-full border border-gold/40 bg-gold/15 px-4 py-1 text-[13px] font-medium text-gold-deep">
            The store is rigged on purpose
          </span>
          <h2 className="mt-5 text-[clamp(2rem,4vw,3.2rem)] font-medium leading-[1.06] tracking-[-0.02em] text-ink">
            Five ways an AI agent
            <br />
            spends money wrong.
          </h2>
          <p className="mt-4 max-w-[34rem] text-[16px] leading-relaxed text-ink/70">
            Every purchase in SpendBench is a trap or a clean deal. If an agent buys a knockoff or
            pays a gouged price, the trace shows exactly where it went wrong.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TRAPS.map((t) => (
            <Link
              key={t.name}
              href={t.href}
              className={`group flex flex-col rounded-3xl border ${t.ring} ${t.color} p-6 backdrop-blur-sm transition-transform hover:-translate-y-1`}
            >
              <span className={`text-[20px] font-semibold tracking-tight text-ink ${t.accent}`}>{t.name}</span>
              <p className="mt-3 flex-1 text-[15px] leading-relaxed text-ink/70">{t.whose}</p>
              <span className="mt-5 text-[13px] font-medium text-forest opacity-0 transition-opacity group-hover:opacity-100">
                See it in a trace →
              </span>
            </Link>
          ))}

          {/* note card fills the grid at 3/3 and reads as a callout, not a sixth trap */}
          <div className="flex flex-col justify-center rounded-3xl border border-dashed border-forest/25 bg-mint/40 p-6">
            <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-forest">And it keeps growing</span>
            <p className="mt-2 text-[15px] leading-relaxed text-forest">
              The red team keeps adding scams that fool real models, so the benchmark gets harder
              over time.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
