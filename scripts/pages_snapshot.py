#!/usr/bin/env python3
"""Freeze the real home page into a static folder for GitHub Pages, JS and all.

Usage: python scripts/pages_snapshot.py <server_url> <out_dir> <base_path> <web_dir>
  e.g. python scripts/pages_snapshot.py http://127.0.0.1:3100 _site /bonded web

Expects the app to be built and running with basePath=<base_path> (the Pages workflow does this).
  * index.html is the server-rendered home page, unchanged except for a small shim injected
    first in <head>: GET /api/* is served from JSON captured here (_api/*.json), writes get a
    friendly "static snapshot" error, and the /api/events SSE feed is a no-op.
  * _next/static and public/ are copied as-is so the client bundle hydrates normally.
  * _ref/live-home.png is a full-page screenshot of the live server, for comparison.
"""
import pathlib
import re
import shutil
import sys
import urllib.parse
import urllib.request

from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip("/")
OUT = pathlib.Path(sys.argv[2])
PREFIX = "/" + sys.argv[3].strip("/")
WEB = pathlib.Path(sys.argv[4])
HOME = BASE + PREFIX + "/"

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "_ref").mkdir(exist_ok=True)


def api_file(path: str, query: str) -> pathlib.Path:
    """/api/leaderboard?x=1 -> _api/leaderboard__x=1.json (must match key() in SHIM)."""
    q = "__" + re.sub(r"[^A-Za-z0-9=_-]", "_", query) if query else ""
    return OUT / "_api" / (path[len("/api/"):] + q + ".json")


api: dict[pathlib.Path, bytes] = {}
assets: dict[str, bytes] = {}


def on_response(resp):
    if not resp.url.startswith(BASE) or resp.status != 200 or resp.request.method != "GET":
        return
    u = urllib.parse.urlsplit(resp.url)
    path = u.path[len(PREFIX):] if u.path.startswith(PREFIX + "/") else u.path
    try:
        if path.startswith("/api/"):
            if path != "/api/events":
                api[api_file(path, u.query)] = resp.body()
        elif not path.startswith("/_next/") and path != "/" and resp.request.resource_type in (
            "image", "font", "stylesheet", "media", "manifest", "other"
        ):
            assets[path] = resp.body()  # app icons etc. that aren't in public/
    except Exception:
        pass


def route_api(route):
    # the client fetches bare /api/...; with basePath the server has it under PREFIX
    u = urllib.parse.urlsplit(route.request.url)
    route.continue_(url=BASE + PREFIX + u.path + ("?" + u.query if u.query else ""))


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on("response", on_response)
    page.route(re.compile(re.escape(BASE) + r"/api/"), route_api)
    page.goto(HOME, wait_until="load")
    page.wait_for_timeout(5000)
    y, height = 0, page.evaluate("document.documentElement.scrollHeight")
    while y < height:  # walk the page so lazy sections fetch their data
        y += 300
        page.mouse.wheel(0, 300)
        page.wait_for_timeout(120)
        height = page.evaluate("document.documentElement.scrollHeight")
    page.wait_for_timeout(2000)
    page.screenshot(path=str(OUT / "_ref" / "live-home.png"), full_page=True)
    browser.close()

SHIM = """<script>(function(){var P=%r;
function key(u){var q=u.search?"__"+u.search.slice(1).replace(/[^A-Za-z0-9=_-]/g,"_"):"";return P+"/_api/"+u.pathname.slice(5)+q+".json";}
function isApi(u){return u.origin===location.origin&&u.pathname.indexOf("/api/")===0;}
var f0=window.fetch.bind(window);
window.fetch=function(input,init){try{var u=new URL(typeof input==="string"?input:(input&&input.url)||String(input),location.href);
if(isApi(u)){var m=String((init&&init.method)||(input&&input.method)||"GET").toUpperCase();
if(m!=="GET"&&m!=="HEAD")return Promise.resolve(new Response(JSON.stringify({error:"This is a static snapshot of Bonded. Run it locally to try this."}),{status:503,headers:{"content-type":"application/json"}}));
return f0(key(u));}}catch(e){}return f0(input,init);};
var ES=window.EventSource;window.EventSource=function(url,o){try{var u=new URL(url,location.href);if(isApi(u)){var d=new EventTarget();d.readyState=2;d.url=u.href;d.close=function(){};return d;}}catch(e){}return new ES(url,o);};
})();</script>""" % PREFIX

html = urllib.request.urlopen(HOME, timeout=60).read().decode("utf-8")
html = html.replace(BASE, "http://localhost:3000")  # e.g. the MCP URLs in ConnectStrip
html = re.sub(r"(<head[^>]*>)", lambda m: m.group(1) + SHIM, html, count=1)
(OUT / "index.html").write_text(html, encoding="utf-8")

shutil.copytree(WEB / ".next" / "static", OUT / "_next" / "static", dirs_exist_ok=True)
if (WEB / "public").is_dir():
    shutil.copytree(WEB / "public", OUT, dirs_exist_ok=True)
for path, body in assets.items():
    dest = OUT / path.lstrip("/")
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(body)
for dest, body in api.items():
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(body)

# Plain <img src="/hero/x.png"> and other hard-coded public/ paths ignore basePath; prefix them
# in the HTML and the client bundle (only when preceded by a quote/paren, so never twice).
public_names = [p.name for p in (WEB / "public").iterdir()] if (WEB / "public").is_dir() else []
if public_names:
    pat = re.compile(r"([\"'`(])/(" + "|".join(map(re.escape, public_names)) + r")(?=[/\"'`?)#])")
    fix = lambda s: pat.sub(lambda m: f"{m.group(1)}{PREFIX}/{m.group(2)}", s)
    (OUT / "index.html").write_text(fix((OUT / "index.html").read_text(encoding="utf-8")), encoding="utf-8")
    for f in (OUT / "_next" / "static").rglob("*"):
        if f.suffix in (".js", ".css"):
            s = f.read_text(encoding="utf-8", errors="surrogateescape")
            t = fix(s)
            if t != s:
                f.write_text(t, encoding="utf-8", errors="surrogateescape")

(OUT / ".nojekyll").write_text("")
(OUT / "404.html").write_text(
    f"""<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Bonded</title><body style="font:16px/1.6 system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;background:#f6f4ee;color:#1d1b16;text-align:center">
<div><p style="font-size:22px;font-weight:600;margin:0 0 8px">This page needs the live app.</p>
<p style="margin:0 0 20px;color:#6b665b">This site is a static snapshot of the Bonded home page.</p>
<a href="{PREFIX}/" style="color:#1d1b16">Back to home</a></div>""",
    encoding="utf-8",
)

print(f"snapshot: index.html, {len(api)} API responses, {len(assets)} extra assets -> {OUT}")
for f in sorted(api):
    print("  ", f.relative_to(OUT))
