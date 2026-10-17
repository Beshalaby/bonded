// Capital One Nessie REST client. EVERY request/response shape assumption lives in this file (see SHAPES below),
// so a field mismatch against the real API is a one-line fix here.
//
// Backend selection (backendConfig()):
//   NESSIE_API_KEY set           -> HTTP client against NESSIE_BASE_URL (default https://api.nessieisreal.com)
//   NESSIE_BASE_URL set, no key  -> HTTP client against that URL (a mock; no key sent)
//   neither                      -> in-process simulated ledger (same NessieApi interface, `simulated: true`)
//
// Secrets: the key travels only in the query string of outgoing requests. It never appears in thrown errors,
// logs, traces or API responses: every message built here goes through redact().

export const DEFAULT_BASE_URL = "https://api.nessieisreal.com";
export const TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [300, 900];

// ---------------------------------------------------------------- shapes (adjust here)
export type AccountType = "Credit Card" | "Checking" | "Savings";
export interface Address { street_number: string; street_name: string; city: string; state: string; zip: string }
export interface NewCustomer { first_name: string; last_name: string; address: Address }
export interface NewAccount { type: AccountType; nickname: string; rewards: number; balance: number; account_number?: string }
export interface NewMerchant { name: string; category: string; address: Address; geocode: { lat: number; lng: number } }
export interface NewPurchase {
  merchant_id: string; medium: "balance" | "rewards"; purchase_date: string; amount: number;
  status: "pending" | "cancelled" | "completed"; description: string;
}
export interface NewDeposit { medium: "balance" | "rewards"; transaction_date: string; status: "pending" | "cancelled" | "completed"; amount: number; description: string }

/** Normalized views (what the rest of Bonded reads). Raw objects are kept on `raw` for debugging. */
export interface Account { id: string; type: string; nickname: string; balance: number; rewards: number; accountNumber?: string; customerId?: string; raw: Record<string, unknown> }
export interface Purchase { id: string; merchantId: string; amount: number; date: string; status: string; description: string; raw: Record<string, unknown> }
export interface Deposit { id: string; amount: number; date: string; status: string; description: string; raw: Record<string, unknown> }
export interface Merchant { id: string; name: string; raw: Record<string, unknown> }

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj => (x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : {});
const s = (x: unknown) => (x == null ? "" : String(x));
const n = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);

/** Id of a created object: Nessie answers `{code, message, objectCreated: {_id, ...}}`; tolerate a bare object too. */
export function createdObject(body: unknown): Obj {
  const b = obj(body);
  return obj(b.objectCreated ?? b.object_created ?? b.data ?? b);
}
export function idOf(o: unknown): string {
  const x = obj(o);
  return s(x._id ?? x.id ?? obj(x.objectCreated)._id);
}
const listOf = (body: unknown): Obj[] => (Array.isArray(body) ? body : Array.isArray(obj(body).results) ? (obj(body).results as unknown[]) : []).map(obj);

export const SHAPES = {
  account: (o: Obj): Account => ({
    id: idOf(o), type: s(o.type), nickname: s(o.nickname), balance: n(o.balance), rewards: n(o.rewards),
    accountNumber: o.account_number != null ? s(o.account_number) : undefined, customerId: o.customer_id != null ? s(o.customer_id) : undefined, raw: o,
  }),
  purchase: (o: Obj): Purchase => ({
    id: idOf(o), merchantId: s(o.merchant_id), amount: n(o.amount), date: s(o.purchase_date ?? o.transaction_date),
    status: s(o.status), description: s(o.description), raw: o,
  }),
  deposit: (o: Obj): Deposit => ({ id: idOf(o), amount: n(o.amount), date: s(o.transaction_date), status: s(o.status), description: s(o.description), raw: o }),
  merchant: (o: Obj): Merchant => ({ id: idOf(o), name: s(o.name), raw: o }),
  /** Nessie bodies like {code: 404, message: "..."} on an HTTP 200 are errors too. */
  bodyError: (b: unknown): { code: number; message: string } | null => {
    const o = obj(b);
    const code = Number(o.code);
    if (Number.isFinite(code) && code >= 400) return { code, message: s(o.message || o.error || "error") + (Array.isArray(o.culprit) ? ` (${(o.culprit as unknown[]).join(", ")})` : "") };
    return null;
  },
};

/** The banking interface both backends implement. */
export interface NessieApi {
  readonly simulated: boolean;
  readonly label: string;  // "capital_one_nessie" | "simulated_ledger"
  readonly cacheKey: string;
  createCustomer(c: NewCustomer): Promise<string>;
  createAccount(customerId: string, a: NewAccount): Promise<string>;
  getAccount(accountId: string): Promise<Account>;
  createMerchant(m: NewMerchant): Promise<string>;
  listMerchants(): Promise<Merchant[]>;
  createPurchase(accountId: string, p: NewPurchase): Promise<string>;
  listPurchases(accountId: string): Promise<Purchase[]>;
  createDeposit(accountId: string, d: NewDeposit): Promise<string>;
}

// ---------------------------------------------------------------- redaction
/** Remove the API key from any string (query param form and the literal value). */
export function redact(text: string, key = process.env.NESSIE_API_KEY): string {
  let out = String(text).replace(/([?&]key=)[^&\s"'#]*/gi, "$1REDACTED");
  if (key && key.length >= 3) out = out.split(key).join("REDACTED");
  return out;
}

export class NessieError extends Error {
  constructor(message: string, public status?: number, public retryable = false) {
    super(redact(message));
    this.name = "NessieError";
  }
}

// ---------------------------------------------------------------- HTTP client
export interface ClientOptions { baseUrl?: string; apiKey?: string; timeoutMs?: number; fetchImpl?: typeof fetch; retryDelaysMs?: number[] }

export class NessieClient implements NessieApi {
  readonly simulated = false;
  readonly label = "capital_one_nessie";
  readonly cacheKey: string;
  private base: string;
  private key: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;
  private delays: number[];

  constructor(o: ClientOptions = {}) {
    this.base = (o.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.key = o.apiKey ?? "";
    this.timeoutMs = o.timeoutMs ?? TIMEOUT_MS;
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.delays = o.retryDelaysMs ?? RETRY_DELAYS_MS;
    this.cacheKey = new URL(this.base).origin;
  }

  /** True when pointed at the real Nessie host (vs a mock). */
  get isLive() { return this.cacheKey === new URL(DEFAULT_BASE_URL).origin; }

  private url(path: string) {
    const u = new URL(this.base + path);
    if (this.key) u.searchParams.set("key", this.key);
    return u.toString();
  }

  async request<T = unknown>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const where = `${method} ${path}`; // never includes the query string
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(this.url(path), {
          method, headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
          body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(this.timeoutMs), cache: "no-store",
        });
      } catch (e) {
        const msg = (e as Error)?.name === "TimeoutError" ? `timed out after ${this.timeoutMs}ms` : s((e as Error)?.message || e);
        if (attempt < this.delays.length) { await sleep(this.delays[attempt]); continue; }
        throw new NessieError(`Nessie ${where} failed: ${msg}`, undefined, true);
      }
      const text = await res.text().catch(() => "");
      let parsed: unknown = undefined;
      try { parsed = text ? JSON.parse(text) : undefined; } catch { parsed = undefined; }
      const retryable = res.status === 429 || res.status >= 500;
      // POSTs are retried only where the request clearly was not applied (429, 502-504); GETs on any 5xx.
      const safe = method === "GET" || res.status === 429 || (res.status >= 502 && res.status <= 504);
      if (retryable && safe && attempt < this.delays.length) {
        const ra = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 3000) : this.delays[attempt]);
        continue;
      }
      if (!res.ok) {
        const be = SHAPES.bodyError(parsed);
        throw new NessieError(`Nessie ${where} -> HTTP ${res.status}${be ? `: ${be.message}` : text ? `: ${text.slice(0, 160)}` : ""}`, res.status, retryable);
      }
      const be = SHAPES.bodyError(parsed);
      if (be && method === "GET" && (be.code === 429 || be.code >= 500) && attempt < this.delays.length) { await sleep(this.delays[attempt]); continue; }
      if (be) throw new NessieError(`Nessie ${where} -> code ${be.code}: ${be.message}`, be.code, be.code === 429 || be.code >= 500);
      return parsed as T;
    }
  }

  private async created(path: string, body: unknown): Promise<string> {
    const out = await this.request("POST", path, body);
    const id = idOf(createdObject(out));
    if (!id) throw new NessieError(`Nessie POST ${path} returned no id`);
    return id;
  }

  createCustomer(c: NewCustomer) { return this.created("/customers", c); }
  createAccount(customerId: string, a: NewAccount) { return this.created(`/customers/${enc(customerId)}/accounts`, a); }
  async getAccount(accountId: string) { return SHAPES.account(obj(await this.request("GET", `/accounts/${enc(accountId)}`))); }
  createMerchant(m: NewMerchant) { return this.created("/merchants", m); }
  async listMerchants() { return listOf(await this.request("GET", "/merchants")).map(SHAPES.merchant); }
  createPurchase(accountId: string, p: NewPurchase) { return this.created(`/accounts/${enc(accountId)}/purchases`, p); }
  async listPurchases(accountId: string) { return listOf(await this.request("GET", `/accounts/${enc(accountId)}/purchases`)).map(SHAPES.purchase); }
  createDeposit(accountId: string, d: NewDeposit) { return this.created(`/accounts/${enc(accountId)}/deposits`, d); }
}

const enc = encodeURIComponent;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Which backend the environment asks for. Read on every call so tests (and restarts) can switch it. */
export function backendConfig(env: Record<string, string | undefined> = process.env): { kind: "http"; baseUrl: string; apiKey: string } | { kind: "simulated" } {
  const apiKey = (env.NESSIE_API_KEY || "").trim();
  const baseUrl = (env.NESSIE_BASE_URL || "").trim();
  if (env.NESSIE_DISABLED === "1") return { kind: "simulated" };
  if (apiKey || baseUrl) return { kind: "http", baseUrl: baseUrl || DEFAULT_BASE_URL, apiKey };
  return { kind: "simulated" };
}
