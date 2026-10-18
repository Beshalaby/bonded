// Tiny, dependency-free HTML helpers for listing extraction. Regex-based on purpose: we only need text, a few
// attributes and some JSON blobs, and we never render or execute anything from the page.

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", hellip: "…", trade: "™", reg: "®", copy: "©", deg: "°", times: "×", bull: "•", middot: "·",
  eacute: "é", egrave: "è", aacute: "á", agrave: "à", oacute: "ó", uacute: "ú", iacute: "í", ntilde: "ñ", uuml: "ü",
  ouml: "ö", auml: "ä", ccedil: "ç", pound: "£", euro: "€", yen: "¥", cent: "¢", frac12: "½", laquo: "«", raquo: "»",
  zwj: "", zwnj: "", shy: "",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]{1,8});?/gi, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : "";
    }
    const v = NAMED[e.toLowerCase()];
    return v ?? m;
  });
}

const clean = (s: string) => s.replace(/[​-‍﻿]/g, "").replace(/[ \t\f\v ]+/g, " ");

/** Visible-ish text of an HTML fragment: drops script/style/svg, keeps block structure as newlines.
 *  Text inside display:none etc. is KEPT (an agent reading page text sees it too). */
export function htmlToText(html: string, max = 50_000): string {
  let h = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head|button|select|option)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|ul|ol|table|dd|dt|blockquote)\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ");
  h = h.replace(/<[^>]+>/g, " ");
  const lines = decodeEntities(h).split(/\n/).map((l) => clean(l).trim()).filter(Boolean);
  const out = lines.join("\n").replace(/\n{3,}/g, "\n\n");
  return out.length > max ? out.slice(0, max) : out;
}

/** One-line text. */
export const inlineText = (html: string, max = 2000) => htmlToText(html, max * 2).replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Attributes of a single opening tag string. */
export function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const body = tag.replace(/^<\s*[a-zA-Z0-9-]+/, "").replace(/\/?>$/, "");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

/** All <meta> tags as property/name/itemprop -> content (first wins). */
export function metaMap(html: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const k = (a.property || a.name || a.itemprop || "").toLowerCase();
    if (k && a.content != null && !map.has(k)) map.set(k, a.content.trim());
  }
  return map;
}

/** HTML from the opening tag that contains `marker` (an id/class/attribute snippet) to its matching close tag.
 *  Balanced by counting same-name tags; falls back to a fixed window. */
export function section(html: string, marker: string | RegExp, maxLen = 60_000): string | undefined {
  const at = typeof marker === "string" ? html.indexOf(marker) : html.search(marker);
  if (at < 0) return undefined;
  return sectionAt(html, html.lastIndexOf("<", at), maxLen);
}

/** Balanced element starting at the `<` at index `open`. */
export function sectionAt(html: string, open: number, maxLen = 60_000): string {
  const nameM = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(open, open + 40));
  if (!nameM) return html.slice(open, open + maxLen);
  const name = nameM[1].toLowerCase();
  if (/^(br|hr|img|input|meta|link|source|wbr)$/.test(name)) return html.slice(open, html.indexOf(">", open) + 1);
  const re = new RegExp(`<(/?)${name}\\b[^>]*?(/?)>`, "gi");
  re.lastIndex = open;
  let depth = 0, m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m.index - open > maxLen) break;
    if (m[2] === "/") continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(open, m.index + m[0].length);
  }
  return html.slice(open, open + maxLen);
}

// ---------------------------------------------------------------- hidden text
const HIDDEN_ATTR = /\bstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:\.0*)?(?:px|em|rem|pt|%)?\s*(?=[;"'!])|opacity\s*:\s*0(?:\.0*)?\s*(?=[;"'!])|color\s*:\s*(?:#fff(?:fff)?\b|white\b|transparent\b|rgba\([^)]*,\s*0\))|(?:left|top|text-indent)\s*:\s*-\d{3,}|clip\s*:\s*rect\(0|height\s*:\s*0(?:px)?\s*;[^"']*overflow\s*:\s*hidden)[^"']*["']|\shidden(?=[\s>=/])|aria-hidden\s*=\s*["']?true|class\s*=\s*["'][^"']*\b(?:sr-only|visually-hidden|hidden|d-none|offscreen)\b/i;

/** Instruction-like wording aimed at an AI/shopping agent. Used to pick out hidden text worth showing Shield. */
export const AGENT_DIRECTED = /\b(ignore (?:all |any |your |the |previous |prior )|disregard|system\s*:|system prompt|assistant\s*:|as an ai|ai (?:agent|assistant|shopper)|language model|llm|instructions?\b|override|pre-?approved|already (?:approved|authori[sz]ed)|you must (?:buy|purchase|add|order|select)|(?:buy|purchase|order|add) (?:\d+|two|three|several|all|multiple)\b|add (?:this|it|\w+) to (?:the )?cart|checkout immediately|budget (?:does not|doesn't|no longer) apply|regardless of (?:the )?budget|do not (?:tell|inform|mention)|without (?:asking|confirm))/i;

export interface HiddenScan { snippets: string[]; comments: string[] }

/** Text inside visually hidden elements and HTML comments. `strict` keeps only agent-directed text
 *  (whole pages are full of harmless hidden UI); otherwise everything with a few words is kept. */
export function hiddenText(html: string, strict: boolean, cap = 2500): HiddenScan {
  const snippets: string[] = [];
  const comments: string[] = [];
  const seen = new Set<string>();
  let total = 0;
  const push = (arr: string[], t: string) => {
    const s = t.replace(/\s+/g, " ").trim();
    if (s.split(" ").length < 3 || !/[a-z]{3}/i.test(s) || seen.has(s) || total > cap) return;
    if (strict && !AGENT_DIRECTED.test(s)) return;
    seen.add(s); total += s.length; arr.push(s.slice(0, 600));
  };
  const scan = html.replace(/<(script|style|svg|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ");
  for (const m of scan.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g)) {
    if (!HIDDEN_ATTR.test(m[0])) continue;
    if (/^(input|img|meta|link|br|hr|source|iframe)$/i.test(m[1])) continue;
    if (total > cap) break;
    push(snippets, inlineText(sectionAt(scan, m.index!, 6000), 800));
  }
  for (const m of html.matchAll(/<!--([\s\S]*?)-->/g)) {
    const t = m[1];
    if (/^\s*\[if|^\s*<|^\s*\/?(?:ko|ng|react|ebay|ux|x-)\b/i.test(t) || /[{};]{3,}/.test(t)) continue;
    push(comments, decodeEntities(t));
  }
  return { snippets, comments };
}

// ---------------------------------------------------------------- numbers
const SYMBOLS: [RegExp, string][] = [
  [/C\s?\$|CA\$|CAD/i, "CAD"], [/AU?\s?\$|AUD/i, "AUD"], [/US\s?\$|USD/i, "USD"], [/£|GBP/i, "GBP"], [/€|EUR/i, "EUR"],
  [/¥|JPY/i, "JPY"], [/₹|INR/i, "INR"], [/\$/, "USD"],
];
export function currencyOf(s: string): string | undefined {
  for (const [re, c] of SYMBOLS) if (re.test(s)) return c;
  return undefined;
}

/** "US $1,234.56" -> 1234.56; "1.234,56 €" -> 1234.56; ranges take the first number. */
export function parsePrice(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : undefined;
  if (typeof v !== "string") return undefined;
  const m = /(\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/.exec(v.replace(/ /g, " "));
  if (!m) return undefined;
  let n = m[1].replace(/\s/g, "");
  const lastDot = n.lastIndexOf("."), lastComma = n.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) n = lastComma > lastDot ? n.replace(/\./g, "").replace(",", ".") : n.replace(/,/g, "");
  else if (lastComma >= 0) n = /,\d{1,2}$/.test(n) ? n.replace(",", ".") : n.replace(/,/g, "");
  else if (lastDot >= 0 && /\.\d{3}$/.test(n) && n.split(".").length > 2) n = n.replace(/\./g, "");
  const x = Number(n);
  return Number.isFinite(x) && x >= 0 ? Math.round(x * 100) / 100 : undefined;
}

export const num = (v: unknown): number | undefined => {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") { const x = Number(v.replace(/[,\s]/g, "").match(/-?\d+(?:\.\d+)?/)?.[0]); return Number.isFinite(x) ? x : undefined; }
  return undefined;
};

/** "1.2K" -> 1200 */
export function countOf(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = /(\d[\d,.]*)\s*([kKmM])?/.exec(s);
  if (!m) return undefined;
  let x = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(x)) return undefined;
  if (m[2]) x *= /k/i.test(m[2]) ? 1e3 : 1e6;
  return Math.round(x);
}

export function absUrl(u: string | undefined, base: string): string | undefined {
  if (!u) return undefined;
  try {
    const x = new URL(u.trim(), base);
    return x.protocol === "https:" || x.protocol === "http:" ? x.href : undefined;
  } catch { return undefined; }
}
