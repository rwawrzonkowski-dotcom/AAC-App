#!/usr/bin/env python3
"""Writes CREDITS.md from data/image-sources.json.

Run from the project folder after changing any symbol:
    python3 tools/make-credits.py
The word list below and the license summary are fixed text; the image tables
are generated, so every picture in images/symbols/ is always credited.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sources = json.load(open(os.path.join(ROOT, "data", "image-sources.json"), encoding="utf-8"))
board = json.load(open(os.path.join(ROOT, "data", "core-board.json"), encoding="utf-8"))

# word id -> label, for readable tables
labels = {"back": "Back"}
for b in board["buttons"]:
    labels[b["id"]] = b["label"]
for page in board["pages"].values():
    for b in page["buttons"]:
        labels[b["id"]] = b["label"]

head = """# Credits

## Vocabulary and layout

- **Universal Core vocabulary** (c) Center for Literacy and Disability Studies,
  University of North Carolina at Chapel Hill. Licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  The word list in `data/core-board.json` is arranged by this project's own
  fixed layout; no layout or symbols from LAMP or Prentke Romich (PCS) are used.
- Color coding follows the Modified Fitzgerald Key convention (a general
  convention, not a proprietary asset).

## Pictures (symbols)

Every button shows an open-licensed symbol from the two sources below. The
files in `images/symbols/` are unmodified copies, renamed to the word they
show. The symbols for objects and food are **temporary stand-ins** until real
photos of the child's own things are added by an adult (Edit board > photo).
No ARASAAC, PCS, SymbolStix, LAMP or Apple emoji images are used.

- **Mulberry Symbols** (c) 2018-2026 Steve Lee. Licensed under the
  [Creative Commons Attribution-Share Alike 4.0 license](https://creativecommons.org/licenses/by-sa/4.0/)
  (CC BY-SA 4.0). Source: https://mulberrysymbols.org
- **OpenMoji** - all emojis designed by [OpenMoji](https://openmoji.org/), the
  open-source emoji and icon project. Licensed under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  Source: https://openmoji.org (color SVGs from the `openmoji` npm package).

**License summary (CC BY-SA 4.0).** You may copy, share and adapt these
pictures, including commercially, if you (1) give credit to the creators, as
in this file, (2) say if you changed them, and (3) share anything you make from
them under the same CC BY-SA 4.0 license. Full text:
https://creativecommons.org/licenses/by-sa/4.0/legalcode

"""

def table(source):
    rows = [(w, e) for w, e in sources.items() if e["source"] == source]
    out = [f"### {source} ({len(rows)} pictures)", "", "| Word | File | Original name | License |", "|---|---|---|---|"]
    for w, e in sorted(rows, key=lambda r: labels.get(r[0], r[0]).lower()):
        out.append(f"| {labels.get(w, w)} | `{e['file']}` | {e['originalName']} | {e['license']} |")
    return "\n".join(out) + "\n"

text = head + "## Where each picture comes from\n\n" + table("Mulberry") + "\n" + table("OpenMoji")
open(os.path.join(ROOT, "CREDITS.md"), "w", encoding="utf-8").write(text)
print("CREDITS.md written:", len(sources), "pictures")
