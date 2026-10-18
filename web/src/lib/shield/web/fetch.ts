// SSRF-safe page fetcher for real-world listing checks (/check, MCP vet_listing).
//
// The URL comes from anyone on the internet, so every hop is treated as hostile:
//   - http/https only, ports 80/443 only, no credentials in the URL;
//   - we resolve DNS ourselves (all A/AAAA records) and refuse the request if ANY address is private, loopback,
//     link-local, CGNAT, multicast, reserved, cloud metadata or IPv6 ULA/link-local/mapped;
//   - the connection is pinned to the address we vetted (custom `lookup`), so a second DNS answer cannot rebind it;
//   - redirects are followed by hand (max 4), and every Location goes through the same checks;
//   - 10 s total deadline, 4 MB cap on the decoded body (streamed, aborted on overflow), HTML/JSON content only.
// We present a normal desktop browser UA. We never try to get past bot walls: a 403/429/503 or a captcha page
// becomes a BlockedError so the UI can offer "paste the listing text instead".
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";

export const MAX_BYTES = 4 * 1024 * 1024;
export const TIMEOUT_MS = 10_000;
export const MAX_REDIRECTS = 4;

export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export type FetchErrorCode =
  | "bad_url" | "blocked_host" | "dns" | "too_many_redirects" | "timeout" | "too_large" | "content_type" | "http" | "network";

export class FetchError extends Error {
  constructor(public code: FetchErrorCode, message: string, public status?: number) { super(message); this.name = "FetchError"; }
}
/** The site refused automated access (bot wall, captcha, 403/429/503). Not retried, not bypassed. */
export class BlockedError extends Error {
  constructor(public status: number, public site: string, public reason: string) {
    super(`${site} blocked automated access (${reason})`);
    this.name = "BlockedError";
  }
}

export interface Resolved { address: string; family: 4 | 6 }
export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Accept JSON bodies too (default true). */
  allowJson?: boolean;
  /** Extra acceptable content types for a known data endpoint (e.g. Shopify's product .js, served as text/javascript). */
  extraTypes?: RegExp;
  /** Extra request headers (e.g. Referer for an eBay description iframe). Hop-by-hop and Host are ignored. */
  headers?: Record<string, string>;
  /** DNS resolver (default dns.promises.lookup, all records). Injected in tests. */
  resolve?: (host: string) => Promise<Resolved[]>;
  /** TEST SEAM ONLY: where to actually dial once an address has been vetted. Production never sets it. */
  _dial?: (vetted: Resolved, port: number) => { address: string; port: number };
}

export interface SafeFetchResult {
  url: string;          // final URL after redirects
  status: number;
  contentType: string;
  body: string;
  bytes: number;
  redirects: string[];
  address: string;      // the vetted IP we connected to
}

// ---------------------------------------------------------------- address policy
const BLOCK = new net.BlockList();
for (const [a, p] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) BLOCK.addSubnet(a, p, "ipv4");
for (const [a, p] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 32],
  ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) BLOCK.addSubnet(a, p, "ipv6");
// fd00:ec2::254 (AWS IMDS over IPv6) is inside fc00::/7; 169.254.169.254 and 100.100.100.200 (Alibaba) are covered above.

/** True when the IP literal must never be fetched. Unparseable input counts as blocked. */
export function isBlockedAddress(ip: string): boolean {
  const a = ip.replace(/^\[|\]$/g, "").split("%")[0];
  const fam = net.isIP(a);
  if (fam === 4) return BLOCK.check(a, "ipv4");
  if (fam === 6) {
    // IPv4-mapped (::ffff:a.b.c.d / ::ffff:7f00:1): never legitimately returned for a public host. Canonicalise first.
    // (Not in the BlockList: Node matches ::ffff:0:0/96 rules against every plain IPv4 address.)
    let canon = a.toLowerCase();
    try { canon = new URL(`http://[${a}]/`).hostname.replace(/^\[|\]$/g, ""); } catch { return true; }
    if (/^::ffff:/.test(canon) || /^0:0:0:0:0:ffff:/.test(canon)) return true;
    return BLOCK.check(a, "ipv6");
  }
  return true;
}

const BLOCKED_NAMES = /(^|\.)(localhost|localdomain|local|internal|intranet|lan|home|corp|private|test|invalid|example|onion|arpa)$/i;
const METADATA_NAMES = new Set(["metadata", "metadata.google.internal", "metadata.goog", "instance-data", "instance-data.ec2.internal"]);

/** Parse and statically validate a URL (scheme, credentials, port, hostname shape). Throws FetchError. */
export function checkUrl(raw: string | URL): URL {
  let u: URL;
  try { u = typeof raw === "string" ? new URL(raw.trim()) : new URL(raw.href); } catch { throw new FetchError("bad_url", "That doesn't look like a web address."); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new FetchError("bad_url", "Only http and https links can be checked.");
  if (u.username || u.password) throw new FetchError("bad_url", "Links with embedded credentials are not allowed.");
  if (u.port && u.port !== "80" && u.port !== "443") throw new FetchError("bad_url", "Only the standard web ports (80, 443) are allowed.");
  const host = u.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host) throw new FetchError("bad_url", "The link has no host.");
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new FetchError("blocked_host", "That address is private or reserved.");
  } else {
    if (!host.includes(".") || BLOCKED_NAMES.test(host) || METADATA_NAMES.has(host)) throw new FetchError("blocked_host", "That host is not a public website.");
    if (!/^[a-z0-9.-]+$/.test(host)) throw new FetchError("bad_url", "That host name is not valid."); // URL() punycodes IDNs
  }
  u.hash = "";
  return u;
}

async function defaultResolve(host: string): Promise<Resolved[]> {
  const rs = await dns.promises.lookup(host, { all: true, verbatim: true });
  return rs.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
}

/** Resolve the URL's host and vet every address. Returns the address to pin. */
async function vet(u: URL, resolve: SafeFetchOptions["resolve"]): Promise<Resolved> {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const fam = net.isIP(host);
  if (fam) return { address: host, family: fam === 6 ? 6 : 4 }; // already checked in checkUrl
  let rs: Resolved[];
  try { rs = await (resolve ?? defaultResolve)(host); }
  catch { throw new FetchError("dns", `Couldn't find ${host}.`); }
  if (!rs.length) throw new FetchError("dns", `Couldn't find ${host}.`);
  // Strict: one private answer poisons the whole set (classic split-horizon / rebinding trick).
  if (rs.some((r) => isBlockedAddress(r.address))) throw new FetchError("blocked_host", `${host} resolves to a private or reserved address.`);
  return rs.find((r) => r.family === 4) ?? rs[0];
}

// ---------------------------------------------------------------- bot walls
const WALL_TITLE = /<title[^>]*>\s*([^<]*(?:robot check|captcha|access denied|pardon our interruption|attention required|just a moment|are you a (?:human|robot)|security check|verify you are human|bot detection|request blocked|something went wrong!)[^<]*)<\/title>/i;
const WALL_MARKERS = [
  "/errors/validatecaptcha", "captcha-delivery.com", "px-captcha", "cf-chl-", "challenges.cloudflare.com/turnstile",
  "perimeterx", "_incapsula_resource", "distil_r_captcha", "geo.captcha-delivery", "splashui/captcha", "/sttc/px/",
];
/** Reason string when the HTML is a bot wall rather than a page, else null. */
export function botWallReason(status: number, html: string): string | null {
  if (status === 403 || status === 429 || status === 503) return `HTTP ${status}`;
  const head = html.slice(0, 200_000).toLowerCase();
  const t = WALL_TITLE.exec(html.slice(0, 20_000));
  if (t) return `"${t[1].trim().slice(0, 60)}" page`;
  const m = WALL_MARKERS.find((k) => head.includes(k));
  // Real product pages are big; a wall is small. Only trust markers on small documents to avoid false alarms.
  if (m && html.length < 120_000) return `challenge page (${m})`;
  return null;
}

// ---------------------------------------------------------------- one hop
interface Hop { status: number; headers: http.IncomingHttpHeaders; body?: Buffer }

function oneHop(u: URL, pin: Resolved, o: Required<Pick<SafeFetchOptions, "maxBytes" | "allowJson">> & SafeFetchOptions, signal: AbortSignal): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const https_ = u.protocol === "https:";
    const port = Number(u.port || (https_ ? 443 : 80));
    const dial = o._dial ? o._dial(pin, port) : { address: pin.address, port };
    const fam = net.isIP(dial.address) === 6 ? 6 : 4;
    const extra: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.headers ?? {})) if (!/^(host|connection|content-length|transfer-encoding|cookie|authorization)$/i.test(k)) extra[k] = v;
    const req = (https_ ? https : http).request({
      protocol: u.protocol,
      host: u.hostname.replace(/^\[|\]$/g, ""),
      servername: net.isIP(u.hostname.replace(/^\[|\]$/g, "")) ? undefined : u.hostname, // SNI + cert check stay on the real name
      port: dial.port,
      path: `${u.pathname}${u.search}`,
      method: "GET",
      agent: false,
      // Pin: whatever name Node asks about, it gets the address we vetted. No second DNS query, no rebinding.
      lookup: ((_h: string, opts: { all?: boolean }, cb: (...a: unknown[]) => void) => {
        if (opts && opts.all) cb(null, [{ address: dial.address, family: fam }]);
        else cb(null, dial.address, fam);
      }) as unknown as net.LookupFunction,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        ...extra,
      },
      signal,
    }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) { res.resume(); resolve({ status, headers: res.headers }); return; }
      const ct = String(res.headers["content-type"] || "").toLowerCase();
      const okType = !ct || /text\/html|application\/xhtml\+xml/.test(ct) || (o.allowJson && /[/+]json/.test(ct)) || /text\/plain/.test(ct) || !!o.extraTypes?.test(ct);
      // Error pages (403/429/503 walls) are read anyway, small, so we can tell a wall from a missing page.
      if (!okType && status < 400) { res.destroy(); reject(new FetchError("content_type", `Not a web page (${ct.split(";")[0] || "unknown type"}).`, status)); return; }
      const declared = Number(res.headers["content-length"]);
      if (Number.isFinite(declared) && declared > o.maxBytes * 2) { res.destroy(); reject(new FetchError("too_large", "The page is too large to check.", status)); return; }
      const enc = String(res.headers["content-encoding"] || "").toLowerCase().trim();
      let stream: Readable = res;
      if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip());
      else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
      else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
      const chunks: Buffer[] = [];
      let n = 0, raw = 0, done = false;
      res.on("data", (c: Buffer) => { raw += c.length; if (raw > o.maxBytes) fail(new FetchError("too_large", "The page is too large to check.", status)); });
      const fail = (e: Error) => { if (done) return; done = true; res.destroy(); stream.destroy(); reject(e); };
      stream.on("data", (c: Buffer) => {
        n += c.length;
        if (n > o.maxBytes) { fail(new FetchError("too_large", "The page is too large to check.", status)); return; }
        chunks.push(c);
      });
      stream.on("end", () => { if (done) return; done = true; resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }); });
      stream.on("error", (e) => fail(signal.aborted ? new FetchError("timeout", "The site took too long to respond.") : new FetchError("network", `Couldn't read the page: ${e.message}`)));
      res.on("error", (e) => fail(signal.aborted ? new FetchError("timeout", "The site took too long to respond.") : new FetchError("network", `Couldn't read the page: ${e.message}`)));
    });
    req.on("error", (e) => reject(signal.aborted ? new FetchError("timeout", "The site took too long to respond.") : new FetchError("network", `Couldn't reach the site: ${(e as Error).message}`)));
    req.end();
  });
}

function decode(buf: Buffer, contentType: string): string {
  const cs = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]
    ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 4096).toString("latin1"))?.[1]
    ?? "utf-8";
  try { return new TextDecoder(cs.toLowerCase()).decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}

export const siteOf = (u: string | URL) => {
  try { return new URL(String(u)).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
};

/** Fetch a public web page safely. Throws FetchError (bad input / limits / network) or BlockedError (bot wall). */
export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const o = { maxBytes: MAX_BYTES, allowJson: true, ...opts };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), o.timeoutMs ?? TIMEOUT_MS);
  const redirects: string[] = [];
  try {
    let u = checkUrl(raw);
    for (let hop = 0; ; hop++) {
      const pin = await vet(u, o.resolve);
      if (ac.signal.aborted) throw new FetchError("timeout", "The site took too long to respond.");
      const r = await oneHop(u, pin, o, ac.signal);
      if (r.status >= 300 && r.status < 400 && r.headers.location) {
        if (hop >= (o.maxRedirects ?? MAX_REDIRECTS)) throw new FetchError("too_many_redirects", "The link redirects too many times.");
        let next: URL;
        try { next = new URL(String(r.headers.location), u); } catch { throw new FetchError("bad_url", "The site redirected to an invalid address."); }
        u = checkUrl(next); // re-validated (scheme, port, credentials, host); vet() re-resolves on the next turn
        redirects.push(u.href);
        continue;
      }
      const ct = String(r.headers["content-type"] || "");
      const body = decode(r.body ?? Buffer.alloc(0), ct);
      const wall = botWallReason(r.status, body);
      if (wall) throw new BlockedError(r.status, siteOf(u), wall);
      if (r.status >= 400) throw new FetchError("http", `The site answered ${r.status}.`, r.status);
      return { url: u.href, status: r.status, contentType: ct, body, bytes: r.body?.length ?? 0, redirects, address: pin.address };
    }
  } catch (e) {
    if ((ac.signal.aborted && !(e instanceof BlockedError)) || (e as Error)?.name === "AbortError")
      throw new FetchError("timeout", "The site took too long to respond.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
