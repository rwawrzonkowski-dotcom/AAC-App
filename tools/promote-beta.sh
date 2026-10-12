#!/usr/bin/env bash
# Makes the tested beta copy the new STABLE app.
#   tools/promote-beta.sh "Stable 1.1"        (the argument is the new version label)
# It copies the beta app files over the main app files, then:
#   - keeps the stable channel settings (js/channel.js stays "stable"; only its version label changes),
#   - keeps stable's own service worker settings and raises its cache number (aac-v15 -> aac-v16),
#   - keeps stable's own manifest, icons and "AAC Board" names (beta's are marked as beta),
#   - rewrites stable's cache file list.
# It does NOT commit or push anything. Read the summary, test, then commit.
# Afterwards, run tools/make-beta.sh to start beta over from the new stable.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SETLINE="python3 tools/set-line.py"

LABEL="${1:-}"
if [ -z "$LABEL" ]; then
  echo "Please give the new version label, for example:  tools/promote-beta.sh \"Stable 1.1\"" >&2
  exit 1
fi
[ -d beta ] || { echo "There is no beta/ folder to promote. Run tools/make-beta.sh first." >&2; exit 1; }

# Keep a copy of the current app files so we can list what changed.
BEFORE="$(mktemp -d)"
trap 'rm -rf "$BEFORE"' EXIT
for f in index.html styles.css sw.js manifest.webmanifest; do cp "$f" "$BEFORE/"; done
cp -R js data images icons "$BEFORE/"

OLD_N="$(sed -n 's/^const CACHE_VERSION = "aac-v\([0-9]*\)";.*/\1/p' sw.js)"
[ -n "$OLD_N" ] || { echo "Could not read stable CACHE_VERSION from sw.js" >&2; exit 1; }

# 1. Copy beta's app files over stable's (whole folders, so removed files disappear too).
cp beta/index.html beta/styles.css beta/sw.js .
rm -rf js data images
cp -R beta/js beta/data beta/images .
cp "$BEFORE/js/channel.js" js/channel.js            # stable keeps its own channel file
cp "$BEFORE/manifest.webmanifest" manifest.webmanifest   # (icons/ and manifest are not copied from beta)

# 2. Undo the beta-only names in index.html.
$SETLINE index.html '<title>' '<title>AAC Board</title>'
$SETLINE index.html '<meta name="apple-mobile-web-app-title"' '<meta name="apple-mobile-web-app-title" content="AAC Board">'

# 3. Stable service worker settings (the cache number goes up by one).
$SETLINE sw.js 'const CACHE_VERSION' "const CACHE_VERSION = \"aac-v$((OLD_N + 1))\";"
$SETLINE sw.js 'const CACHE_PREFIX' 'const CACHE_PREFIX = "aac-";'
$SETLINE sw.js 'const OTHER_CHANNEL_FOLDER' 'const OTHER_CHANNEL_FOLDER = "beta/";   // stable: requests under /beta/ belong to the beta copy'

# 4. New version label, and the stable file list.
$SETLINE js/channel.js 'export const VERSION_LABEL' "export const VERSION_LABEL = \"$LABEL\";   // shown small in the adult menu and on the setup screen"
python3 tools/update-cache-list.py

# 5. Summary of what changed.
echo
echo "Promoted beta to stable as \"$LABEL\" (cache $(grep -m1 '^const CACHE_VERSION' sw.js | cut -d'"' -f2))."
echo "Changed files:"
CHANGED="$(diff -rq "$BEFORE" . -x .git -x beta -x tools -x docs -x README.md -x CREDITS.md 2>/dev/null || true)"
if [ -z "$CHANGED" ]; then echo "  (none)"; else
  echo "$CHANGED" | sed -e "s#^Files $BEFORE/\(.*\) and \./.* differ#  changed: \1#" \
                        -e "s#^Only in $BEFORE\(/\{0,1\}\)\(.*\): \(.*\)#  removed: \2/\3#" \
                        -e "s#^Only in \.\(/\{0,1\}\)\(.*\): \(.*\)#  added:   \2/\3#"
fi
echo
echo "Next: open the app and test it, then commit. Afterwards run tools/make-beta.sh to restart beta from stable."
