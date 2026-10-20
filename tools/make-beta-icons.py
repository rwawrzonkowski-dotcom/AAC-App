#!/usr/bin/env python3
"""Makes the beta home-screen icons: a copy of each VOICE icon (tools/icon/*.png, drawn by tools/make-icons.py) with an orange "BETA" band along the bottom.
Needs the Pillow package (pip install pillow). The results are saved in tools/beta-icons/ and committed,
so you only run this if the icon artwork changes (run tools/make-icons.py first). tools/make-beta.sh copies them into beta/icons/."""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ICONS = os.path.join(HERE, "icon", "beta-base")   # VOICE icons with the art raised to leave room for the band
OUT = os.path.join(HERE, "beta-icons")
os.makedirs(OUT, exist_ok=True)

def font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf", "/Library/Fonts/Arial Bold.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

for name in sorted(os.listdir(ICONS)):
    if not name.endswith(".png"):
        continue
    im = Image.open(os.path.join(ICONS, name)).convert("RGBA")
    w, h = im.size
    band = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(band)
    top = int(h * 0.68)
    d.rectangle([0, top, w, h], fill=(245, 158, 11, 255))
    f = font(int(h * 0.2))
    box = d.textbbox((0, 0), "BETA", font=f)
    tw, th = box[2] - box[0], box[3] - box[1]
    d.text(((w - tw) / 2 - box[0], top + (h - top - th) / 2 - box[1]), "BETA", font=f, fill=(255, 255, 255, 255))
    Image.alpha_composite(im, band).convert("RGB").save(os.path.join(OUT, name))
    print("wrote", name)
