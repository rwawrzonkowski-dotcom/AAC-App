#!/usr/bin/env bash
# Rebuilds the beta/ folder as a fresh copy of the main (stable) app, set up as the BETA channel.
#   Run it from anywhere:   tools/make-beta.sh
# Use it to start beta over from stable (for example right after promoting beta, or to throw away experiments).
# It overwrites everything in beta/, so edit beta files only AFTER running it.
# Beta gets: its own storage names ("beta-" prefix), its own service worker cache (beta-aac-vNN), a "BETA" tag,
# the name "VOICE Beta" and a home-screen icon with a BETA band, so it installs as a separate app icon.
# Running it twice in a row changes nothing. If the beta files did change, the cache number goes up by one
# so devices fetch the new files.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SETLINE="python3 tools/set-line.py"

# The cache number beta had (beta-aac-vN), so we can keep or raise it. First time: start at 1.
OLD_N=0
if [ -f beta/sw.js ]; then
  OLD_N="$(sed -n 's/^const CACHE_VERSION = "beta-aac-v\([0-9]*\)";.*/\1/p' beta/sw.js)"
  OLD_N="${OLD_N:-0}"
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
NEW="$STAGE/beta"
mkdir -p "$NEW"

# 1. Copy the app files (no tools, docs, README, credits file or beta itself).
cp index.html styles.css sw.js manifest.webmanifest "$NEW/"
cp -R js data images icons "$NEW/"
find "$NEW" -name ".DS_Store" -delete

# 2. Beta channel settings.
cat > "$NEW/js/channel.js" <<'JS'
// Which "channel" this copy of the app is. This is the BETA copy (the beta/ folder):
// new features are tested here first. See the stable copy's js/channel.js for the full explanation.
// Beta's prefix "beta-" keeps its saved data completely separate from the stable app's.
// tools/make-beta.sh writes this file; do not copy it over the stable one.
export const CHANNEL = "beta";               // "stable" or "beta"
export const VERSION_LABEL = "VOICE Beta 1.0";   // shown small in the adult menu and on the setup screen
export const STORAGE_PREFIX = "beta-";       // "" for stable, "beta-" for beta
JS

# 3. Beta service worker: its own cache name, only deletes beta- caches, and ignores no folder.
#    (The cache number is filled in below once we know whether anything changed.)
$SETLINE "$NEW/sw.js" 'const CACHE_PREFIX' 'const CACHE_PREFIX = "beta-aac-";'
$SETLINE "$NEW/sw.js" 'const OTHER_CHANNEL_FOLDER' 'const OTHER_CHANNEL_FOLDER = "";   // beta: nothing to ignore (the stable app does not use this copy)'

# 4. Name, home-screen title and icons, so it installs as a separate "VOICE Beta" icon (the icons come from tools/beta-icons/).
$SETLINE "$NEW/manifest.webmanifest" '  "name":' '  "name": "VOICE Beta",'
$SETLINE "$NEW/manifest.webmanifest" '  "short_name":' '  "short_name": "VOICE Beta",'
$SETLINE "$NEW/manifest.webmanifest" '  "description":' '  "description": "Test copy of VOICE. New features are tried here first.",'
$SETLINE "$NEW/index.html" '<title>' '<title>VOICE</title>'
$SETLINE "$NEW/index.html" '<meta name="apple-mobile-web-app-title"' '<meta name="apple-mobile-web-app-title" content="VOICE Beta">'
cp tools/beta-icons/*.png "$NEW/icons/"

# 5. Service worker file list for beta (only beta's own files). Needs a sw.js version first.
$SETLINE "$NEW/sw.js" 'const CACHE_VERSION' "const CACHE_VERSION = \"beta-aac-v$((OLD_N > 0 ? OLD_N : 1))\";"
mkdir -p "$STAGE/repo/tools"
cp tools/update-cache-list.py "$STAGE/repo/tools/"
mv "$NEW" "$STAGE/repo/beta"
python3 "$STAGE/repo/tools/update-cache-list.py" beta >/dev/null
NEW="$STAGE/repo/beta"

# 6. Same as what is already in beta/? Then leave it alone. Otherwise raise the cache number and replace it.
if [ -d beta ] && diff -rq beta "$NEW" >/dev/null 2>&1; then
  echo "beta/ is already up to date (nothing changed)."
  exit 0
fi
if [ "$OLD_N" -gt 0 ]; then
  $SETLINE "$NEW/sw.js" 'const CACHE_VERSION' "const CACHE_VERSION = \"beta-aac-v$((OLD_N + 1))\";"
fi
rm -rf beta
cp -R "$NEW" beta
echo "beta/ rebuilt from the main app: $(grep -m1 '^const CACHE_VERSION' beta/sw.js)"
