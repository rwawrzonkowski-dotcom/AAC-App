#!/usr/bin/env python3
"""Checks that every Dolch sight word can be said within 3 taps, on BOTH board sizes (45 and 84).

Run from the project folder:
    python3 tools/dolch-coverage.py                      # prints the report
    python3 tools/dolch-coverage.py > docs/dolch-coverage.md   # saves it (this is how docs/dolch-coverage.md is made)

It reads data/core-board.json (the buttons), data/dolch.json (the 318 words; source: Wikipedia's
"Dolch word list") and data/word-forms.json (the Forms button). It exits with an error (status 1)
if any word needs more than 3 taps or cannot be reached at all.

HOW TAPS ARE COUNTED
  - A word on the main board = 1 tap.
  - A category button (Food, Play...) = 1 tap; each word on that page = 1 more.
  - The top-bar Words button = 1 tap, a button on the Words menu = 1 more, a word on that page = 1 more
    (Words, Colors, red = 3 taps).
  - "via Forms": the word is another form of a word you can reach (went from go). Tapping Forms and then
    the form are 2 more taps, so only a word on the main board (1 tap) can be the starting point.
  - Every word is assumed to be showing (stage 4); the page layouts are the same on both sizes except that
    the 84 board also has the extra columns.
  - SYNONYMS are allowed for exactly four words (the project has the child's-word equivalent):
    father = dad, mother = mom, rabbit = bunny, house = home. A synonym is only used if the word itself
    cannot be reached; the report says so.
"""
import json, os, sys
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAX_TAPS = 3
SYNONYMS = {"father": "dad", "mother": "mom", "rabbit": "bunny", "house": "home"}
LEVELS = {"pre-primer": "Pre-primer", "primer": "Primer", "first": "First grade", "second": "Second grade",
          "third": "Third grade", "nouns": "Nouns"}

def load(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return json.load(f)

board = load("data", "core-board.json")
dolch = load("data", "dolch.json")
forms = load("data", "word-forms.json")
words = board["words"]

def norm(text):
    return text.strip().lower().replace("_", " ")

# ---------------- the buttons on each page, for one board size ----------------
def entry(e):
    return {"id": e} if isinstance(e, str) else e

def page_words(page, size):
    """ids of the words on a page (45 part, plus the extra columns on the 84 board)."""
    ids = []
    if "groups" in page:
        for g in page["groups"]:
            for e in map(entry, g["words"]):
                if size in e.get("sizes", [45, 84]):
                    ids.append(e["id"])
            if size == 84:
                ids += [entry(e)["id"] for e in g.get("adds", [])]
    else:
        ids = [entry(e)["id"] for e in page.get("items", []) if size in entry(e).get("sizes", [45, 84])]
    return ids

def reach(size):
    """Breadth-first search: for every word id the fewest taps and the button names to tap."""
    main = [i for row in board["layouts"][str(size)]["main"] for i in row]
    best = {}                                       # word id -> (taps, [names of the buttons tapped])
    seen_pages = {}
    queue = deque()
    queue.append(("core", 0, []))
    # the Words menu is opened from the top bar
    for pid, p in board["pages"].items():
        if p.get("fromBar"):
            queue.append((pid, 1, ["Words"]))
    while queue:
        pid, taps, trail = queue.popleft()
        if pid in seen_pages and seen_pages[pid] <= taps:
            continue
        seen_pages[pid] = taps
        ids = main if pid == "core" else page_words(board["pages"][pid], size)
        for wid in ids:
            w = words[wid]
            t = taps + 1
            if w.get("loadBoard"):
                queue.append((w["loadBoard"], t, trail + [w["label"]]))
                continue
            if wid not in best or best[wid][0] > t:
                best[wid] = (t, trail + [w["label"]])
    return best

# ---------------- which board word is this Dolch word? ----------------
def board_words_by_text():
    out = {}
    for wid, w in words.items():
        if w.get("template") or w.get("loadBoard"):
            continue
        for text in {w["label"], w.get("spokenText", "")}:
            if text:
                out.setdefault(norm(text), []).append(wid)
    return out
by_text = board_words_by_text()

family_of = {}
for section in ("verbs", "adjectives", "nouns", "pronouns"):
    for fam in forms[section]:
        for f in fam:
            family_of.setdefault(norm(f), fam)

def direct(word, best):
    options = [best[i] for i in by_text.get(word, []) if i in best]
    return min(options, key=lambda o: o[0]) if options else None

def route(word, best):
    """-> (kind, taps, text)  kind: direct | forms | synonym | none"""
    d = direct(word, best)
    if d and d[0] <= MAX_TAPS:
        return "direct", d[0], f"{' > '.join(d[1])} ({d[0]} tap{'s' if d[0] > 1 else ''})"
    fam = family_of.get(word)
    if fam:
        options = []
        for other in fam:
            o = norm(other)
            if o != word:
                od = direct(o, best)
                if od:
                    options.append((od[0] + 2, od[1], other))
        if options:
            taps, trail, other = min(options, key=lambda o: o[0])
            if taps <= MAX_TAPS:
                return "forms", taps, f"via Forms from **{other}**: {' > '.join(trail)}, Forms, {word} ({taps} taps)"
    if word in SYNONYMS:
        d = direct(SYNONYMS[word], best)
        if d and d[0] <= MAX_TAPS:
            return "synonym", d[0], f"synonym **{SYNONYMS[word]}**: {' > '.join(d[1])} ({d[0]} taps)"
    return "none", 99, "NOT REACHABLE within 3 taps" if not d else f"too far ({d[0]} taps)"

# ---------------- report ----------------
dolch_words = []                                   # (word, level)
for level, text in dolch.items():
    if level == "source":
        continue
    for w in text.split():
        dolch_words.append((norm(w), level))
assert len(dolch_words) == len(set(w for w, _ in dolch_words)), "duplicate words in dolch.json"

best = {45: reach(45), 84: reach(84)}
result = {}                                        # (word, size) -> route
for w, level in dolch_words:
    for size in (45, 84):
        result[(w, size)] = route(w, best[size])

def count(size, kind):
    return sum(1 for w, _ in dolch_words if result[(w, size)][0] == kind)

lines = ["# Dolch sight word coverage", "",
         "Made by `tools/dolch-coverage.py` (run it again after changing any page). "
         f"{len(dolch_words)} words from `data/dolch.json` (source: Wikipedia, Dolch word list).", "",
         f"**Rule:** every word must be reachable within {MAX_TAPS} taps on both the 45 and the 84 board.", ""]
lines += ["## Summary", "", "| Board | Direct | Via Forms | Synonym | Not reachable |", "|---|---|---|---|---|"]
for size in (45, 84):
    lines.append(f"| {size} | {count(size, 'direct')} | {count(size, 'forms')} | {count(size, 'synonym')} | {count(size, 'none')} |")
lines += ["", "Taps: a word on the main board is 1 tap; Words > Colors > red is 3 taps (Words button, page button, word); "
          "Forms from a main-board word is 3 taps (the word, Forms, the form).", ""]

syn = sorted({w for w, _ in dolch_words for s in (45, 84) if result[(w, s)][0] == "synonym"})
lines += ["## Synonyms used", ""]
if syn:
    lines += ["Only four words may use a synonym: father = dad, mother = mom, rabbit = bunny, house = home. "
              "Used here: " + ", ".join(f"{w} = {SYNONYMS[w]}" for w in syn) + ".", ""]
else:
    lines += ["None.", ""]

via = sorted({w for w, _ in dolch_words for s in (45, 84) if result[(w, s)][0] == "forms"})
lines += ["## Reached only through Forms", "",
          "These words have no button of their own; they are forms of a main-board word: " + (", ".join(via) or "none") + ".", ""]

lines += ["## Every word", "", "| Word | List | 45 board | 84 board |", "|---|---|---|---|"]
for w, level in sorted(dolch_words, key=lambda x: x[0]):
    lines.append(f"| {w} | {LEVELS.get(level, level)} | {result[(w, 45)][2]} | {result[(w, 84)][2]} |")

print("\n".join(lines))
failed = [(w, s) for w, _ in dolch_words for s in (45, 84) if result[(w, s)][0] == "none"]
if failed:
    print("\nFAILED: not reachable within 3 taps:", file=sys.stderr)
    for w, s in failed:
        print(f"  {w} on the {s} board: {result[(w, s)][2]}", file=sys.stderr)
    sys.exit(1)
print(f"\nOK: all {len(dolch_words)} Dolch words are reachable within {MAX_TAPS} taps on both boards.", file=sys.stderr)
