"use client";
// Wallets: one quiet row per agent (name, card, balance, purchases). A row opens to show what that card bought,
// each purchase linking back to the trace of the session that made it.
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, ChevronDown, CreditCard } from "lucide-react";
import { cx } from "@/components/ui";
import { HeroPanel } from "@/components/HeroPanel";
import { useApi, type BankResponse, type BankWallet, type BankWalletResponse } from "@/lib/ui/api";
import { traceHref, usd } from "@/lib/ui/format";

const clean = (s: string) => s.replace(/\s*\(sim\)\s*$/i, "");

export default function BankView() {
  const { data, error, loading, reload } = useApi<BankResponse>("/api/bank");
  const [open, setOpen] = useState<string | null>(null);
  const wallets = data?.wallets ?? [];

  return (
    <section className="relative pb-24">
      <HeroPanel tone="sage" labelledBy="bank-title" className="mb-0 sm:mb-0" inner="py-16 sm:py-24">
        <div className="hero-rise inline-flex items-center gap-2 rounded-full bg-white/55 py-1 pl-1.5 pr-3 text-[13px] font-medium text-ink-2 shadow-[inset_0_0_0_1px_oklch(100%_0_0/0.6)] backdrop-blur-md">
          <span className="grid size-6 place-items-center rounded-full bg-ink text-white"><CreditCard size={13} aria-hidden /></span>
          Capital One · Nessie
        </div>
        <h1 id="bank-title" className="hero-rise mt-6 font-[600] leading-[0.96] tracking-[-0.055em] text-ink [font-size:clamp(48px,8vw,112px)]" style={{ ["--d" as string]: "0.08s" }}>Wallets.</h1>
        <p className="hero-rise mt-4 max-w-[30ch] text-[18px] text-ink-2 sm:text-[20px]" style={{ ["--d" as string]: "0.16s" }}>Every agent spends from its own Capital One card.</p>
        <p className="hero-rise mt-3 text-[13px] text-ink-3" style={{ ["--d" as string]: "0.22s" }}>
          {!data ? "\u00a0" : data.simulated ? "Simulated ledger. Set NESSIE_API_KEY to use real Nessie accounts."
            : data.live ? "Live Capital One Nessie accounts." : "Capital One Nessie API (mock endpoint)."}
        </p>
        {wallets.length > 0 && (
          <div className="hero-rise mt-8 flex flex-wrap gap-2" style={{ ["--d" as string]: "0.3s" }}>
            {([["Agents", String(wallets.length)], ["Purchases", String(wallets.reduce((n, w) => n + (w.purchases), 0))]] as const).map(([k, v]) => (
              <span key={k} className="inline-flex items-baseline gap-2 rounded-[16px] bg-white/60 px-4 py-2.5 backdrop-blur-md">
                <span className="text-[22px] font-[600] tracking-[-0.03em] tabular-nums text-ink">{v}</span>
                <span className="text-[13px] text-ink-3">{k}</span>
              </span>
            ))}
          </div>
        )}
      </HeroPanel>

      <div className="mt-14 sm:mt-20">
        {error && !data ? (
          <p className="py-10 text-[15px] text-ink-3">Couldn’t load the wallets. <button type="button" onClick={reload} className="font-medium text-accent underline-offset-4 hover:underline">Try again</button></p>
        ) : loading && !data ? (
          <ul aria-hidden className="grid gap-2">{Array.from({ length: 5 }).map((_, i) => <li key={i} className="h-[68px] animate-pulse rounded-[22px] bg-canvas-sunk/60" />)}</ul>
        ) : !wallets.length ? (
          <p className="py-10 text-[15px] text-ink-3">No agent has a card yet. Cards are issued on an agent’s first task. <Link href="/live" className="font-medium text-accent underline-offset-4 hover:underline">Watch one shop</Link></p>
        ) : (
          <ul className="grid">
            <li aria-hidden className="-mx-4 hidden grid-cols-[minmax(0,1fr)_96px_140px_110px_24px] gap-x-6 px-4 pb-3 text-[12px] font-medium uppercase tracking-[0.14em] text-ink-4 sm:-mx-5 sm:grid sm:px-5">
              <span>Agent</span><span>Card</span><span className="text-right">Balance</span><span className="text-right">Purchases</span><span />
            </li>
            {wallets.map((w) => <Row key={w.agentId} w={w} open={open === w.agentId} onToggle={() => setOpen(open === w.agentId ? null : w.agentId)} />)}
          </ul>
        )}
      </div>
      {wallets.length > 0 && (
        <p className="mt-8 text-[13px] text-ink-4">Each task’s budget is deposited when it starts; each checkout is one purchase per merchant. Powered by Capital One Nessie.</p>
      )}
    </section>
  );
}

function Row({ w, open, onToggle }: { w: BankWallet; open: boolean; onToggle: () => void }) {
  const id = `wallet-${w.agentId}`;
  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={id}
        className="group -mx-4 grid w-[calc(100%+2rem)] grid-cols-[minmax(0,1fr)_auto_24px] items-center gap-x-4 rounded-[22px] px-4 py-4 text-left transition-colors duration-300 hover:bg-[oklch(98.4%_0.016_88)] sm:-mx-5 sm:w-[calc(100%+2.5rem)] sm:grid-cols-[minmax(0,1fr)_96px_140px_110px_24px] sm:gap-x-6 sm:px-5 sm:py-5">
        <span className="min-w-0">
          <span className="block truncate text-[17px] font-medium tracking-[-0.02em] text-ink sm:text-[19px]">{clean(w.displayName)}</span>
          <span className="block truncate text-[12.5px] text-ink-4 sm:hidden">••{w.accountLast4} · {w.purchases} purchase{w.purchases === 1 ? "" : "s"}</span>
        </span>
        <span className="hidden font-mono text-[14px] text-ink-3 sm:block">••{w.accountLast4}</span>
        <span className={`text-right text-[22px] font-[560] leading-none tracking-[-0.04em] tabular-nums sm:text-[26px] ${w.balance < 0 ? "text-coral-ink" : "text-ink"}`}
          title={w.balance < 0 ? "Overspent: this agent charged more than it was funded" : undefined}>
          {w.balance < 0 ? `\u2212${usd(-w.balance, 0)}` : usd(w.balance, 0)}
        </span>
        <span className="hidden text-right text-[15px] text-ink-3 tabular-nums sm:block">{w.purchases}</span>
        <ChevronDown aria-hidden size={16} className={cx("justify-self-end text-ink-4 transition-transform duration-300", open && "rotate-180")} />
      </button>
      {open && <Purchases id={id} agentId={w.agentId} />}
    </li>
  );
}

function Purchases({ id, agentId }: { id: string; agentId: string }) {
  const { data, error, loading } = useApi<BankWalletResponse>(`/api/bank/${encodeURIComponent(agentId)}`);
  const list = data?.purchases ?? [];
  return (
    <div id={id} className="lv-fade-in pb-6 pl-1 pr-1 pt-1 sm:pl-6">
      {error ? <p className="text-[14px] text-ink-3">Couldn’t load purchases.</p>
        : loading && !data ? <p className="text-[14px] text-ink-4">Loading…</p>
        : !list.length ? <p className="text-[14px] text-ink-3">No purchases yet.</p> : (
          <>
            <p className="mb-2 text-[12.5px] text-ink-4">
              {usd(data!.wallet.spent)} spent of {usd(data!.wallet.funded)} funded{data!.source === "nessie" ? " · read live from Nessie" : ""}
            </p>
            <ul className="grid">
              {list.slice(0, 40).map((p) => (
                <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 py-2 text-[14.5px] sm:grid-cols-[minmax(0,1fr)_110px_96px_88px]">
                  <span className="truncate text-ink-2">{p.merchantName}</span>
                  <span className="text-right tabular-nums text-ink">{usd(p.amount)}</span>
                  <span className="hidden text-right text-[13px] tabular-nums text-ink-4 sm:block">{p.date}</span>
                  <span className="hidden text-right sm:block">
                    {p.sessionId ? (
                      <Link href={traceHref(p.sessionId)} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 transition-colors hover:text-accent">
                        Trace <ArrowUpRight aria-hidden size={13} />
                      </Link>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            {list.length > 40 && <p className="mt-2 text-[12.5px] text-ink-4">and {list.length - 40} more</p>}
          </>
        )}
    </div>
  );
}
