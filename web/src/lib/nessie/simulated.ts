// In-process simulated ledger with the same NessieApi interface as the HTTP client. Used only when neither
// NESSIE_API_KEY nor NESSIE_BASE_URL is set, so the demo always works offline. Everything it returns is flagged
// `simulated: true` upstream. State lives in the JSON store (db.nessie.sim) so balances survive restarts.
import crypto from "node:crypto";
import { mutate, read } from "../db";
import type { NessieState } from "../types";
import {
  NessieError, SHAPES, type NessieApi, type NewAccount, type NewCustomer, type NewDeposit, type NewMerchant, type NewPurchase,
} from "./client";

type Sim = NonNullable<NessieState["sim"]>;
type Obj = Record<string, unknown>;

const oid = () => crypto.randomBytes(12).toString("hex"); // 24-hex, like Nessie's Mongo ids
const digits = (k: number) => Array.from(crypto.randomBytes(k), (b) => String(b % 10)).join("");

function sim<T>(fn: (s: Sim) => T): T {
  return mutate((db) => {
    db.nessie ??= { backends: {} };
    db.nessie.sim ??= { customers: [], accounts: [], merchants: [], purchases: [], deposits: [] };
    return fn(db.nessie.sim);
  });
}
const peek = (): Sim => read().nessie?.sim ?? { customers: [], accounts: [], merchants: [], purchases: [], deposits: [] };

export class SimulatedNessie implements NessieApi {
  readonly simulated = true;
  readonly label = "simulated_ledger";
  readonly cacheKey = "simulated";

  async createCustomer(c: NewCustomer) {
    return sim((s) => { const o = { _id: oid(), ...c }; s.customers.push(o); return o._id; });
  }

  async createAccount(customerId: string, a: NewAccount) {
    return sim((s) => {
      if (!s.customers.find((c) => c._id === customerId)) throw new NessieError(`simulated: customer ${customerId} not found`, 404);
      const o = { _id: oid(), customer_id: customerId, account_number: a.account_number ?? digits(16), ...a };
      s.accounts.push(o);
      return o._id;
    });
  }

  async getAccount(accountId: string) {
    const a = peek().accounts.find((x) => x._id === accountId);
    if (!a) throw new NessieError(`simulated: account ${accountId} not found`, 404);
    return SHAPES.account(a);
  }

  async createMerchant(m: NewMerchant) {
    return sim((s) => { const o = { _id: oid(), ...m }; s.merchants.push(o); return o._id; });
  }

  async listMerchants() { return peek().merchants.map(SHAPES.merchant); }

  async createPurchase(accountId: string, p: NewPurchase) {
    return sim((s) => {
      const a = s.accounts.find((x) => x._id === accountId) as Obj | undefined;
      if (!a) throw new NessieError(`simulated: account ${accountId} not found`, 404);
      if (!s.merchants.find((m) => m._id === p.merchant_id)) throw new NessieError(`simulated: merchant ${p.merchant_id} not found`, 404);
      const o = { _id: oid(), type: "merchant", payer_id: accountId, ...p };
      s.purchases.push(o);
      a.balance = round2(Number(a.balance ?? 0) - p.amount);
      return o._id;
    });
  }

  async listPurchases(accountId: string) {
    return peek().purchases.filter((p) => p.payer_id === accountId).map(SHAPES.purchase);
  }

  async createDeposit(accountId: string, d: NewDeposit) {
    return sim((s) => {
      const a = s.accounts.find((x) => x._id === accountId) as Obj | undefined;
      if (!a) throw new NessieError(`simulated: account ${accountId} not found`, 404);
      const o = { _id: oid(), type: "deposit", payee_id: accountId, ...d };
      s.deposits.push(o);
      a.balance = round2(Number(a.balance ?? 0) + d.amount);
      return o._id;
    });
  }
}

const round2 = (x: number) => Math.round(x * 100) / 100;
