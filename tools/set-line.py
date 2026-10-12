#!/usr/bin/env python3
"""Small helper for make-beta.sh and promote-beta.sh (works the same on Mac and Linux, unlike sed -i).
Usage: set-line.py FILE START NEW   replaces the one line of FILE that begins with START by NEW.
       set-line.py FILE --text OLD NEW   replaces the exact text OLD by NEW (must occur at least once)."""
import sys
path = sys.argv[1]
src = open(path, encoding="utf-8").read()
if sys.argv[2] == "--text":
    old, new = sys.argv[3], sys.argv[4]
    if old not in src:
        raise SystemExit(f"{path}: could not find {old!r}")
    src = src.replace(old, new)
else:
    start, new = sys.argv[2], sys.argv[3]
    lines = src.split("\n")
    hits = [i for i, l in enumerate(lines) if l.startswith(start)]
    if len(hits) != 1:
        raise SystemExit(f"{path}: expected exactly one line starting with {start!r}, found {len(hits)}")
    lines[hits[0]] = new
    src = "\n".join(lines)
open(path, "w", encoding="utf-8").write(src)
