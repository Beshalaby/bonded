import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SESSION_TTL_MS, authMode, checkAdminToken, configuredInternalToken, cookieFrom, createSessionValue, isAdminRequest,
  verifyInternal, verifySessionValue,
} from "@/lib/auth";

const KEYS = ["BONDED_ADMIN_TOKEN", "BONDED_SESSION_SECRET", "BONDED_INTERNAL_TOKEN", "SPENDBENCH_DEMO", "NODE_ENV"] as const;
let saved: Record<string, string | undefined>;
const env = process.env as Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, env[k]]));
  for (const k of KEYS) delete env[k];
  env.NODE_ENV = "test";
});
afterEach(() => { for (const k of KEYS) if (saved[k] === undefined) delete env[k]; else env[k] = saved[k]; });

describe("authMode", () => {
  it("open in dev without a token, token when BONDED_ADMIN_TOKEN is set, closed in production", () => {
    expect(authMode()).toBe("open");
    env.BONDED_ADMIN_TOKEN = "t0ken";
    expect(authMode()).toBe("token");
    delete env.BONDED_ADMIN_TOKEN;
    env.NODE_ENV = "production";
    expect(authMode()).toBe("closed");
    env.SPENDBENCH_DEMO = "1";
    expect(authMode()).toBe("open");
    env.SPENDBENCH_DEMO = "0";
    env.NODE_ENV = "development";
    expect(authMode()).toBe("closed");
  });
});

describe("admin session cookie", () => {
  beforeEach(() => { env.BONDED_ADMIN_TOKEN = "admin-secret-token"; });

  it("a freshly signed cookie verifies", async () => {
    const { value, expires } = await createSessionValue();
    expect(value).toMatch(/^\d{13}\.[A-Za-z0-9_-]{43}$/);
    expect(expires.getTime() - Date.now()).toBeLessThanOrEqual(SESSION_TTL_MS);
    expect(await verifySessionValue(value)).toBe(true);
  });

  it("rejects a forged signature, a tampered expiry and garbage", async () => {
    const { value } = await createSessionValue();
    const [exp, sig] = value.split(".");
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(await verifySessionValue(`${exp}.${flipped}`)).toBe(false);
    expect(await verifySessionValue(`${Number(exp) - 1000}.${sig}`)).toBe(false);
    expect(await verifySessionValue("not-a-cookie")).toBe(false);
    expect(await verifySessionValue("")).toBe(false);
    expect(await verifySessionValue(undefined)).toBe(false);
  });

  it("rejects an expired cookie", async () => {
    const past = Date.now() - SESSION_TTL_MS - 1000;
    const { value } = await createSessionValue(past); // expired 1s ago
    expect(await verifySessionValue(value)).toBe(false);
  });

  it("rejects an expiry further out than the 12h TTL (validly signed)", async () => {
    const { value } = await createSessionValue(Date.now() + 60 * 60 * 1000); // expires in 13h
    expect(await verifySessionValue(value)).toBe(false);
  });

  it("a cookie signed under another secret does not verify", async () => {
    const { value } = await createSessionValue();
    env.BONDED_ADMIN_TOKEN = "rotated-token";
    expect(await verifySessionValue(value)).toBe(false);
  });

  it("no admin token means no cookie is ever valid", async () => {
    const { value } = await createSessionValue();
    delete env.BONDED_ADMIN_TOKEN;
    expect(await verifySessionValue(value)).toBe(false);
  });

  it("isAdminRequest reads the cookie header in token mode", async () => {
    const { value } = await createSessionValue();
    expect(await isAdminRequest(new Request("http://x/api/runs", { headers: { cookie: `a=1; bonded_admin=${value}` } }))).toBe(true);
    expect(await isAdminRequest(new Request("http://x/api/runs"))).toBe(false);
    expect(cookieFrom("a=1; bonded_admin=v%2E1", "bonded_admin")).toBe("v.1");
  });
});

describe("tokens", () => {
  it("checkAdminToken", async () => {
    expect(await checkAdminToken("x")).toBe(false); // no token configured
    env.BONDED_ADMIN_TOKEN = "admin-secret-token";
    expect(await checkAdminToken("admin-secret-token")).toBe(true);
    expect(await checkAdminToken("admin-secret-tokem")).toBe(false);
    expect(await checkAdminToken(undefined)).toBe(false);
    expect(await checkAdminToken("")).toBe(false);
  });

  it("internal token: explicit env wins, else derived from the admin token, else none", async () => {
    expect(await configuredInternalToken()).toBeNull();
    expect(await verifyInternal("anything")).toBe(false);
    env.BONDED_ADMIN_TOKEN = "admin-secret-token";
    const derived = await configuredInternalToken();
    expect(derived).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyInternal(derived)).toBe(true);
    env.BONDED_INTERNAL_TOKEN = "svc-token";
    expect(await verifyInternal("svc-token")).toBe(true);
    expect(await verifyInternal(derived)).toBe(false);
    expect(await verifyInternal(null)).toBe(false);
  });
});
