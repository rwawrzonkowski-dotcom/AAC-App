# AAC Board (Phase 1)

A free, offline communication board for children who are new to AAC
(augmentative and alternative communication). Built for iPad, in landscape.

## What it does so far
- A 9 x 5 core board (45 locations). **A word never changes location.**
  Words not yet taught show as blank gray tiles, so visible words never move.
- Tap a word: it speaks immediately and appears in the message bar.
  Tap the message bar to speak the whole sentence. Delete / Clear buttons edit it.
- Works offline. Nothing is sent anywhere: no accounts, no ads, no tracking.

Not built yet: category pages, adult edit mode, profiles, photos, backup.

## Install on an iPad
1. Open https://rwawrzonkowski-dotcom.github.io/AAC-App/ in **Safari**.
2. Tap the Share button, then **Add to Home Screen**.
3. Open it from the home screen icon and hold the iPad sideways.

Make sure the iPad is not on silent mode and the volume is up.

## Temporary developer switches (will be replaced by adult controls)
Add to the web address:
- `?stage=1` ... `?stage=4` shows words up to that stage (saved on the device).
- `?voice=adult` or `?voice=child` picks the voice (saved on the device).

## Files
- `data/core-board.json` the word map (row, col, word type, stage). Positions are permanent.
- `js/board.js` draws the grid; `js/speech.js` speaks; `js/storage.js` saves settings locally.
- `sw.js` caches the app for offline use. Change `CACHE_VERSION` whenever files change.

## Testing locally
`python3 -m http.server` in this folder, then open http://localhost:8000.

## Credits
See [CREDITS.md](CREDITS.md). Universal Core vocabulary (c) Center for Literacy
and Disability Studies, University of North Carolina at Chapel Hill, CC BY 4.0.
