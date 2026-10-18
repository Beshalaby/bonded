// The address this server is reachable at from other devices. scripts/public.sh writes the current tunnel link to
// a file (BONDED_PUBLIC_URL_FILE) and its watchdog rewrites it when Cloudflare hands out a new link, so the server
// follows a changed link without a restart. BONDED_PUBLIC_URL is the static fallback (e.g. a deployment's domain).
import fs from "node:fs";

let cache: { at: number; url: string | null } | null = null;

const valid = (raw: string) => {
  const u = raw.trim().replace(/\/+$/, "");
  return /^https?:\/\/[^/\s]+$/.test(u) ? u : null;
};

export function currentPublicUrl(): string | null {
  if (cache && Date.now() - cache.at < 3000) return cache.url;
  let url: string | null = null;
  const file = process.env.BONDED_PUBLIC_URL_FILE;
  if (file) { try { url = valid(fs.readFileSync(file, "utf8")); } catch { /* not written yet */ } }
  url ??= valid(process.env.BONDED_PUBLIC_URL || "");
  cache = { at: Date.now(), url };
  return url;
}

/** Hostname of the current public link, for the MCP Host allowlist. */
export function currentPublicHost(): string | null {
  const u = currentPublicUrl();
  try { return u ? new URL(u).hostname.toLowerCase() : null; } catch { return null; }
}
