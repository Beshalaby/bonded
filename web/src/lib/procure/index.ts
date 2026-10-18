// procure(): Penny, the shopping agent. Plan a purchase end to end and return what she WOULD buy. Never orders, never charges.
//   intake -> sourcing (arena / web) -> hard checks -> council vote -> chair -> pre-mortem -> trust score -> decision
// Every stage is appended to a Flight Recorder hash chain keyed by the proposal id, so the deliberation is auditable.
import { mutate, read, uid } from "../db";
import { HAS_LLM, JUDGE_MODEL } from "../llm";
import { append, verify } from "../recorder";
import { COUNCIL_MODELS, convene, hardChecks, preMortem, referencePrice, type CheckedOffer } from "./council";
import { parseRequest, type IntakeInput } from "./intake";
import { SEARCH_MODEL, arenaOffers, webOffers } from "./sources";
import type { Decision, ExpertId, ExpertVote, Offer, PreMortem, Proposal, Source, TrustScore } from "./types";

export type { Proposal } from "./types";

export interface ProcureInput extends IntakeInput {
  sources?: Source[];
  agent?: string;
}

const WEIGHTS: Record<ExpertId, number> = { spec: 0.35, fraud: 0.25, value: 0.2, advocate: 0.2 };
const TRUST_WEIGHTS = { match: 0.3, authenticity: 0.25, price: 0.15, merchant: 0.1, consensus: 0.1, evidence: 0.1 };
const BUY_AT = 75, ASK_AT = 50;
const KEEP = 200;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${n.toFixed(2)}`;
const scoreOf = (v: ExpertVote, id: string) => v.scores.find((s) => s.offerId === id);

function councilScores(votes: ExpertVote[], offers: CheckedOffer[], budget?: number, quantity = 1): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of offers) {
    let num = 0, den = 0, veto = false;
    for (const v of votes) {
      const s = scoreOf(v, o.id);
      if (!s) continue;
      if (s.veto) veto = true;
      const w = WEIGHTS[v.expert] * (0.5 + 0.5 * v.confidence);
      num += w * s.score; den += w;
    }
    let score = den ? num / den : 0;
    if (veto) score = 0;
    if (o.flags.some((f) => f.severity === "critical" && f.code !== "OVER_BUDGET")) score *= 0.2;
    if (budget != null && o.unitPrice * quantity + (o.shipping ?? 0) > budget) score *= 0.1;
    out.set(o.id, Math.round(score));
  }
  return out;
}

function trustScore(o: CheckedOffer, votes: ExpertVote[], pick: string, ref: number | null, pm: PreMortem | null, blockingAmbiguity: boolean): TrustScore {
  const expert = (e: ExpertId) => votes.find((v) => v.expert === e);
  const sc = (e: ExpertId) => (scoreOf(expert(e)!, o.id)?.score ?? 50) / 100;
  const critical = o.flags.some((f) => f.severity === "critical" && f.code !== "OVER_BUDGET");
  const explain: string[] = [];

  const match = sc("spec");
  const authenticity = scoreOf(expert("fraud")!, o.id)?.veto ? 0 : sc("fraud") * (critical ? 0.2 : 1);
  let price = 0.7;
  if (ref) {
    const ratio = o.unitPrice / ref;
    price = ratio <= 1.05 ? 1 : clamp01(1 - (ratio - 1.05) * 1.8);
    if (ratio < 0.6 && !o.merchantSignal.verified) price = 0.5;
    explain.push(`Price is ${Math.round(ratio * 100)}% of the ${money(ref)} reference.`);
  } else explain.push("No reference price to compare against.");
  const m = o.merchantSignal;
  const merchant = m.ageDays != null && m.ageDays < 14 ? 0.15 : m.known && !m.marketplace ? 1 : m.known ? 0.75 : m.verified ? 0.8 : 0.5;
  explain.push(m.known ? `${o.merchant} is an established ${m.marketplace ? "marketplace (third-party sellers possible)" : "retailer"}.` : `${o.merchant} has ${m.verified ? "a verified account" : "no established track record"}${m.ageDays != null ? `, ${m.ageDays} days old` : ""}.`);
  const picks = votes.filter((v) => v.pick === pick).length / votes.length;
  const xs = votes.map((v) => (scoreOf(v, o.id)?.score ?? 0) / 100);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  const consensus = clamp01(0.6 * picks + 0.4 * (1 - sd * 2));
  explain.push(`${Math.round(picks * votes.length)}/${votes.length} experts picked this offer.`);
  const e = o.evidence;
  const evidence = o.source === "arena" ? 1 : e.cited && e.priceSeen ? 1 : e.priceSeen ? 0.85 : e.cited ? 0.7 : e.fetched ? 0.55 : 0.4;
  if (o.source === "web") explain.push(`Evidence: ${e.note ?? (e.cited ? "cited by search" : "unconfirmed")}.`);

  const components = { match, authenticity, price, merchant, consensus, evidence };
  let s = 100 * Object.entries(TRUST_WEIGHTS).reduce((acc, [k, w]) => acc * Math.max(0.01, components[k as keyof typeof components]) ** w, 1);
  if (pm?.outcome === "switched") explain.push(`Pre-mortem moved the pick here: ${pm.objection}`);
  else if (pm?.severity === "major") { s *= 0.85; explain.push(`Pre-mortem raised a major concern: ${pm.objection}`); }
  if (pm?.severity === "blocker") { s *= 0.7; explain.push(`Pre-mortem raised a blocker: ${pm.objection}`); }
  if (blockingAmbiguity) { s = Math.min(s, 60); explain.push("Capped: the request leaves a detail open that changes what gets bought."); }
  // An offer no expert picked can't earn a confident grade, however clean its other components look.
  if (picks === 0) { s = Math.min(s, 64); explain.push("Capped: none of the experts picked this offer."); }
  const score = Math.round(s);
  const grade = score >= 85 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 45 ? "D" : "F";
  return { score, grade, components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, r2(v)])) as TrustScore["components"], explain };
}

export async function procure(input: ProcureInput): Promise<Proposal> {
  const t0 = Date.now();
  const id = uid("prop");
  const log = (action: string, payload: unknown) => { try { append(id, action === "request" ? "agent" : "system", `procure_${action}`, payload); } catch { /* audit is best effort */ } };
  log("request", { request: input.request, budget: input.budget, quantity: input.quantity, constraints: input.constraints, agent: input.agent });

  // 1. Intake
  const spec = await parseRequest(input);
  log("spec", spec);

  // 2. Sourcing
  const wanted: Source[] = input.sources?.length ? input.sources : HAS_LLM ? ["web"] : ["arena"];
  const sources: Proposal["sources"] = [];
  const raw: Omit<Offer, "id">[] = [];
  await Promise.all(wanted.map(async (src) => {
    const r: { offers: Omit<Offer, "id">[]; queries: string[]; error?: string } = src === "web" ? await webOffers(spec) : arenaOffers(spec);
    sources.push({ source: src, queries: r.queries, offers: r.offers.length, ...(r.error ? { error: r.error } : {}) });
    raw.push(...r.offers);
  }));
  const offers: Offer[] = raw.map((o, i) => ({ ...o, id: `o${i + 1}` }));
  const ref = referencePrice(offers);
  log("sources", { sources, offers: offers.map((o) => ({ id: o.id, source: o.source, title: o.title, price: o.unitPrice, merchant: o.merchant, url: o.url, productId: o.productId })) });

  // 3. Hard checks
  const checked = await hardChecks(spec, offers, ref);
  log("checks", checked.map((o) => ({ id: o.id, flags: o.flags.map((f) => `${f.severity}:${f.code}`) })));

  // 4. Council
  const votes = await convene(spec, checked, ref);
  for (const v of votes) log("vote", v);
  const cs = councilScores(votes, checked, spec.budget, spec.quantity);
  const ranked = [...checked].sort((a, b) => (cs.get(b.id) ?? 0) - (cs.get(a.id) ?? 0) || a.unitPrice - b.unitPrice);
  const chair: string[] = [];
  let pick = ranked[0] && (cs.get(ranked[0].id) ?? 0) >= 35 ? ranked[0] : undefined;
  const agreement = pick ? votes.filter((v) => v.pick === pick!.id).length / votes.length : 0;

  // 5. Pre-mortem on the leading pick
  let pm: PreMortem | null = null;
  if (pick) {
    const runnerUp = ranked.find((o) => o.id !== pick!.id && (cs.get(o.id) ?? 0) >= 35);
    pm = await preMortem(spec, pick, runnerUp, checked, ref);
    log("premortem", pm);
    // The devil's advocate advises; it can't overrule a council majority. It switches the pick only when most
    // experts didn't back the leader anyway and the alternative scored close. Otherwise its objection costs trust.
    const alt = pm.switchTo ? checked.find((o) => o.id === pm!.switchTo) : undefined;
    const backers = votes.filter((v) => v.pick === pick!.id).length;
    if (alt && (pm.severity === "major" || pm.severity === "blocker") && backers * 2 <= votes.length && (cs.get(alt.id) ?? 0) >= (cs.get(pick.id) ?? 0) - 10) {
      chair.push(`Switched from ${pick.id} to ${alt.id} after the pre-mortem: ${pm.objection}`);
      pick = alt;
      pm = { ...pm, outcome: "switched" };
    } else if (pm.severity !== "none") {
      pm = { ...pm, outcome: "noted" };
      if (alt && pm.severity !== "minor") chair.push(`Kept ${pick.id} over the pre-mortem's ${alt.id}: ${backers}/${votes.length} experts backed it.`);
    }
  }

  // 6. Trust and decision
  const blocking = spec.ambiguities.filter((a) => a.blocking);
  let trust = pick ? trustScore(pick, votes, pick.id, ref, pm, blocking.length > 0) : null;
  const questions: string[] = blocking.map((a) => a.question);
  let decision: Decision;
  const overBudget = (o: CheckedOffer) => spec.budget != null && o.unitPrice * spec.quantity + (o.shipping ?? 0) > spec.budget;
  const vetoed = (o: CheckedOffer) => votes.some((v) => scoreOf(v, o.id)?.veto);
  // "Clean": nothing flagged except the budget, not vetoed, in stock, and the spec expert agrees it's the item.
  const specScore = (o: CheckedOffer) => scoreOf(votes.find((v) => v.expert === "spec")!, o.id)?.score ?? 0;
  const closestOver = spec.budget != null
    ? [...checked].filter((o) => overBudget(o) && o.inStock !== false && !vetoed(o) && specScore(o) >= 70
      && o.flags.every((f) => f.code === "OVER_BUDGET" || f.severity === "info"))
      // the council's preferred clean offer (votes, then council score), not merely the cheapest
      .sort((a, b) => votes.filter((v) => v.pick === b.id).length - votes.filter((v) => v.pick === a.id).length
        || (cs.get(b.id) ?? 0) - (cs.get(a.id) ?? 0) || a.unitPrice - b.unitPrice)[0]
    : undefined;
  if (!checked.length) { decision = "decline"; chair.push("No offers were found for this item."); }
  else if (!pick) { decision = "decline"; chair.push("Every offer was vetoed or scored too low to recommend."); }
  else if (blocking.length) { decision = "ask_user"; chair.push("The request is missing a detail that changes the item; asking instead of guessing."); }
  else if (pm?.severity === "blocker") { decision = "ask_user"; if (pm.question) questions.push(pm.question); chair.push("The pre-mortem found a blocker only the user can resolve."); }
  else if (trust!.score >= BUY_AT) { decision = "buy"; chair.push(`Trust ${trust!.score} clears the ${BUY_AT} bar.`); }
  else if (trust!.score >= ASK_AT) {
    decision = "ask_user";
    questions.push(pm?.question ?? `Trust is ${trust!.score}/100. Buy "${pick.title}" from ${pick.merchant} for ${money(pick.unitPrice * spec.quantity + (pick.shipping ?? 0))}?`);
    chair.push(`Trust ${trust!.score} is below ${BUY_AT}; confirm with the user.`);
  } else { decision = "decline"; chair.push(`Trust ${trust!.score} is below ${ASK_AT}; not recommending this purchase.`); }
  if (decision === "decline" && closestOver && closestOver.id !== pick?.id) {
    // Nothing trustworthy fits the budget, but a clean offer exists above it: ask instead of a flat no.
    const total = closestOver.unitPrice * spec.quantity + (closestOver.shipping ?? 0);
    decision = "ask_user";
    questions.push(`Nothing trustworthy fits the ${money(spec.budget!)} budget. The best clean option is ${money(total)} at ${closestOver.merchant}. Raise the budget?`);
    chair.push(`Offering ${closestOver.id} (${closestOver.merchant}) above budget instead of ${pick ? `the risky in-budget ${pick.id}` : "nothing"}.`);
    pick = closestOver;
    trust = trustScore(pick, votes, pick.id, ref, null, blocking.length > 0);
    trust.explain.unshift(`Over the ${money(spec.budget!)} budget by ${money(total - spec.budget!)}; the user has to approve the higher total.`);
  }

  const wouldBuy = pick && decision !== "decline" ? {
    offerId: pick.id, title: pick.title, brand: pick.brand, merchant: pick.merchant, url: pick.url, productId: pick.productId,
    unitPrice: pick.unitPrice, quantity: spec.quantity, shipping: pick.shipping ?? 0,
    total: r2(pick.unitPrice * spec.quantity + (pick.shipping ?? 0)), condition: pick.condition,
  } : null;
  const whyNot = (o: CheckedOffer) => {
    const veto = votes.map((v) => scoreOf(v, o.id)?.veto).find(Boolean);
    if (veto) return `Vetoed: ${veto}`;
    const crit = o.flags.find((f) => f.severity === "critical");
    if (crit) return crit.message;
    if (overBudget(o)) return "Over budget.";
    const weakest = votes.map((v) => ({ e: v.expert, s: scoreOf(v, o.id) })).sort((a, b) => (a.s?.score ?? 0) - (b.s?.score ?? 0))[0];
    return `Lower council score; weakest on ${weakest.e}${weakest.s?.note ? ` (${weakest.s.note})` : ""}.`;
  };
  const alternatives = ranked.filter((o) => o.id !== pick?.id).slice(0, 4).map((o) => ({
    offerId: o.id, title: o.title, merchant: o.merchant, unitPrice: o.unitPrice, url: o.url, councilScore: cs.get(o.id) ?? 0, whyNot: whyNot(o),
  }));

  const summary = decision === "buy" ? `Would buy ${spec.quantity} × ${pick!.title} from ${pick!.merchant} for ${money(wouldBuy!.total)} (trust ${trust!.score}/100).`
    : decision === "ask_user" ? `Needs the user's input before buying${wouldBuy ? `; leading option is ${pick!.title} from ${pick!.merchant} for ${money(wouldBuy.total)}` : ""}.`
    : `Would not buy: ${chair[chair.length - 1]}`;

  const proposal: Proposal = {
    id, createdAt: new Date().toISOString(), agent: input.agent ?? "api", request: input.request, spec, decision, executed: false, summary,
    wouldBuy, trust, alternatives, questions: [...new Set(questions)],
    council: { votes, preMortem: pm, agreement: r2(agreement), chair },
    offers: checked.map((o) => ({ ...o, councilScore: cs.get(o.id) ?? 0 })), referencePrice: ref ? r2(ref) : null, sources,
    costNote: HAS_LLM
      ? `LLM calls: intake ${JUDGE_MODEL}${wanted.includes("web") ? `, web search ${SEARCH_MODEL} ×2` : ""}, council ${COUNCIL_MODELS.join(" / ")}`
      : "No API key: heuristic council, Arena catalog only.",
    latencyMs: Date.now() - t0,
  };
  log("decision", { decision, summary, trust: trust?.score ?? null, wouldBuy, questions: proposal.questions });
  mutate((d) => { (d.proposals ??= []).push(proposal); if (d.proposals.length > KEEP) d.proposals.splice(0, d.proposals.length - KEEP); });
  return proposal;
}

export function getProposal(id: string): (Proposal & { integrity: ReturnType<typeof verify> }) | undefined {
  const p = (read().proposals ?? []).find((x) => x.id === id);
  return p ? { ...p, integrity: verify(id) } : undefined;
}

export function listProposals(limit = 50): Proposal[] {
  return [...(read().proposals ?? [])].reverse().slice(0, limit);
}
