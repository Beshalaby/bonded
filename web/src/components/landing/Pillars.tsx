import { CoinTree } from "./PillNav";

// The three things SpendBench measures: trace, guardrail, reliability.
const PILLARS = [
  {
    n: "01",
    title: "Trace",
    body: "Every task is hash-chained step by step, so you can replay exactly what the agent saw and did — and verify the log hasn't been tampered with.",
  },
  {
    n: "02",
    title: "Guardrail",
    body: "A pre-checkout checker that is itself measured. It flags suspicious purchases before money leaves; in observe mode it logs the verdict without blocking.",
  },
  {
    n: "03",
    title: "Reliability",
    body: "Posterior reliability per model with a 90% credible interval — not a point score — so you can see how confident you should be before trusting an agent.",
  },
];

export function Pillars() {
  return (
    <section className="relative overflow-hidden bg-mint py-24">
      <div className="mx-auto flex max-w-[1100px] flex-col px-6">
        <div className="mx-auto flex max-w-[720px] flex-col items-center text-center">
          <span className="rounded-full border border-forest/25 bg-white/70 px-4 py-1 text-[13px] font-medium text-forest">
            Built to reveal failure
          </span>
          <h2 className="mt-6 text-[clamp(2.2rem,4.4vw,3.6rem)] font-medium leading-[1.06] tracking-[-0.02em] text-ink">
            Every bad purchase is
            <br />
            explainable.
          </h2>
          <p className="mt-5 max-w-[30rem] text-[16px] leading-relaxed text-ink/70">
            SpendBench doesn't just say an agent failed — it shows why, with the evidence cited
            down to the trace step.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {PILLARS.map((p, i) => (
            <article
              key={p.title}
              className={`relative flex flex-col rounded-3xl border border-forest/15 bg-white/85 p-8 shadow-[0_14px_40px_rgba(80,90,60,0.10)] backdrop-blur-sm ${
                i === 1 ? "md:-translate-y-5" : ""
              }`}
            >
              <CoinTree className="h-8 w-8" />
              <span className="mt-6 text-[13px] font-semibold tracking-[0.18em] text-gold-deep">{p.n}</span>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{p.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink/70">{p.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
