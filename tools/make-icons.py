#!/usr/bin/env python3
"""Draws the VOICE home-screen icons (PNG) from tools/icon/voice-icon.svg into tools/icon/.
    python3 tools/make-icons.py
Makes (into tools/icon/, plus raised bases for the beta in tools/icon/beta-base/) icon-180.png, icon-192.png, icon-512.png, icon-maskable-512.png (artwork shrunk into the safe centre so
Android can crop it) and apple-touch-icon.png (180). Then run tools/make-beta-icons.py for the BETA-band copies.
Drawing needs one of: cairosvg (pip install cairosvg), or Playwright with Chromium (what is used offline here).
The PNGs are committed, so you only run this if the artwork changes. Nothing here needs the internet."""
import os, re, io
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "icon")
SVG = open(os.path.join(OUT, "voice-icon.svg"), encoding="utf-8").read()
# The art in <g id="art"> spans about x 64-448, y 70-356 (centre y 213). Each layout wraps it in a transform:
#   normal   centred vertically and 8% larger (the stable icons; tools/promote-beta.sh copies them to icons/)
#   maskable smaller, in the safe centre so a round or squircle crop never cuts it
#   beta     raised so the orange BETA band (bottom 32%, drawn by tools/make-beta-icons.py) never covers the tail
def layout(transform):
    out = SVG.replace('<g id="art">', f'<g id="art" transform="{transform}">')
    assert out != SVG, "could not find <g id=\"art\"> in the SVG"
    return out
NORMAL = layout("translate(256 256) scale(1.08) translate(-256 -213)")
MASKABLE = layout("translate(256 256) scale(0.7) translate(-256 -213)")
BETA = layout("translate(0 -30)")
BETA_MASKABLE = layout("translate(256 236) scale(0.64) translate(-256 -213)")

BASE = os.path.join(OUT, "beta-base")   # unbanded bases for the beta icons
os.makedirs(BASE, exist_ok=True)
JOBS = [("icon-180.png", 180, NORMAL), ("icon-192.png", 192, NORMAL), ("icon-512.png", 512, NORMAL),
        ("icon-maskable-512.png", 512, MASKABLE), ("apple-touch-icon.png", 180, NORMAL),
        ("beta-base/icon-180.png", 180, BETA), ("beta-base/icon-192.png", 192, BETA), ("beta-base/icon-512.png", 512, BETA),
        ("beta-base/icon-maskable-512.png", 512, BETA_MASKABLE), ("beta-base/apple-touch-icon.png", 180, BETA)]

def with_cairosvg():
    import cairosvg
    for name, size, svg in JOBS:
        cairosvg.svg2png(bytestring=svg.encode(), write_to=os.path.join(OUT, name), output_width=size, output_height=size)
        print("wrote", name)

def with_playwright():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        for name, size, svg in JOBS:
            pg = b.new_page(viewport={"width": size, "height": size})
            sized = re.sub(r'width="512" height="512"', f'width="{size}" height="{size}"', svg, count=1)
            pg.set_content(f'<html><body style="margin:0">{sized.split("?>",1)[1]}</body></html>')
            pg.screenshot(path=os.path.join(OUT, name), clip={"x": 0, "y": 0, "width": size, "height": size})
            pg.close()
            print("wrote", name)
        b.close()

try:
    with_cairosvg()
except ImportError:
    with_playwright()
