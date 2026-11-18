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

# word id -> label, for readable tables ("words" lists every button on every page)
labels = {"back": "Back"}
for wid, w in board["words"].items():
    labels[wid] = w["label"]

# The top of CREDITS.md comes from data/credits.json (the same file the app's Credits and licenses page shows).
# Before beta is promoted the stable folder has no credits.json yet, so the beta copy is used.
cpath = os.path.join(ROOT, "data", "credits.json")
if not os.path.exists(cpath): cpath = os.path.join(ROOT, "beta", "data", "credits.json")
C = json.load(open(cpath, encoding="utf-8"))
lines = ["# Credits", "", C["copyright"] + " See LICENSE.", "", C["summary"], ""]
for sec in C["sections"]:
    lines += ["## " + sec["title"], ""]
    if sec.get("intro"): lines += [sec["intro"], ""]
    for it in sec["items"]:
        t = f"- **{it['name']}** - {it['by'].rstrip('.')}. Licensed under [{it['license']}]({it['licenseUrl']})."
        if it.get("url"): t += f" Source: {it['url']}."
        if it.get("note"): t += f" {it['note']}"
        if it.get("repo"): t += f" {it['repo']}"
        lines.append(t)
    lines.append("")
lines += ["## Notices", ""] + ["- " + n for n in C["notices"]] + [""]
lines += ["The symbols for objects and food are temporary stand-ins until an adult adds real photos of the child's own things (Edit board > photo).", ""]
head = "\n".join(lines) + """
**License summary (CC BY-SA 4.0).** You may copy, share and adapt these
pictures, including commercially, if you (1) give credit to the creators, as
in this file, (2) say if you changed them, and (3) share anything you make from
them under the same CC BY-SA 4.0 license. Full text:
https://creativecommons.org/licenses/by-sa/4.0/legalcode

"""

def table(source):
    rows = [(w, e) for w, e in sources.items() if e["source"] == source]
    out = [f"### {source} ({len(rows)} picture{"" if len(rows) == 1 else "s"})", "", "| Word | File | Original name | License |", "|---|---|---|---|"]
    for w, e in sorted(rows, key=lambda r: labels.get(r[0], r[0]).lower()):
        out.append(f"| {labels.get(w, w)} | `{e['file']}` | {e['originalName']} | {e['license']} |")
    return "\n".join(out) + "\n"

text = (head + "## Where each picture comes from\n\n" + table("Mulberry") + "\n" + table("OpenMoji") +
        "\n" + table("This project"))
open(os.path.join(ROOT, "CREDITS.md"), "w", encoding="utf-8").write(text)
print("CREDITS.md written:", len(sources), "pictures")
