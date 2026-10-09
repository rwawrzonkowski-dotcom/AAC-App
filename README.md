# AAC Board (Phase 1)

A free, offline communication board for children who are new to AAC
(augmentative and alternative communication). Built for iPad, in landscape.

## What it does
- A 9 x 5 core board (45 locations). **A word never changes location**, on the
  main board or on any category page. Words not yet revealed show as blank gray
  tiles, so visible words never move.
- Tap a word: it speaks immediately and appears in the message bar.
  Tap the message bar to speak the whole sentence. Delete / Clear edit it.
- **Category pages (two taps).** Tap Food, Drinks, Play, Places, People or
  Favorites: the page opens (no speech) with an orange background and the page
  name at the top. Tap an item: it speaks, is added to the message bar, and the
  board returns to the main page. The orange **Back** button (left arrow) sits in the same
  spot the category button had on the main board.
- Several learners can share one iPad. Each has their own stage, hidden/shown
  words, renamed words, photos, added words and voice settings.
- Works offline. Nothing is sent anywhere: no accounts, no ads, no tracking.
  Photos and settings stay on the device.

Not built yet: real photos/symbols (emoji for now), touch settings, backup/export,
photo-suggested words, data logging.

## For adults
**Open the adult menu:** press and HOLD the small faint circle at the top-left of
the gray strip (under the message bar) for 3 seconds. A ring fills while you hold.
Then type your 4-digit passcode.

**First time:** you are asked to create a passcode (type it twice). This only keeps
little fingers out; it is not security. If it is forgotten it can only be reset by
clearing this app's data from iPad Settings (this also erases profiles and photos).

**Adult menu**
- **Learner:** switch, add, rename or delete a learner (the last one cannot be deleted).
  The current learner's first name shows faintly in the message bar corner.
- **Vocabulary stage:** tap Stage 1-4. Each stage lists the words it reveals.
- **Edit board:** see every button (hidden ones faded with a dashed outline) on the
  page you are on. Tap any button to change it: Follow stage / Always show / Always hide,
  label, spoken text, and a photo (take or choose one; it is shrunk and kept on the
  device). Tap an **empty** cell to add a word there (this is how Favorites is filled);
  it keeps that spot forever. There is no way to move a word. Tap **Done** to leave.
  In Edit mode, tap a category button and choose "Open this page" to edit its page.
- **Voice:** pick a voice, set pitch and speed, tap **Preview**, or reset to the
  child or adult default. Saved per learner.
- **Start modeling:** a purple "Modeling" bar appears. Your taps work normally and the
  tapped button gets a bright pulsing ring; after a category item, the page stays up briefly so the item's ring is seen, then
  the category button is highlighted to show the path. Hold **End** for 2 seconds to stop.

## Install on an iPad
1. Open https://rwawrzonkowski-dotcom.github.io/AAC-App/ in **Safari**.
2. Tap the Share button, then **Add to Home Screen**.
3. Open it from the home screen icon and hold the iPad sideways.

Make sure the iPad is not on silent mode and the volume is up.

## Files
- `data/core-board.json` the word map (row, col, word type, stage). Positions are permanent.
- `js/app.js` ties it together (pages, taps, edit and model modes).
- `js/board.js` works out and draws the grid; `js/speech.js` speaks.
- `js/profiles.js` + `js/db.js` learner profiles and photos (IndexedDB);
  `js/storage.js` small settings (current learner, passcode) in localStorage.
- `js/lock.js` passcode keypad; `js/adult.js` adult menu; `js/editor.js` button editor;
  `js/hold.js` press-and-hold; `js/ui.js` small dialog helpers;
  `js/events.js` in-memory tap list for a later phase.
- `sw.js` caches the app for offline use. Change `CACHE_VERSION` whenever files change.

## Testing locally
`python3 -m http.server` in this folder, then open http://localhost:8000.

## Credits
See [CREDITS.md](CREDITS.md). Universal Core vocabulary (c) Center for Literacy
and Disability Studies, University of North Carolina at Chapel Hill, CC BY 4.0.
