import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { addToCart, checkout, createSession, seedArena, search } from "@/lib/arena";
import { read } from "@/lib/db";
import { getChain, verify } from "@/lib/recorder";
import {
  NessieClient, NessieError, SimulatedNessie, backendConfig, ensureAgentWallet, ensureMerchant, listWallets, redact,
  setBackendForTests, walletSummary, type NessieApi,
} from "@/lib/nessie";

const ROOT = path.resolve(__dirname, "../..");
let mock: ChildProcess;
let base = "";

beforeAll(async () => {
  mock = spawn("python3", [path.join(ROOT, "scripts/mock_nessie.py"), "--port", "0", "--require-key"], { stdio: ["ignore", "pipe", "inherit"] });
  base = await new Promise<string>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("mock nessie did not start")), 10_000);
    mock.stdout!.on("data", (b: Buffer) => {
      const m = String(b).match(/http:\/\/[\d.]+:\d+/);
      if (m) { clearTimeout(t); resolve(m[0]); }
    });
  });
  seedArena();
});
afterAll(() => { mock?.kill(); setBackendForTests(null); });
afterEach(() => setBackendForTests(null));

const KEY = "sekret-nessie-key-123";
const client = (o: Partial<ConstructorParameters<typeof NessieClient>[0]> = {}) =>
  new NessieClient({ baseUrl: base, apiKey: KEY, retryDelaysMs: [10, 20], ...o });
const addr = { street_number: "1680", street_name: "Capital One Dr", city: "McLean", state: "VA", zip: "22102" };
const fail = (codes: unknown[]) => fetch(`${base}/_mock/fail`, { method: "POST", body: JSON.stringify({ codes }) });

describe("NessieClient against the mock", () => {
  it("creates customer → card → merchant, deposits, purchases, and reads the balance back", async () => {
    const c = client();
    const cust = await c.createCustomer({ first_name: "Agent", last_name: "Atlas", address: addr });
    expect(cust).toMatch(/^[0-9a-f]{24}$/);
    const acct = await c.createAccount(cust, { type: "Credit Card", nickname: "Bonded Atlas", rewards: 0, balance: 0 });
    const m = await c.createMerchant({ name: "Northgate", category: "Shopping", address: addr, geocode: { lat: 38.9, lng: -77.1 } });
    expect((await c.listMerchants()).map((x) => x.id)).toContain(m);
    await c.createDeposit(acct, { medium: "balance", transaction_date: "2026-10-17", status: "completed", amount: 260, description: "budget" });
    const pid = await c.createPurchase(acct, { merchant_id: m, medium: "balance", purchase_date: "2026-10-17", amount: 229.99, status: "completed", description: "Bonded ses_x · AirPods" });
    const a = await c.getAccount(acct);
    expect(a.balance).toBeCloseTo(30.01, 2);
    expect(a.accountNumber).toMatch(/^\d{16}$/);
    const ps = await c.listPurchases(acct);
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({ id: pid, merchantId: m, amount: 229.99, date: "2026-10-17" });
  });

  it("retries 429/5xx, and treats {code: 4xx/5xx} bodies as errors", async () => {
    const c = client();
    await fail([503, 429]);
    expect((await c.listMerchants()).length).toBeGreaterThanOrEqual(0); // succeeded on the third try
    await fail(["error200", "error200", "error200"]);
    await expect(c.listMerchants()).rejects.toThrow(/code 500/);
    await expect(c.getAccount("000000000000000000000000")).rejects.toMatchObject({ status: 404 });
    await expect(c.createCustomer({ first_name: "A", last_name: "B", address: { ...addr, state: "Virginia" } })).rejects.toThrow(/address\.state/);
  });
});

describe("redaction", () => {
  it("strips key= from URLs and the literal key from messages", () => {
    expect(redact(`GET https://api.nessieisreal.com/accounts?key=${KEY}&x=1`, KEY)).toBe("GET https://api.nessieisreal.com/accounts?key=REDACTED&x=1");
    expect(redact(`failed with ${KEY} inside`, KEY)).not.toContain(KEY);
    expect(new NessieError(`boom ?key=abc123`).message).toBe("boom ?key=REDACTED");
  });

  it("errors from the client never contain the key", async () => {
    const prev = process.env.NESSIE_API_KEY;
    process.env.NESSIE_API_KEY = KEY;
    try {
      const err = await client().getAccount("nope").catch((e: Error) => e);
      expect(err).toBeInstanceOf(NessieError);
      expect(String((err as Error).message)).not.toContain(KEY);
      const dead = await client({ baseUrl: "http://127.0.0.1:1" }).listMerchants().catch((e: Error) => e);
      expect(String((dead as Error).message)).not.toContain(KEY);
    } finally { if (prev === undefined) delete process.env.NESSIE_API_KEY; else process.env.NESSIE_API_KEY = prev; }
  });

  it("selects the backend from env", () => {
    expect(backendConfig({})).toEqual({ kind: "simulated" });
    expect(backendConfig({ NESSIE_API_KEY: "k" })).toMatchObject({ kind: "http", baseUrl: "https://api.nessieisreal.com" });
    expect(backendConfig({ NESSIE_BASE_URL: "http://127.0.0.1:8788" })).toMatchObject({ kind: "http", apiKey: "" });
  });
});

describe("ledger", () => {
  it("creates a wallet once per agent, even under concurrency (mock HTTP)", async () => {
    setBackendForTests(client());
    const before = await (await fetch(`${base}/_mock/stats`)).json();
    const ws = await Promise.all([1, 2, 3, 4].map(() => ensureAgentWallet("agent-idem", "sim/careful")));
    expect(new Set(ws.map((w) => w.accountId)).size).toBe(1);
    expect(ws[0].accountLast4).toMatch(/^\d{4}$/);
    expect((await ensureAgentWallet("agent-idem", "sim/careful")).accountId).toBe(ws[0].accountId);
    const after = await (await fetch(`${base}/_mock/stats`)).json();
    expect(after.counts.customers - before.counts.customers).toBe(1);
    expect(after.counts.accounts - before.counts.accounts).toBe(1);
    const m1 = await Promise.all([ensureMerchant({ id: "m_x", name: "X" }), ensureMerchant({ id: "m_x", name: "X" })]);
    expect(m1[0]).toBe(m1[1]);
  });

  it("simulated ledger: same interface, flagged simulated", async () => {
    const sim = new SimulatedNessie();
    setBackendForTests(sim);
    const a = await ensureAgentWallet("agent-sim", "sim/gullible");
    const b = await ensureAgentWallet("agent-sim", "sim/gullible");
    expect(a.customerId).toBe(b.customerId);
    expect(read().nessie?.sim?.customers.filter((c) => c.last_name === "Echo Gullible")).toHaveLength(1);
    expect(sim.simulated).toBe(true);
  });
});

/** Run one session to checkout. */
async function shop(model: string, guardrail: "observe" | "enforce" = "observe") {
  const s = createSession({ model, instruction: "Buy AirPods Pro 2", budget: 400, guardrail }, { internal: true });
  const p = search({ q: "AirPods Pro 2" })[0];
  addToCart(s.sessionId, p.id, 1);
  const out = await checkout(s.sessionId, "test");
  return { s, p, out, chain: getChain(s.sessionId) };
}

describe("checkout + bank", () => {
  it("funds at session start and charges one purchase per merchant (mock HTTP)", async () => {
    setBackendForTests(client());
    const { out, chain, s } = await shop("sim/careful");
    expect(out.transaction.status).toBe("completed");
    expect(out.bank).toMatchObject({ provider: "capital_one_nessie", simulated: false, status: "charged" });
    const actions = chain.map((e) => e.action);
    expect(actions).toContain("bank_funded");
    const charge = chain.find((e) => e.action === "bank_charge")!.payload as Record<string, unknown>;
    // The real Nessie API stores whole dollars, so the HTTP path charges the nearest dollar.
    expect(charge).toMatchObject({ accountLast4: expect.stringMatching(/^\d{4}$/), amount: Math.round(out.transaction.amount) });
    expect((charge.purchaseIds as string[]).length).toBe(1);
    expect(verify(s.sessionId).valid).toBe(true);
    const sum = await walletSummary(s.agentId);
    expect(sum?.source).toBe("nessie");
    expect(sum?.purchases.some((p) => p.sessionId === s.sessionId)).toBe(true);
    expect((await listWallets()).find((w) => w.agentId === s.agentId)?.purchases).toBeGreaterThan(0);
  });

  it("still completes checkout when Nessie is down, logging a redacted bank_error", async () => {
    const prev = process.env.NESSIE_API_KEY;
    process.env.NESSIE_API_KEY = KEY;
    setBackendForTests(client({ baseUrl: "http://127.0.0.1:1" }));
    try {
      const { out, chain, s } = await shop("sim/hasty");
      expect(out.transaction.status).toBe("completed");
      expect(out.bank?.status).toBe("error");
      expect(chain.some((e) => e.action === "bank_error")).toBe(true);
      expect(JSON.stringify(chain)).not.toContain(KEY);
      expect(verify(s.sessionId).valid).toBe(true);
    } finally { if (prev === undefined) delete process.env.NESSIE_API_KEY; else process.env.NESSIE_API_KEY = prev; }
  });

  it("still completes checkout when Nessie returns 500s", async () => {
    setBackendForTests(client());
    const fake: NessieApi = Object.assign(Object.create(client()), {
      createPurchase: async () => { throw new NessieError("Nessie POST /accounts/x/purchases -> HTTP 500"); },
    });
    setBackendForTests(fake);
    const { out, chain } = await shop("sim/brand-blind");
    expect(out.transaction.status).toBe("completed");
    expect(chain.some((e) => e.action === "bank_error")).toBe(true);
  });

  it("logs bank_declined (no charge) on an enforce-mode block", async () => {
    setBackendForTests(new SimulatedNessie());
    const s = createSession({ model: "sim/gullible", instruction: "Buy AirPods Pro 2", budget: 50, guardrail: "enforce" }, { internal: true });
    const p = search({ q: "AirPods Pro 2" })[0];
    addToCart(s.sessionId, p.id, 3);
    const out = await checkout(s.sessionId);
    expect(out.transaction.status).toBe("blocked");
    expect(out.bank).toMatchObject({ status: "declined", simulated: true, provider: "simulated_ledger" });
    const chain = getChain(s.sessionId);
    expect(chain.some((e) => e.action === "bank_declined")).toBe(true);
    expect(chain.some((e) => e.action === "bank_charge")).toBe(false);
  });
});

describe("whole-dollar amounts", () => {
  it("rounds for the real API and keeps cents on the simulated ledger", async () => {
    const { toNessieAmount } = await import("@/lib/nessie/ledger");
    expect(toNessieAmount({ simulated: false }, 229.99)).toBe(230);
    expect(toNessieAmount({ simulated: false }, 644.49)).toBe(644);
    expect(toNessieAmount({ simulated: true }, 229.99)).toBe(229.99);
  });
});
