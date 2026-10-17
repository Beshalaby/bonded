import Link from "next/link";

// Final CTA over the money-tree photograph: translucent glass card centered on the scene.
export function Cta() {
  return (
    <section id="start" className="relative isolate flex min-h-[80vh] items-center justify-center overflow-hidden bg-cream py-24">
      {/* backdrop anchored center-bottom so the money trees at the edges stay framed on narrow screens */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-no-repeat [background-image:url('/spendbench/prosperity-hero.webp')] [background-position:center_bottom]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-[#1c2a1c]/30" />
      {/* soft radial white scrim behind the card so the ink text stays legible over foliage */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.65),transparent_62%)]" />

      <div className="relative z-10 mx-auto max-w-[720px] px-6">
        <div className="rounded-[2.2rem] border border-white/75 bg-white/75 px-10 py-14 text-center shadow-[0_24px_70px_rgba(90,100,50,0.20)] backdrop-blur-md sm:px-16">
          <span className="rounded-full border border-gold/50 bg-gold/20 px-4 py-1 text-[13px] font-medium text-gold-deep">
            Start measuring
          </span>
          <h2 className="mt-6 text-[clamp(2rem,4.2vw,3.4rem)] font-medium leading-[1.06] tracking-[-0.02em] text-ink">
            Would you trust this agent
            <br />
            with your money?
          </h2>
          <p className="mx-auto mt-5 max-w-[28rem] text-[16px] leading-relaxed text-ink/70">
            Run a benchmark, read the traces, and see how your agents behave in the wild before you
            hand them the wallet.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/runs/new"
              className="rounded-full bg-forest px-7 py-3 text-[15px] font-medium text-cream transition-colors hover:bg-leaf"
            >
              Run a benchmark
            </Link>
            <Link
              href="/connect"
              className="rounded-full border border-forest/40 bg-white/80 px-7 py-3 text-[15px] font-medium text-forest transition-colors hover:bg-white"
            >
              Connect an agent
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
