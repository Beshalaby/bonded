// SSRF guard for real-listing checks (lib/shield/web/fetch.ts). A local HTTP server stands in for "the internet":
// the fetcher's DNS is injected (public-looking answers) and the vetted address is dialed through the _dial test seam.
import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BlockedError, FetchError, checkUrl, isBlockedAddress, safeFetch, type Resolved, type SafeFetchOptions } from "@/lib/shield/web/fetch";

let server: http.Server;
let port = 0;
const PUBLIC_IP = "93.184.216.34";
const routes: Record<string, (req: http.IncomingMessage, res: http.ServerResponse) => void> = {
  "/ok": (_q, r) => { r.writeHead(200, { "content-type": "text/html; charset=utf-8" }); r.end("<html><title>Shoe</title><p>hello</p></html>"); },
  "/to-metadata": (_q, r) => { r.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }); r.end(); },
  "/to-internal": (_q, r) => { r.writeHead(301, { location: "http://intranet.bonded-fixture.com/admin" }); r.end(); },
  "/to-loopback-v6": (_q, r) => { r.writeHead(307, { location: "http://[::1]/" }); r.end(); },
  "/to-odd-port": (_q, r) => { r.writeHead(302, { location: "http://shop.bonded-fixture.com:8080/x" }); r.end(); },
  "/to-ok": (_q, r) => { r.writeHead(302, { location: "/ok" }); r.end(); },
  "/big": (_q, r) => {
    r.writeHead(200, { "content-type": "text/html" });
    const chunk = Buffer.alloc(64 * 1024, "a");
    let sent = 0;
    const pump = () => { while (sent < 6 * 1024 * 1024) { sent += chunk.length; if (!r.write(chunk)) { r.once("drain", pump); return; } } r.end(); };
    pump();
  },
  "/bomb": (_q, r) => { r.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }); r.end(zlib.gzipSync(Buffer.alloc(8 * 1024 * 1024, "a"))); },
  "/slow": () => { /* never answers */ },
  "/png": (_q, r) => { r.writeHead(200, { "content-type": "image/png" }); r.end(Buffer.alloc(100)); },
  "/forbidden": (_q, r) => { r.writeHead(403, { "content-type": "text/html" }); r.end("<html><title>Access Denied</title></html>"); },
  "/captcha": (_q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end("<html><head><title>Robot Check</title></head><body>Type the characters you see</body></html>"); },
};
for (let i = 0; i < 6; i++) routes[`/loop${i}`] = (_q, r) => { r.writeHead(302, { location: `/loop${i + 1}` }); r.end(); };

beforeAll(async () => {
  server = http.createServer((req, res) => (routes[new URL(req.url!, "http://x").pathname] ?? ((_q, r) => { r.writeHead(404); r.end(); }))(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => { server.closeAllConnections(); server.close(); });

const dns: Record<string, string[]> = {
  "shop.bonded-fixture.com": [PUBLIC_IP],
  "intranet.bonded-fixture.com": ["192.168.1.10"],
  "split.bonded-fixture.com": [PUBLIC_IP, "127.0.0.1"],
  "meta.bonded-fixture.com": ["169.254.169.254"],
  "v6.bonded-fixture.com": ["fd00:ec2::254"],
};
let lookups: string[] = [];
const opts = (o: SafeFetchOptions = {}): SafeFetchOptions => ({
  resolve: async (h) => { lookups.push(h); const a = dns[h]; if (!a) throw new Error("ENOTFOUND"); return a.map((address): Resolved => ({ address, family: address.includes(":") ? 6 : 4 })); },
  _dial: () => ({ address: "127.0.0.1", port }),
  ...o,
});
const U = (p: string) => `http://shop.bonded-fixture.com${p}`;

async function code(p: Promise<unknown>): Promise<string> {
  try { await p; return "ok"; } catch (e) { return e instanceof BlockedError ? "blocked" : e instanceof FetchError ? e.code : `other:${(e as Error).message}`; }
}

describe("address policy", () => {
  it("blocks private, loopback, link-local, CGNAT, multicast, metadata and IPv6 ULA/link-local/mapped", () => {
    for (const ip of ["127.0.0.1", "127.9.9.9", "10.0.0.1", "10.255.1.2", "172.16.0.1", "172.31.255.1", "192.168.0.1", "169.254.169.254",
      "100.64.0.1", "100.100.100.200", "0.0.0.0", "224.0.0.1", "239.1.2.3", "255.255.255.255", "198.18.0.1",
      "::1", "::", "fe80::1", "fc00::1", "fd00:ec2::254", "ff02::1", "::ffff:127.0.0.1", "::ffff:8.8.8.8", "64:ff9b::7f00:1", "2002:7f00:1::1", "[::1]"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "93.184.216.34", "151.101.1.69", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e"]) expect(isBlockedAddress(ip), ip).toBe(false);
    expect(isBlockedAddress("not-an-ip")).toBe(true);
  });

  it("checkUrl rejects bad schemes, credentials, ports and local names before any DNS", () => {
    const bad = (u: string) => { try { checkUrl(u); return "ok"; } catch (e) { return (e as FetchError).code; } };
    expect(bad("ftp://example.com/x")).toBe("bad_url");
    expect(bad("file:///etc/passwd")).toBe("bad_url");
    expect(bad("javascript:alert(1)")).toBe("bad_url");
    expect(bad("http://user:pw@shop.bonded-fixture.com/")).toBe("bad_url");
    expect(bad("http://shop.bonded-fixture.com:8080/")).toBe("bad_url");
    expect(bad("https://shop.bonded-fixture.com:22/")).toBe("bad_url");
    expect(bad("http://localhost/")).toBe("blocked_host");
    expect(bad("http://LOCALHOST./")).toBe("blocked_host");
    expect(bad("http://api.localhost/")).toBe("blocked_host");
    expect(bad("http://printer.local/")).toBe("blocked_host");
    expect(bad("http://metadata.google.internal/computeMetadata/v1/")).toBe("blocked_host");
    expect(bad("http://intranet/")).toBe("blocked_host");
    expect(bad("http://127.0.0.1/")).toBe("blocked_host");
    expect(bad("http://2130706433/")).toBe("blocked_host");   // decimal 127.0.0.1
    expect(bad("http://0x7f.1/")).toBe("blocked_host");       // hex shorthand
    expect(bad("http://10.0.0.8/")).toBe("blocked_host");
    expect(bad("http://169.254.169.254/latest/meta-data/")).toBe("blocked_host");
    expect(bad("http://[::1]/")).toBe("blocked_host");
    expect(bad("http://[::ffff:127.0.0.1]/")).toBe("blocked_host");
    expect(bad("http://[fe80::1]/")).toBe("blocked_host");
    expect(bad("https://www.ebay.com/itm/123")).toBe("ok");
    expect(bad("http://www.amazon.com:443/dp/B0")).toBe("ok");
  });
});

describe("safeFetch", () => {
  it("fetches a public page through the pinned, vetted address", async () => {
    lookups = [];
    const r = await safeFetch(U("/ok"), opts());
    expect(r.status).toBe(200);
    expect(r.body).toContain("hello");
    expect(r.address).toBe(PUBLIC_IP);
    expect(lookups).toEqual(["shop.bonded-fixture.com"]); // one resolution; the socket never asks DNS again
  });

  it("rejects hosts that resolve to private or metadata addresses, even if only one record is private", async () => {
    expect(await code(safeFetch("http://intranet.bonded-fixture.com/", opts()))).toBe("blocked_host");
    expect(await code(safeFetch("http://split.bonded-fixture.com/", opts()))).toBe("blocked_host");
    expect(await code(safeFetch("http://meta.bonded-fixture.com/", opts()))).toBe("blocked_host");
    expect(await code(safeFetch("http://v6.bonded-fixture.com/", opts()))).toBe("blocked_host");
    expect(await code(safeFetch("http://127.0.0.1/", opts()))).toBe("blocked_host");
    expect(await code(safeFetch("http://localhost/", opts()))).toBe("blocked_host");
    expect(await code(safeFetch("http://[::1]/", opts()))).toBe("blocked_host");
    expect(await code(safeFetch("http://169.254.169.254/latest/meta-data/", opts()))).toBe("blocked_host");
    expect(await code(safeFetch("http://nowhere.bonded-fixture.com/", opts()))).toBe("dns");
  });

  it("re-validates every redirect", async () => {
    expect(await code(safeFetch(U("/to-metadata"), opts()))).toBe("blocked_host");
    expect(await code(safeFetch(U("/to-internal"), opts()))).toBe("blocked_host");
    expect(await code(safeFetch(U("/to-loopback-v6"), opts()))).toBe("blocked_host");
    expect(await code(safeFetch(U("/to-odd-port"), opts()))).toBe("bad_url");
    const ok = await safeFetch(U("/to-ok"), opts());
    expect(ok.url).toBe(U("/ok"));
    expect(ok.redirects).toEqual([U("/ok")]);
  });

  it("follows at most 4 redirects", async () => {
    expect(await code(safeFetch(U("/loop0"), opts()))).toBe("too_many_redirects");
    expect(await code(safeFetch(U("/loop2"), opts()))).toBe("http"); // loop2 → … → loop6 (404) is 4 hops
  });

  it("caps the body at 4 MB, compressed or not", async () => {
    expect(await code(safeFetch(U("/big"), opts()))).toBe("too_large");
    expect(await code(safeFetch(U("/bomb"), opts()))).toBe("too_large");
    expect(await code(safeFetch(U("/big"), opts({ maxBytes: 1024 })))).toBe("too_large");
  });

  it("times out", async () => {
    const t = Date.now();
    expect(await code(safeFetch(U("/slow"), opts({ timeoutMs: 300 })))).toBe("timeout");
    expect(Date.now() - t).toBeLessThan(3000);
  });

  it("only accepts HTML or JSON", async () => {
    expect(await code(safeFetch(U("/png"), opts()))).toBe("content_type");
  });

  it("reports bot walls as BlockedError instead of trying to get past them", async () => {
    const e = await safeFetch(U("/forbidden"), opts()).catch((x) => x);
    expect(e).toBeInstanceOf(BlockedError);
    expect((e as BlockedError).status).toBe(403);
    expect((e as BlockedError).site).toBe("shop.bonded-fixture.com");
    expect(await code(safeFetch(U("/captcha"), opts()))).toBe("blocked");
  });
});
