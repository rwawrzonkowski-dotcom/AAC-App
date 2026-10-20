#!/usr/bin/env python3
"""Draws the VOICE home-screen icons (PNG) from tools/icon/voice-icon.svg into tools/icon/.
    python3 tools/make-icons.py
Makes icon-180.png, icon-192.png, icon-512.png, icon-maskable-512.png (artwork shrunk into the safe centre so
Android can crop it) and apple-touch-icon.png (180). Then run tools/make-beta-icons.py for the BETA-band copies.
Drawing needs one of: cairosvg (pip install cairosvg), or Playwright with Chromium (what is used offline here).
The PNGs are committed, so you only run this if the artwork changes. Nothing here needs the internet."""
import os, re, io
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "icon")
SVG = open(os.path.join(OUT, "voice-icon.svg"), encoding="utf-8").read()
# Maskable: shrink the artwork and centre it so a round or squircle crop never cuts it.
MASKABLE = SVG.replace('<g id="art">', '<g id="art" transform="translate(256 256) scale(0.7) translate(-256 -209)">')
assert MASKABLE != SVG, "could not find <g id=\"art\"> in the SVG"

JOBS = [("icon-180.png", 180, SVG), ("icon-192.png", 192, SVG), ("icon-512.png", 512, SVG),
        ("icon-maskable-512.png", 512, MASKABLE), ("apple-touch-icon.png", 180, SVG)]

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
