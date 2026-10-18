#!/usr/bin/env python3
"""Freeze the live home page into a static folder for GitHub Pages.

Usage: python scripts/pages_snapshot.py <server_url> <out_dir> <base_path>
  e.g. python scripts/pages_snapshot.py http://127.0.0.1:3100 _site /bonded

Loads the running app's home page in Chromium, lets the ranking load, scrolls through
the page so scroll-triggered sections render, then saves the rendered DOM with scripts
stripped (Pages has no API, so hydration would only break it), plus every same-origin
stylesheet, font and image it used. Absolute URLs are rewritten under <base_path>.
"""
import pathlib
import re
import sys
import urllib.parse

from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip("/")
OUT = pathlib.Path(sys.argv[2])
PREFIX = "/" + sys.argv[3].strip("/") if sys.argv[3].strip("/") else ""

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "_ref").mkdir(exist_ok=True)
saved: dict[str, bytes] = {}


def on_response(resp):
    if not resp.url.startswith(BASE) or resp.status != 200:
        return
    path = urllib.parse.urlsplit(resp.url).path
    if path in ("", "/") or path.startswith("/api/") or path.startswith("/_next/image"):
        return
    if resp.request.resource_type in ("document", "script", "xhr", "fetch", "eventsource", "websocket"):
        return
    try:
        saved[path] = resp.body()
    except Exception:
        pass


def rebase(text: str) -> str:
    # attributes pointing at the site root -> under the Pages base path
    text = re.sub(r'(\s(?:href|src|poster|action)=")/(?!/)', rf"\1{PREFIX}/", text)
    text = re.sub(r"url\((['\"]?)/(?!/)", rf"url(\1{PREFIX}/", text)
    return text


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on("response", on_response)
    page.goto(BASE + "/", wait_until="load")
    page.wait_for_timeout(5000)  # ranking fetch + fonts

    # walk the page so in-view animations / reveals fire
    y, height = 0, page.evaluate("document.documentElement.scrollHeight")
    while y < height:
        y += 300
        page.mouse.wheel(0, 300)
        page.wait_for_timeout(120)
        height = page.evaluate("document.documentElement.scrollHeight")
    page.wait_for_timeout(1500)
    page.screenshot(path=str(OUT / "_ref" / "live-home.png"), full_page=True)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(2000)
    html = page.content()
    browser.close()

html = re.sub(r"<script\b[^>]*>.*?</script>", "", html, flags=re.S | re.I)
html = re.sub(r"<link\b[^>]*\bas=\"script\"[^>]*>", "", html, flags=re.I)
html = rebase(html)
(OUT / "index.html").write_text(html, encoding="utf-8")
(OUT / ".nojekyll").write_text("")

for path, body in saved.items():
    dest = OUT / path.lstrip("/")
    dest.parent.mkdir(parents=True, exist_ok=True)
    if path.endswith(".css"):
        body = rebase(body.decode("utf-8", "replace")).encode("utf-8")
    dest.write_bytes(body)

print(f"snapshot: index.html + {len(saved)} assets -> {OUT} (base {PREFIX or '/'})")
