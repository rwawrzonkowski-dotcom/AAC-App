# AAC Board (Phase 1.5A)

A free, offline communication board for children who are new to AAC
(augmentative and alternative communication). Built for iPad, in landscape.

## What it does
- A core board of **45 locations (9 x 5)** or **84 locations (12 x 7)**, chosen
  **per learner** (adult menu > Board size). On a given board size **a word never
  changes location**, on the main board or on any page. Words not yet revealed
  show as blank gray tiles, so visible words never move.
- The first four rows of the 84 board are identical to the 45 board (same words,
  same places). The 45 board's bottom row (yes, no, Chat and the category buttons)
  is the 84 board's bottom row, in the same columns. Rows E and F of the 84 board
  hold the extra words. Switching size moves the bottom row down, so it is a
  relearning event (the adult must confirm).
- Tap a word: it speaks immediately and appears in the message bar.
  Tap the message bar to speak the whole sentence. Delete / Clear edit it.
- **Category pages (two taps).** Tap Chat, Food, Drinks, Play, Places, People or
  Favorites (and, on the 84 board, About me, Feelings or Animals): the page opens
  (no speech) with an orange background and the page name at the top. Tap an item:
  it speaks, is added to the message bar, and the board returns to the main page.
  The orange **Back** button (left arrow) sits in the same spot the button that
  opened the page has. **Back goes up one level.**
  - Page items fill the page left to right, top to bottom from the top-left,
    skipping the Back cell, in the same order on both board sizes. Pages are the same
    size as the learner's board (9 x 5 or 12 x 7).
  - **Chat** (both sizes): hi, bye, my turn, your turn, sorry, how are you?,
    I need a break, look at me, please, thank you, good morning, good job. Each speaks
    its whole phrase.
  - **About me**: sentence buttons with a blank an adult fills in ("My name is ___",
    "I am ___ years old", "I go to ___", "My mom is ___", "My dad is ___", "I use this
    device to talk", "I am allergic to ___", "Emergency contact: ___"). A button whose
    blank is empty stays a hidden gray tile until an adult fills it in (Edit board >
    tap it > **Fill in**). It then speaks the whole sentence. On the 45 board it is
    reached from the People page (People > About me, three taps); on the 84 board it
    is a main-grid button (two taps). There is no home-address button, and the
    emergency-contact field shows a privacy reminder.
  - **Feelings** and **Animals** are on the 84 board only (the 45 board is full).
  - **Places** includes "here" (it used to be on the main board).
- Several learners can share one iPad. Each has their own stage, hidden/shown
  words, renamed words, photos, added words and voice settings.
- Works offline. Nothing is sent anywhere: no accounts, no ads, no tracking.
  Photos and settings stay on the device.

Every button shows an open-licensed symbol (Mulberry Symbols or OpenMoji, see
CREDITS.md). Symbols for objects and food are stand-ins until an adult adds real
photos. Not built yet: photo-suggested words, data logging.

## For adults
**Open the adult menu:** press and HOLD the small faint circle at the top-left of
the gray strip (under the message bar) for 3 seconds. A ring fills while you hold.
Then type your 4-digit passcode.

**First time:** you are asked to create a passcode (type it twice). This only keeps
little fingers out; it is not security. If it is forgotten it can only be reset by
clearing this app's website data in iPad Settings, which ALSO erases all learners and
photos. Keep a recent backup (see Backup below), then restore it after resetting.

**Adult menu**
- **Learner:** switch, add, rename or delete a learner (the last one cannot be deleted).
  The current learner's first name shows faintly in the message bar corner.
- **Board size (per learner):** 45 or 84 locations. Switching asks you to confirm and
  explains that word locations change (a relearning event). The learner keeps their stage.
  See "Where your changes are stored" below for what comes with them.
- **Vocabulary stage:** tap Stage 1-4. Each stage lists the words it reveals on this
  learner's board.
- **Edit board:** see every button (hidden ones faded with a dashed outline) on the
  page you are on. Tap any button to change it: Follow stage / Always show / Always hide,
  label, spoken text, and a photo (take or choose one; it is shrunk and kept on the
  device). Tap an **empty** cell to add a word there (this is how Favorites is filled);
  it keeps that spot forever. There is no way to move a word. Tap **Done** to leave.
  In Edit mode, tap a category button and choose "Open this page" to edit its page.
  - **Make this a page** (up to three taps deep). When you add a button to an empty cell
    on a page that is not already two levels down, choose **Make this a page**, give it a
    name (and optionally a photo). The new button looks like a category button and opens a
    new empty page of the learner's board size, with Back in the same spot as the button.
    Fill that page's empty cells with words. The main board is level 0, a page opened
    from it is level 1 (two taps to a word), a page opened from that is level 2 (three
    taps). "Make this a page" is not offered on a level-2 page. The built-in About me page
    under People (45 board) is level 2. The main board has no empty cells, so the first
    adult-made page is made on a page such as Favorites (making it level 2).
  - To delete an adult-made page, edit its button and choose **Delete this page**
    (asks first). The page and everything on it are removed.
  - Tapping a word on any page returns to the main board. In model mode the pages are
    stepped back out one at a time, ringing the button that opened each page, so the
    whole path (word, page button, category button) is shown.
- **Voice:** pick a voice, set pitch and speed, tap **Preview**, or reset to the
  child or adult default. Saved per learner.
- **Touch (per learner):** two optional helps, both Off by default. They apply to the
  child's board (words, category buttons, Back) in normal and modeling mode, not to
  the message bar, Delete/Clear, adult screens or Edit mode.
  - *Hold to select* (0.1 to 2.0 s): the child must keep a finger on the button that
    long. A ring fills while holding; lifting early or sliding off does nothing.
  - *Ignore repeated taps* (0.25 to 3.0 s): after a word is spoken, taps on any board
    button are ignored for that long. Opening a category does not start the wait.
- **Backup:** *Save backup of this learner* or *of all learners* makes one .json file
  (board size, stage, button changes, pages you made, voice, touch settings and photos;
  never the passcode). Backups made by earlier versions still restore (they are upgraded). On the
  iPad a save sheet opens: choose **Save to Files**. *Restore from backup* reads a file,
  shows the learners and photo count inside, and for each learner asks whether to **add
  as a new learner** (default) or **replace** a learner with the same name (asks again
  before replacing). Nothing changes until you tap Restore.
- **Start modeling:** a purple "Modeling" bar appears. Your taps work normally and the
  tapped button gets a bright pulsing ring; after a category item, the page stays up briefly so the item's ring is seen, then
  the category button is highlighted to show the path. Hold **End** for 2 seconds to stop.

## Where your changes are stored (rules)
Every change is kept in one of two places, so nothing lands on the wrong word:
- **Built-in words** (everything in the board file, including "want", "Chat", every
  Chat phrase, every About me button): changes are stored **by the word's id** - its
  renamed label, spoken text, show/hide choice, filled-in blank and photo. They
  **follow the word** to its place on the other board size. (One word is one id
  everywhere it appears: for example "he" on the People page and "he" on the 84 main
  board are the same word and share their changes.)
- **Things an adult adds to an empty cell** (a word on Favorites, an adult-made page and
  everything on it) are stored **by position and board size**. They belong to that cell
  on that board size only: a word added to Favorites on the 45 board is not on the 84
  Favorites page, and comes back if you switch back to 45. Adult-made pages exist only
  on the board size they were made on.
- Photos are stored the same way (a built-in word's photo by word, an added button's
  photo by position).
- **Upgrading older learners.** Before Phase 1.5A everything was stored by position,
  and "here" sat where "Chat" now sits. On first start, old data is re-keyed: whatever
  belonged to "here" (rename, show/hide, photo) moves with "here" to the Places page and
  nothing carries onto Chat. (If an adult had put their own word in the Places or People
  cell where "here" or "About me" now go, that word stays put and the built-in button is
  placed in the next free cell for that learner.) The same upgrade is applied to old
  backup files. Code: `js/migrate.js`.

## Install on an iPad
1. Open https://rwawrzonkowski-dotcom.github.io/AAC-App/ in **Safari**.
2. Tap the Share button, then **Add to Home Screen**.
3. Open it from the home screen icon and hold the iPad sideways.

Make sure the iPad is not on silent mode and the volume is up.

## Files
- `data/core-board.json` the word map: every word (type, stage, picture), the 45 and 84
  main grids written out row by row, and the pages with their items in order. Positions are permanent.
- `js/boardmodel.js` works out which word is in which cell for a grid size and a learner;
  `js/boarddata.js` loads the word map; `js/migrate.js` upgrades older learner data.
- `js/app.js` ties it together (pages, taps, edit and model modes).
- `js/board.js` draws the grid (and fits labels into buttons); `js/speech.js` speaks.
- `js/profiles.js` + `js/db.js` learner profiles and photos (IndexedDB);
  `js/storage.js` small settings (current learner, passcode) in localStorage.
- `js/lock.js` passcode keypad; `js/adult.js` adult menu; `js/editor.js` button editor;
  `js/hold.js` press-and-hold; `js/ui.js` small dialog helpers;
  `js/events.js` in-memory tap list for a later phase.
- `images/symbols/` the built-in symbols (one SVG per word); `data/image-sources.json`
  says where each came from. `js/backup.js` saves and restores backups.
- `tools/make-credits.py` rewrites CREDITS.md from image-sources.json;
  `tools/update-cache-list.py` rewrites the file list in sw.js (run both after changing
  pictures or files, then bump `CACHE_VERSION`).
- `sw.js` caches the app for offline use. Change `CACHE_VERSION` whenever files change.

## Testing locally
`python3 -m http.server` in this folder, then open http://localhost:8000.

## Credits
See [CREDITS.md](CREDITS.md). Universal Core vocabulary (c) Center for Literacy
and Disability Studies, University of North Carolina at Chapel Hill, CC BY 4.0.
