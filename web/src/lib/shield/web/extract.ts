// Turn a fetched product page into a NormalizedListing for Bonded Shield.
//
// Generic first (works on most stores, including Shopify, Etsy and Best Buy): JSON-LD Product/ProductGroup/Offer,
// then OpenGraph/product meta tags, then schema.org microdata. Site refinements then overlay what they know better:
// eBay (item page + description iframe), Amazon, Walmart (__NEXT_DATA__).
//
// The description is what an agent reading the page would see: visible text PLUS text hidden with CSS, `hidden`,
// aria-hidden or HTML comments, because that is where listing prompt injections live. It is capped, and it is
// only ever passed on as data.
import type { NormalizedListing } from "../types";
import {
  absUrl, attrs, countOf, currencyOf, decodeEntities, hiddenText, htmlToText, inlineText, metaMap, num, parsePrice, section,
} from "./html";

export const MAX_DESCRIPTION = 8000;
const MAX_HIDDEN = 2500;

export class ExtractError extends Error {
  constructor(message: string) { super(message); this.name = "ExtractError"; }
}

type L = Partial<NormalizedListing> & { seller?: NonNullable<NormalizedListing["seller"]> };
type J = Record<string, unknown>;

const str = (v: unknown): string | undefined => {
  if (typeof v === "string") { const s = decodeEntities(v).replace(/\s+/g, " ").trim(); return s || undefined; }
  if (typeof v === "number") return String(v);
  return undefined;
};
const nameOf = (v: unknown): string | undefined => (Array.isArray(v) ? nameOf(v[0]) : v && typeof v === "object" ? str((v as J).name) : str(v));
const arr = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const typeIs = (o: J, ...t: string[]) => arr(o["@type"] as string | string[]).some((x) => t.includes(String(x).replace(/^.*[/#]/, "")));

export function siteKey(host: string): "ebay" | "amazon" | "walmart" | "etsy" | "bestbuy" | undefined {
  const h = host.replace(/^www\./, "").toLowerCase();
  if (/(^|\.)ebay\.[a-z.]+$/.test(h)) return "ebay";
  if (/(^|\.)amazon\.[a-z.]+$/.test(h)) return "amazon";
  if (/(^|\.)walmart\.(com|ca)$/.test(h)) return "walmart";
  if (/(^|\.)etsy\.com$/.test(h)) return "etsy";
  if (/(^|\.)bestbuy\.(com|ca)$/.test(h)) return "bestbuy";
  return undefined;
}

const CONDITION: [RegExp, string][] = [
  [/refurb|renewed|restored|remanufactured/i, "refurbished"], [/for ?parts|not working|as[- ]is/i, "for parts"],
  [/open ?box/i, "open box"], [/pre-?owned|used|damaged/i, "used"], [/new/i, "new"],
];
export function normCondition(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.replace(/^https?:\/\/schema\.org\//i, "").replace(/Condition$/, "");
  const raw = t.replace(/\s+/g, " ").trim();
  if (!raw) return undefined;
  const hit = CONDITION.find(([re]) => re.test(raw));
  if (!hit) return raw.toLowerCase().slice(0, 60);
  // keep the seller's grade when there is one ("used: good")
  const grade = /:\s*([a-z][a-z -]{2,30})$/i.exec(raw)?.[1];
  return grade && hit[1] !== raw.toLowerCase() ? `${hit[1]} (${grade.toLowerCase().trim()})` : hit[1];
}

// ---------------------------------------------------------------- JSON-LD
function ldBlocks(html: string): J[] {
  const out: J[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = m[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "").trim();
    let v: unknown;
    try { v = JSON.parse(raw); } catch { try { v = JSON.parse(raw.replace(/[\u0000-\u001f]+/g, " ")); } catch { continue; } }
    const walk = (x: unknown) => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === "object") { out.push(x as J); if ((x as J)["@graph"]) walk((x as J)["@graph"]); }
    };
    walk(v);
  }
  return out;
}

function fromJsonLd(html: string): L | undefined {
  const blocks = ldBlocks(html);
  const p = blocks.find((b) => typeIs(b, "Product", "IndividualProduct", "ProductModel"))
    ?? blocks.find((b) => typeIs(b, "ProductGroup"))
    ?? blocks.find((b) => typeIs(b, "Offer") && b.itemOffered);
  if (!p) return undefined;
  const prod = typeIs(p, "Offer") ? (p.itemOffered as J) : p;
  let offers = arr(prod.offers as J | J[]).filter((o) => o && typeof o === "object");
  if (typeIs(p, "Offer")) offers = [p];
  if (!offers.length && Array.isArray(prod.hasVariant)) offers = (prod.hasVariant as J[]).flatMap((v) => arr(v?.offers as J | J[]));
  const agg = offers.find((o) => typeIs(o, "AggregateOffer"));
  const first = agg ? arr(agg.offers as J[])[0] ?? agg : offers[0];
  const spec = (first?.priceSpecification ?? undefined) as J | J[] | undefined;
  const specPrice = arr(spec).map((s) => parsePrice(s?.price)).find((x) => x != null);
  const out: L = {
    title: str(prod.name),
    description: str(prod.description),
    brand: nameOf(prod.brand) ?? nameOf(prod.manufacturer),
    model: str(prod.model) ?? str(prod.mpn),
    images: arr(prod.image as unknown).map((i) => (typeof i === "string" ? i : str((i as J)?.url) ?? str((i as J)?.contentUrl))).filter((x): x is string => !!x),
    price: parsePrice(first?.price) ?? specPrice ?? parsePrice(agg?.lowPrice),
    currency: str(first?.priceCurrency) ?? str(agg?.priceCurrency) ?? arr(spec).map((s) => str(s?.priceCurrency)).find(Boolean),
    condition: normCondition(str(first?.itemCondition) ?? str(prod.itemCondition)),
  };
  const sellerName = nameOf(first?.seller) ?? nameOf(agg?.seller);
  if (sellerName) out.seller = { name: sellerName };
  const ret = (first?.hasMerchantReturnPolicy ?? prod.hasMerchantReturnPolicy) as J | J[] | undefined;
  const r0 = arr(ret)[0];
  if (r0) {
    const cat = str(r0.returnPolicyCategory)?.replace(/^.*\//, "");
    const days = num(r0.merchantReturnDays);
    out.returns = cat === "MerchantReturnNotPermitted" ? "No returns accepted" : days ? `${days}-day returns` : cat ? cat.replace(/([a-z])([A-Z])/g, "$1 $2") : undefined;
  }
  const ship = arr(first?.shippingDetails as J | J[])[0];
  const shipRate = ship ? parsePrice((ship.shippingRate as J | undefined)?.value) : undefined;
  if (shipRate != null) out.shipping = shipRate === 0 ? "Free shipping" : `Shipping ${shipRate}`;
  // product rating (not the seller's): kept as a spec so Shield can read it
  const ar = (prod.aggregateRating ?? blocks.find((b) => typeIs(b, "AggregateRating"))
    ?? blocks.map((b) => b.aggregateRating).find(Boolean)) as J | undefined;
  const rv = num(ar?.ratingValue), rc = num(ar?.reviewCount ?? ar?.ratingCount);
  if (rv != null) out.specs = { "Product rating": `${rv}${rc != null ? ` (${rc} reviews)` : ""}` };
  const sku = str(prod.sku) ?? str(prod.gtin13) ?? str(prod.gtin12) ?? str(prod.gtin);
  if (sku) out.specs = { ...(out.specs ?? {}), SKU: sku };
  for (const pv of arr(prod.additionalProperty as J | J[])) {
    const k = str(pv?.name), v = str(pv?.value);
    if (k && v) out.specs = { ...(out.specs ?? {}), [k]: v };
  }
  return out;
}

// ---------------------------------------------------------------- OpenGraph / meta
function fromMeta(html: string): L | undefined {
  const m = metaMap(html);
  const title = m.get("og:title") ?? m.get("twitter:title");
  const price = parsePrice(m.get("product:price:amount") ?? m.get("og:price:amount") ?? m.get("twitter:data1"));
  if (!title && price == null) return undefined;
  const img = m.get("og:image:secure_url") ?? m.get("og:image") ?? m.get("twitter:image");
  return {
    title,
    description: m.get("og:description") ?? m.get("description") ?? m.get("twitter:description"),
    price,
    currency: m.get("product:price:currency") ?? m.get("og:price:currency"),
    brand: m.get("product:brand") ?? m.get("og:brand"),
    condition: normCondition(m.get("product:condition") ?? m.get("og:condition")),
    images: img ? [img] : [],
  };
}

// ---------------------------------------------------------------- microdata
function fromMicrodata(html: string): L | undefined {
  const get = (prop: string): string | undefined => {
    const re = new RegExp(`<([a-z0-9]+)\\b[^>]*\\bitemprop\\s*=\\s*["'][^"']*\\b${prop}\\b[^"']*["'][^>]*>`, "i");
    const m = re.exec(html);
    if (!m) return undefined;
    const a = attrs(m[0]);
    if (a.content) return a.content.trim();
    if (m[1].toLowerCase() === "meta" || m[1].toLowerCase() === "link") return a.href || undefined;
    if (m[1].toLowerCase() === "img") return a.src;
    return inlineText(section(html.slice(m.index), m[0].slice(0, 120), 4000) ?? "", 300) || undefined;
  };
  if (!/itemtype\s*=\s*["']https?:\/\/schema\.org\/(Product|Offer)/i.test(html)) return undefined;
  const title = get("name");
  const price = parsePrice(get("price"));
  if (!title && price == null) return undefined;
  const img = get("image");
  return {
    title, price, currency: get("priceCurrency"), brand: get("brand"),
    condition: normCondition(get("itemCondition")), images: img ? [img] : [],
    description: get("description"),
  };
}

// ---------------------------------------------------------------- eBay
function textAfter(html: string, marker: string | RegExp, max = 400): string | undefined {
  const s = section(html, marker, 20_000);
  const t = s ? inlineText(s, max) : "";
  return t || undefined;
}

export function ebayDescriptionUrl(html: string, pageUrl: string): string | undefined {
  const m = /<iframe\b[^>]*\bid\s*=\s*["']desc_ifr["'][^>]*>/i.exec(html) ?? /<iframe\b[^>]*src\s*=\s*["'][^"']*ebaydesc\.com[^"']*["'][^>]*>/i.exec(html);
  const src = m ? attrs(m[0]).src : undefined;
  const u = absUrl(src, pageUrl);
  if (!u) return undefined;
  try { return /(^|\.)ebaydesc\.com$/.test(new URL(u).hostname) ? u : undefined; } catch { return undefined; }
}

function fromEbay(html: string): L {
  const out: L = { specs: {} };
  out.title = textAfter(html, /class\s*=\s*["'][^"']*x-item-title__mainTitle/i, 300)
    ?? textAfter(html, /id\s*=\s*["']itemTitle["']/i, 300)?.replace(/^Details about\s*/i, "");
  const priceText = textAfter(html, /class\s*=\s*["'][^"']*x-price-primary/i, 80) ?? textAfter(html, /id\s*=\s*["']prcIsum["']/i, 80);
  if (priceText) { out.price = parsePrice(priceText); out.currency = currencyOf(priceText); }
  const was = textAfter(html, /class\s*=\s*["'][^"']*(?:x-additional-info__textual-display|x-price-original|ux-textspans--STRIKETHROUGH)/i, 120);
  if (was) { const w = parsePrice(was.replace(/^[^\d$£€]*/, "")); if (w && out.price && w > out.price) out.listPrice = w; }
  const cond = textAfter(html, /class\s*=\s*["'][^"']*x-item-condition-(?:text|value|max-view)/i, 120)
    ?? textAfter(html, /data-testid\s*=\s*["']x-item-condition["']/i, 120);
  if (cond) out.condition = normCondition(cond.replace(/^Condition:?\s*/i, "").split(/\s{2,}|\.|“|"| - /)[0]);

  // seller card (new layout: x-sellercard-atf, older: ux-seller-section)
  const card = section(html, /class\s*=\s*["'][^"']*(?:x-sellercard-atf|ux-seller-section|x-about-this-seller)/i, 30_000) ?? "";
  const seller: NonNullable<L["seller"]> = {};
  const aboutTitle = /x-sellercard-atf__info__about-seller[^>]*\btitle\s*=\s*["']([^"']+)["']/i.exec(card)?.[1];
  const usr = /href\s*=\s*["'][^"']*\/(?:usr|str)\/([^/?"'#]+)/i.exec(card)?.[1];
  const bold = /<span[^>]*ux-textspans--BOLD[^>]*>([^<]{2,64})<\/span>/i.exec(card)?.[1];
  seller.name = str(aboutTitle) ?? str(bold) ?? (usr ? decodeURIComponent(usr) : undefined);
  const cardText = inlineText(card, 1200);
  const pct = /(\d{2,3}(?:\.\d+)?)\s*%\s*positive/i.exec(cardText)?.[1] ?? /(\d{2,3}(?:\.\d+)?)\s*%\s*positive/i.exec(inlineText(section(html, /positive feedback|% positive/i, 3000) ?? "", 300))?.[1];
  if (pct) seller.rating = Math.round((Number(pct) / 20) * 100) / 100;
  const fb = /\(\s*(\d[\d,.]*\s*[kK]?)\s*\)/.exec(cardText)?.[1] ?? /(\d[\d,.]*\s*[kK]?)\s*(?:feedback|ratings)/i.exec(cardText)?.[1];
  if (fb) seller.reviewCount = countOf(fb);
  if (/top rated/i.test(cardText)) seller.verified = true;
  if (seller.name || seller.rating != null) out.seller = seller;
  const loc = textAfter(html, /class\s*=\s*["'][^"']*(?:ux-labels-values--itemLocation|x-item-location)/i, 160)
    ?? /Located in:?\s*([^<\n]{3,80})/i.exec(html)?.[1];
  if (loc) out.seller = { ...(out.seller ?? {}), location: loc.replace(/^Located in:?\s*/i, "").trim() };

  const ret = textAfter(html, /class\s*=\s*["'][^"']*(?:x-returns-minview|ux-labels-values--returns)/i, 240)
    ?? textAfter(html, /data-testid\s*=\s*["']x-returns-minview["']/i, 240);
  if (ret) out.returns = ret.replace(/^Returns:?\s*/i, "").replace(/\s*See details.*$/i, "").trim();
  const ship = textAfter(html, /class\s*=\s*["'][^"']*(?:ux-labels-values--shipping|x-shipping-minview|d-shipping-minview)/i, 240)
    ?? textAfter(html, /data-testid\s*=\s*["']d-shipping-minview["']/i, 240);
  if (ship) out.shipping = ship.replace(/^Shipping:?\s*/i, "").replace(/\s*See details.*$/i, "").trim();

  // item specifics: label/value pairs
  const specsHtml = section(html, /class\s*=\s*["'][^"']*(?:x-about-this-item|ux-layout-section-evo|ux-layout-section--features)/i, 200_000) ?? html;
  for (const m of specsHtml.matchAll(/class\s*=\s*["'][^"']*ux-labels-values__labels[^"']*["'][^>]*>([\s\S]{0,600}?)<\/div>\s*<\/div>\s*<\/div>\s*<div[^>]*class\s*=\s*["'][^"']*ux-labels-values__values[^"']*["'][^>]*>([\s\S]{0,1500}?)<\/div>\s*<\/div>/gi)) {
    const k = inlineText(m[1], 60).replace(/:$/, ""), v = inlineText(m[2], 200).replace(/\s*Read more.*$/i, "");
    if (k && v && k.length < 60 && Object.keys(out.specs!).length < 40) out.specs![k] = v;
  }
  for (const m of specsHtml.matchAll(/<dt\b[^>]*>([\s\S]{0,300}?)<\/dt>\s*<dd\b[^>]*>([\s\S]{0,1200}?)<\/dd>/gi)) {
    const k = inlineText(m[1], 60).replace(/:$/, ""), v = inlineText(m[2], 200);
    if (k && v && !out.specs![k] && Object.keys(out.specs!).length < 40) out.specs![k] = v;
  }
  const brand = out.specs!.Brand; if (brand) out.brand = brand;
  const model = out.specs!.Model; if (model) out.model = model;
  if (!out.condition && out.specs!.Condition) out.condition = normCondition(out.specs!.Condition);
  const img = /<div[^>]*ux-image-carousel-item[^>]*>\s*<img[^>]*>/i.exec(html)?.[0];
  if (img) { const a = attrs(img.slice(img.lastIndexOf("<img"))); const src = a["data-zoom-src"] || a.src || a["data-src"]; if (src) out.images = [src]; }
  return out;
}

// ---------------------------------------------------------------- Amazon
function fromAmazon(html: string): L {
  const out: L = { specs: {} };
  out.title = textAfter(html, /id\s*=\s*["']productTitle["']/, 400);
  const priceText = /id\s*=\s*["']apex-pricetopay-accessibility-label["'][^>]*>\s*([^<]+)</.exec(html)?.[1]
    ?? (() => {
      const core = section(html, /id\s*=\s*["'](?:corePriceDisplay_desktop_feature_div|corePrice_feature_div|apex_desktop)["']/, 60_000) ?? "";
      for (const m of core.matchAll(/class\s*=\s*["']a-offscreen["'][^>]*>\s*([^<]+?)\s*</g)) if (/\d/.test(m[1])) return m[1];
      return undefined;
    })()
    ?? /id\s*=\s*["'](?:priceblock_ourprice|priceblock_dealprice|price_inside_buybox|newBuyBoxPrice)["'][^>]*>\s*([^<]+)</.exec(html)?.[1];
  if (priceText) { out.price = parsePrice(priceText); out.currency = currencyOf(priceText) ?? "USD"; }
  else if (/id\s*=\s*["']buybox-see-all-buying-choices["']/.test(html)) out.specs!["Buy box"] = "No featured offer (only “See All Buying Options”)";
  const strike = /data-a-strike\s*=\s*["']true["'][^>]*>\s*<span[^>]*class\s*=\s*["']a-offscreen["'][^>]*>\s*([^<]+)</.exec(html)?.[1]
    ?? /(?:List Price|Typical price|Was):?\s*(?:<[^>]+>\s*)*([$£€][\d.,]+)/i.exec(html)?.[1];
  const lp = parsePrice(strike);
  if (lp && out.price && lp > out.price) out.listPrice = lp;
  const byline = textAfter(html, /id\s*=\s*["']bylineInfo["']/, 120);
  if (byline) out.brand = byline.replace(/^Visit the\s+/i, "").replace(/\s+Store$/i, "").replace(/^Brand:\s*/i, "").trim() || undefined;
  const stars = /id\s*=\s*["']acrPopover["'][^>]*title\s*=\s*["']([\d.]+) out of 5/i.exec(html)?.[1]
    ?? /class\s*=\s*["']a-icon-alt["'][^>]*>\s*([\d.]+) out of 5 stars/i.exec(html)?.[1];
  const reviews = /id\s*=\s*["']acrCustomerReviewText["'][^>]*>\s*\(?([\d,.]+[kK]?)/.exec(html)?.[1];
  if (stars) out.specs!["Product rating"] = `${stars}${reviews ? ` (${countOf(reviews)} reviews)` : ""}`;

  // Ships from / Sold by: offer-display features, the "Ships from and sold by" line, or the accordion header
  const odf = (name: string) => {
    const s = section(html, new RegExp(`class\\s*=\\s*["']offer-display-feature-text\\b[^"']*["'][^>]*offer-display-feature-name\\s*=\\s*["']desktop-${name}-info["']`), 6000);
    if (!s) return undefined;
    const msg = /class\s*=\s*["'][^"']*offer-display-feature-text-message[^"']*["'][^>]*>\s*(?:<[^>]+>\s*)*([^<]+?)\s*</.exec(s)?.[1];
    return (msg ? decodeEntities(msg).trim() : inlineText(s, 120)) || undefined;
  };
  let soldBy = /id\s*=\s*["']sellerProfileTriggerId["'][^>]*>\s*([^<]+?)\s*</i.exec(html)?.[1] ?? odf("merchant")
    ?? /Sold by:?\s*<\/span>\s*<span[^>]*>\s*([^<]+?)\s*</i.exec(html)?.[1];
  let shipsFrom = odf("fulfiller") ?? /Ships from:?\s*<\/span>\s*<span[^>]*>\s*([^<]+?)\s*</i.exec(html)?.[1];
  const both = section(html, /id\s*=\s*["']merchant-info["']/, 4000);
  const bothText = both ? inlineText(both, 300) : "";
  const sb = /Ships from and sold by\s+(.+?)\.?(?:\s{2}|$|\s+Seller)/i.exec(bothText)?.[1];
  if (sb) { soldBy ??= sb; shipsFrom ??= sb; }
  soldBy = soldBy?.trim(); shipsFrom = shipsFrom?.trim();
  if (soldBy) out.seller = { name: soldBy, verified: /^amazon(\.com)?$/i.test(soldBy) || undefined };
  if (shipsFrom) out.shipping = `Ships from ${shipsFrom}`;
  if (soldBy) out.specs!["Sold by"] = soldBy;
  if (shipsFrom) out.specs!["Ships from"] = shipsFrom;

  const used = /\b(Used|Renewed|Refurbished)\s*[:-]\s*(Like New|Very Good|Good|Acceptable|Excellent|Premium)/i.exec(html);
  out.condition = used ? normCondition(`${used[1]}: ${used[2]}`) : /\bRenewed\b/.test(out.title ?? "") ? "refurbished" : "new";
  if (/FREE Returns/i.test(html)) out.returns = "Free returns";
  else { const r = /(Returnable until [^<]{3,40}|Eligible for Return, Refund or Replacement[^<]{0,80}|Non-returnable)/i.exec(html)?.[1]; if (r) out.returns = r.trim(); }

  const img = /<img\b[^>]*\bid\s*=\s*["']landingImage["'][^>]*>/i.exec(html)?.[0];
  const imgTag = img ?? /<img[^>]*data-old-hires\s*=\s*["'][^"']+["'][^>]*>/i.exec(html)?.[0];
  if (imgTag) {
    const a = attrs(imgTag);
    let src: string | undefined = a["data-old-hires"] || a.src;
    if (!src && a["data-a-dynamic-image"]) { try { src = Object.keys(JSON.parse(a["data-a-dynamic-image"])).pop(); } catch { /* */ } }
    if (src && !src.startsWith("data:")) out.images = [src];
  }
  const bullets = section(html, /id\s*=\s*["']feature-bullets["']/, 40_000);
  const desc = section(html, /id\s*=\s*["']productDescription["']/, 40_000);
  out.description = [bullets && htmlToText(bullets, 4000).replace(/^About this item\s*/i, ""), desc && htmlToText(desc, 3000)].filter(Boolean).join("\n\n") || undefined;
  for (const m of (section(html, /id\s*=\s*["']productOverview_feature_div["']/, 30_000) ?? "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => inlineText(c[1], 120));
    if (cells.length >= 2 && cells[0] && cells[1]) out.specs![cells[0]] = cells[1];
  }
  if (!out.brand && out.specs!.Brand) out.brand = out.specs!.Brand;
  if (out.specs!["Model Name"]) out.model = out.specs!["Model Name"];
  return out;
}

// ---------------------------------------------------------------- Walmart (__NEXT_DATA__)
function fromWalmart(html: string): L {
  const m = /<script\b[^>]*id\s*=\s*["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) return {};
  let d: J;
  try { d = JSON.parse(m[1]); } catch { return {}; }
  const data = (((d.props as J)?.pageProps as J)?.initialData as J)?.data as J | undefined;
  const p = data?.product as J | undefined;
  if (!p) return {};
  const idml = (data?.idml ?? {}) as J;
  const pi = (p.priceInfo ?? {}) as J;
  const cur = (pi.currentPrice ?? {}) as J, was = (pi.wasPrice ?? {}) as J;
  const out: L = {
    title: str(p.name), brand: str(p.brand), model: str(p.model),
    price: parsePrice(cur.price), currency: str(cur.currencyUnit) ?? "USD", listPrice: parsePrice(was.price),
    condition: normCondition(str(((p.conditionV2 ?? {}) as J).text) ?? str(((p.preownedCondition ?? {}) as J).text) ?? str(p.conditionType)),
    images: arr(((p.imageInfo ?? {}) as J).allImages as J[]).map((i) => str(i?.url)).filter((x): x is string => !!x).slice(0, 4),
    specs: {},
  };
  if (/^restored\b/i.test(out.title ?? "") && (!out.condition || out.condition === "new")) out.condition = "refurbished";
  const sname = str(p.sellerDisplayName) ?? str(p.sellerName);
  if (sname) out.seller = {
    name: sname, rating: num(p.sellerAverageRating) != null ? Math.round(num(p.sellerAverageRating)! * 100) / 100 : undefined, reviewCount: num(p.sellerReviewCount),
    verified: /^walmart(\.com)?$/i.test(sname) || undefined,
  };
  const rp = (p.returnPolicy ?? {}) as J;
  if (rp.returnable === false) out.returns = "Not returnable";
  else if (rp.returnable) { const w = (rp.returnWindow ?? {}) as J; out.returns = `${rp.freeReturns ? "Free " : ""}${w.value ? `${w.value}-day ` : ""}returns`.replace(/^./, (c) => c.toUpperCase()); }
  if (num(p.averageRating) != null) out.specs!["Product rating"] = `${p.averageRating}${p.numberOfReviews ? ` (${p.numberOfReviews} reviews)` : ""}`;
  for (const s of arr(idml.specifications as J[]).slice(0, 30)) { const k = str(s?.name), v = str(s?.value); if (k && v) out.specs![k] = v; }
  const long = str(idml.longDescription), short = str(idml.shortDescription) ?? str(p.shortDescription);
  out.description = [short && htmlToText(short, 3000), long && htmlToText(long, 4000)].filter(Boolean).join("\n\n") || undefined;
  return out;
}

// ---------------------------------------------------------------- merge
function merge(into: L, from: L | undefined) {
  if (!from) return into;
  for (const [k, v] of Object.entries(from) as [keyof L, unknown][]) {
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
    if (k === "specs") into.specs = { ...(v as Record<string, string>), ...(into.specs ?? {}) };
    else if (k === "seller") into.seller = { ...(v as object), ...(into.seller ?? {}) };
    else if (into[k] == null || (Array.isArray(into[k]) && !(into[k] as unknown[]).length)) (into as Record<string, unknown>)[k] = v;
  }
  return into;
}
/** Same image at several widths (Shopify ?width=, Amazon _SX…_): keep the last, usually largest, copy. */
function dedupeImages(urls: string[]): string[] {
  const by = new Map<string, string>();
  for (const u of urls) { let k = u; try { const x = new URL(u); k = x.origin + x.pathname.replace(/\._[A-Z0-9_,]+_(?=\.\w+$)/, ""); } catch { /* */ } by.delete(k); by.set(k, u); }
  return [...by.values()];
}
const MARKETPLACE = /(^|\.)(facebook|mercari|poshmark|depop|offerup|craigslist|aliexpress|temu|shein|wish|alibaba|dhgate|rakuten|kijiji|gumtree|vinted|grailed|stockx|reverb|newegg|target|bestbuy|etsy)\./i;
const prune = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== "")) as T;

/** Main readable text when the page gave us little description. */
function mainText(html: string): string | undefined {
  const s = section(html, /<main\b/i, 300_000) ?? section(html, /itemprop\s*=\s*["']description["']/i, 100_000) ?? section(html, /<article\b/i, 200_000);
  return s ? htmlToText(s, 3000) : undefined;
}

/** Compose the agent-visible description: the listing's text plus any hidden text (labelled), capped. */
export function composeDescription(visible: string | undefined, hidden: string[], comments: string[] = []): string {
  let out = (visible ?? "").trim();
  if (out.length > MAX_DESCRIPTION - 600) out = out.slice(0, MAX_DESCRIPTION - 600) + " …";
  const extra = [...hidden, ...comments.map((c) => `<!-- ${c} -->`)];
  if (extra.length) {
    let h = extra.join("\n");
    if (h.length > MAX_HIDDEN) h = h.slice(0, MAX_HIDDEN) + " …";
    out += `${out ? "\n\n" : ""}[Text hidden on the page]\n${h}`;
  }
  return out.slice(0, MAX_DESCRIPTION);
}

/** Description text for an eBay seller description (iframe document): everything, hidden parts included. */
export function descriptionDocText(html: string): { visible: string; hidden: string[]; comments: string[] } {
  const body = section(html, /<body\b/i, 1_000_000) ?? html;
  const { snippets, comments } = hiddenText(body, false, MAX_HIDDEN);
  return { visible: htmlToText(body, MAX_DESCRIPTION), hidden: snippets, comments };
}

/** Shopify storefronts expose /products/<handle>.js. Returns that URL when the page is a Shopify product page. */
export function shopifyProductJsonUrl(html: string, pageUrl: string): string | undefined {
  if (!/cdn\.shopify\.com|\/cdn\/shop\/|Shopify\.shop\s*=|shopify-section/i.test(html.slice(0, 400_000))) return undefined;
  try {
    const u = new URL(pageUrl);
    const m = /\/products\/([a-z0-9][a-z0-9-_%]*)\/?$/i.exec(u.pathname);
    return m ? `${u.origin}/products/${m[1]}.js` : undefined;
  } catch { return undefined; }
}

/** Fill gaps from Shopify's product JSON (prices are in cents). Never overrides what the page said. */
export function mergeShopifyJson(l: NormalizedListing, json: string): NormalizedListing {
  let p: J;
  try { p = JSON.parse(json); } catch { return l; }
  const variants = arr(p.variants as J[]);
  const v = variants.find((x) => x?.available !== false) ?? variants[0];
  const cents = num(v?.price ?? p.price), was = num(v?.compare_at_price ?? p.compare_at_price);
  const price = l.price ?? (cents != null ? cents / 100 : undefined);
  const out: NormalizedListing = { ...l };
  if (price != null) out.price = price;
  if (out.listPrice == null && was != null && price != null && was / 100 > price) out.listPrice = was / 100;
  if (!out.brand && str(p.vendor)) out.brand = str(p.vendor);
  const vendor = str(p.vendor)?.toLowerCase().replace(/[^a-z0-9]/g, "");
  let host = ""; try { host = new URL(l.url ?? "").hostname.toLowerCase().replace(/[^a-z0-9.]/g, ""); } catch { /* */ }
  if (out.seller && !out.seller.verified && vendor && vendor.length >= 3 && (host.split(".").slice(-2, -1)[0] ?? "").includes(vendor)) out.seller = { ...out.seller, verified: true };
  if (!out.condition) out.condition = "new";
  if (!out.images?.length && str(p.featured_image)) { const img = absUrl(str(p.featured_image), l.url ?? "https://x.invalid"); if (img) out.images = [img]; }
  if (out.extractedWith && !out.extractedWith.includes("shopify")) out.extractedWith = `${out.extractedWith}+shopify`;
  return out;
}

/** Extract a listing from page HTML. Throws ExtractError when the page has no product. */
export function extractListing(html: string, pageUrl: string): NormalizedListing {
  let host = "";
  try { host = new URL(pageUrl).hostname.replace(/^www\./, "").toLowerCase(); } catch { /* */ }
  const site = siteKey(host);
  const ld = fromJsonLd(html), meta = fromMeta(html), micro = fromMicrodata(html);
  const specific = site === "ebay" ? fromEbay(html) : site === "amazon" ? fromAmazon(html) : site === "walmart" ? fromWalmart(html) : undefined;

  const l: L = {};
  merge(l, specific); merge(l, ld); merge(l, micro); merge(l, meta);
  const method = specific && (specific.title || specific.price != null) ? site! : ld?.title ? "json-ld" : micro?.title ? "microdata" : meta?.title ? "opengraph" : "html";
  if (!l.title) l.title = inlineText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "", 300) || undefined;
  if (!l.title) throw new ExtractError("This page doesn't look like a product listing.");
  l.title = l.title.replace(/\s*[|–-]\s*(eBay|Amazon\.com|Walmart\.com|Etsy|Best Buy)\s*$/i, "").replace(/^Amazon\.com\s*:\s*/i, "").slice(0, 300);
  if (l.price == null && method === "html" && !meta) throw new ExtractError("This page doesn't look like a product listing.");

  // description: listing text, else main content; plus agent-directed hidden text anywhere on the page
  let visible = l.description;
  if (!visible || visible.length < 200) { const mt = mainText(html); if (mt && mt.length > (visible?.length ?? 0)) visible = [visible, mt].filter(Boolean).join("\n\n"); }
  const hid = hiddenText(html, true, MAX_HIDDEN);
  // A store selling its own goods (not a marketplace): the store is the seller. Verified only when the brand
  // is the store's own domain (allbirds.com selling Allbirds), never just because the page says so.
  if (!l.seller?.name && !site && !MARKETPLACE.test(host)) {
    const storeName = metaMap(html).get("og:site_name") || host;
    const sq = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
    const own = !!l.brand && sq(l.brand).length >= 3 && sq(host.split(".").slice(-2, -1)[0] ?? "").includes(sq(l.brand));
    l.seller = { ...(l.seller ?? {}), name: storeName.slice(0, 80), ...(own ? { verified: true } : {}) };
  }
  const images = (l.images ?? []).map((i) => absUrl(i, pageUrl)).filter((x): x is string => !!x && !/\.svg(\?|$)/i.test(x));

  return prune({
    source: "web" as const,
    url: pageUrl,
    site: host,
    title: l.title,
    description: composeDescription(visible, hid.snippets, hid.comments.filter((c) => /\b(ai|agent|assistant|ignore|instruction|budget|buy|purchase)\b/i.test(c))),
    price: l.price,
    currency: (l.currency || "USD").toUpperCase().slice(0, 3),
    listPrice: l.listPrice && l.price != null && l.listPrice > l.price ? l.listPrice : undefined,
    condition: l.condition,
    brand: l.brand,
    model: l.model,
    images: dedupeImages(images).slice(0, 6),
    seller: l.seller && Object.keys(prune(l.seller)).length ? prune(l.seller) : undefined,
    specs: l.specs && Object.keys(l.specs).length ? Object.fromEntries(Object.entries(l.specs).slice(0, 40)) : undefined,
    shipping: l.shipping,
    returns: l.returns,
    extractedWith: method,
  }) as NormalizedListing;
}
