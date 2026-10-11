# AAC Board (Phase 1.6B)

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
  - **Row groups.** Every category page is organized as rows of related words (for example
    Food: Snacks, Fruit, Meals, Breakfast, Veggies and extras). A word keeps the **same row and
    the same column on both board sizes**: the 45 board uses columns 1-9 of a row, and the 84
    board adds a few more words in columns 10-12 of that same row. The Back button sits where
    the button that opened the page sits; when it falls inside a word row on the 45 board
    (Food and Chat), that column is left empty on both sizes. On the 84 board the two bottom
    rows of every page are left empty for your own words.
  - **Newer words appear from stage 3.** The original starter items of each page (for
    example cracker, apple, banana ... on Food) show whenever the page is open; the newer words
    in the rows show from stage 3 (or when you choose Always show on one). Nothing moves.
  - **Chat** (both sizes): Greetings, Turns and play, Comments, Manners and protest, Help.
    Each speaks its whole phrase ("I don't know" has the short label "don't know").
  - **Feelings** (feelings, body needs, body parts) and **Animals** (pets and farm, wild,
    small, more) are main-grid buttons on the 84 board. On the 45 board they are reached from
    a page: Chat > Feelings and Play > Animals (three taps to a word; the Back button goes up
    one level; "Make this a page" is not offered there).
  - **About me**: sentence buttons with a blank an adult fills in ("My name is ___",
    "I am ___ years old", "I go to ___", "My mom is ___", "My dad is ___", "I love ___",
    "My birthday is ___", "My pet is ___", "My brother is ___", "My sister is ___", "My teacher is ___",
    "I am allergic to ___", "Emergency contact: ___") plus two fixed sentences ("I use this device
    to talk", "Please give me time to answer"). A button whose blank is empty stays a hidden gray
    tile until an adult fills it in (Edit board > tap it > **Fill in**). On the 45 board it is
    reached from the People page (People > About me, three taps); on the 84 board it is a
    main-grid button (two taps). There is no home-address button, and the emergency-contact
    field shows a privacy reminder.
  - **Places** includes "here" (it used to be on the main board).
- **Words pages (three taps).** The **Words** button in the top bar (between the message text and Delete)
  opens the Words menu: Little words, More little words, Actions, Past tense, Describing, Time (first row)
  and Colors, Numbers, Clothes, Outside, Things (second row). Tap a page, then a word: that is
  **Words, page, word = three taps**, and the board returns to the main page. While any Words page is
  open the same button reads **Close** and goes straight back to the main board. A page's orange
  **Back** button sits where its button on the Words menu sits and goes up one level (to the menu).
  The pages use the same row-group layout as the category pages (45 board: columns 1-9; the 84 board adds
  columns 10-12 of the same rows; rows 6-7 of the 84 board are left empty for your words), so a word has the
  same row and column on both sizes and **never moves**.
  - **Every one of the 318 Dolch sight words is reachable within 3 taps on both board sizes**
    (`docs/dolch-coverage.md` shows exactly how each one is reached; `python3 tools/dolch-coverage.py` checks it
    and fails if any word is not). Only four synonyms are allowed: father = dad, mother = mom,
    rabbit = bunny, house = home. Six words (ate, goes, going, got, made, went) are reached through **Forms**.
  - **Little words** are text first: the word is drawn large across the button, with a symbol only where one is
    genuinely clear (over, under, around, away). The button and its picture area are exactly the same size as
    any other button (the picture area is simply empty). **Pronouns** (he, she, we, they, me, him, her, us, them,
    myself, my, your, his, our, their, its) are on *More little words*, in the rows after the helper words
    (is, was, have, will...). *Past tense* holds ran, saw, said, came, gave and found. The extra pages
    (More little words, Past tense) exist because 44 buttons per page on the 45 board were not enough for all the
    little words and still leave room for the Back button.
  - The Words and Forms buttons are shown by the learner's **Show Words button** setting (adult menu >
    Vocabulary stage): Auto (from stage 3, the default), Always or Never.
- **Forms.** The **Forms** button (next to Words) is on only when the last word in the message bar has other
  forms: verbs (go: goes, going, went, gone), irregular verbs, adjectives (good, better, best), plurals
  (man, men), pronouns (I, me, my, mine, myself). It opens a large popover over the grid (the grid does not
  change); tap a form to replace the last word and speak it. Tap outside to close. The forms live in
  `data/word-forms.json`; add a family there to add more. In Model mode, Forms counts as a model event
  (`{ word, form, mode: "model" }`).
- **Reading stage (words only).** Adult menu > Vocabulary stage > *Show words only (no pictures)*: hides every
  symbol and photo on every page and shows the words large and centered in the same buttons (colors stay).
  Saved per learner and included in backups.
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
  learner's board. Below the stages: **Show Words button** (Auto from stage 3 / Always / Never) and
  **Show words only (no pictures)** (the reading stage: pictures are hidden so the learner reads the words).
- **Edit board:** see every button (hidden ones faded with a dashed outline) on the
  page you are on. Tap any button to change it: Follow stage / Always show / Always hide,
  label, spoken text, and a photo (take or choose one; it is shrunk and kept on the
  device). A large **speaker button** ("Hear it") beside the Label, Spoken text, Fill in and
  page name fields says the text you have typed so far, exactly as the board would (this learner's
  voice, pitch and speed). It does not save anything, does not touch the message bar and is not
  recorded. Tap an **empty** cell to add a word there (this is how Favorites is filled);
  it keeps that spot forever. There is no way to move a word. Tap **Done** to leave.
  In Edit mode, tap a category button and choose "Open this page" to edit its page.
  The Edit banner also has a **Words** button (when this learner's Words button is allowed) that opens the Words menu, so the
  Words pages can be edited the same way (tap a page button, choose "Open this page"; the button then reads **Close Words**).
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
    stepped back out one at a time, showing the Model prompt on the button that opened each page, so the
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
  (board size, stage, button changes, pages you made, voice, touch settings, Model prompt
  settings, the Words button and words-only settings, and photos, including the critter picture; never the passcode). Backups made by earlier versions still restore (they are upgraded). On the
  iPad a save sheet opens: choose **Save to Files**. *Restore from backup* reads a file,
  shows the learners and photo count inside, and for each learner asks whether to **add
  as a new learner** (default) or **replace** a learner with the same name (asks again
  before replacing). Nothing changes until you tap Restore.
- **Start modeling:** a purple "Modeling" bar appears. Your taps work normally and the
  tapped button gets the learner's *Model prompt* (see below); after a category item, the
  page stays up briefly so the prompt on the item is seen, then each button that opened a
  page gets the prompt in turn, so the whole path is shown. Hold **End** for 2 seconds to stop.
- **Model prompt (for this learner):** what Model mode shows on each modeled button.
  - *Prompt style:* **Ring only** (the default), **Critter only**, or **Critter and ring**.
  - *Ring opacity* and *Critter opacity*, 0 to 100% in steps of 5 (default 100%). At 0% that
    prompt is off, but the model is still recorded.
  - *Critter:* choose the animal (puppy, kitten, bunny, frog, owl), its color (8 swatches),
    an accessory (none, hat, bow, glasses), its size (small, medium or large: about 45%, 65%
    or 85% of a button's shorter side) and how it arrives: **hop** (arcs in from just off the
    bottom left of the screen), **peek** (slides up from the button's bottom edge) or
    **appear** (fades in). It stays about 1.2 seconds, then fades out. If the iPad is set to
    Reduce Motion, it always simply appears.
  - *Use my own picture:* a photo (shrunk to 512 px, kept only on this iPad) replaces the
    drawn animal. Pick something the child loves, like a favorite toy. *Remove picture* goes
    back to the animal. The animal, color and accessory choices do not apply to your own picture.
  - *Preview* shows the critter at the chosen opacity. *Preview on board* closes the menu for a
    moment, runs the prompt on the "more" button, and reopens the menu. Nothing is spoken,
    nothing is added to the message bar, and nothing is recorded.
  - **Why opacity fading helps:** a model prompt that stays just as bright forever can become
    the thing the child watches. Lowering the ring or critter opacity a little at a time makes
    the prompt less and less noticeable as the child succeeds, which is a built-in way to fade
    the prompt (for example 100%, 80%, 60% ... 0%) while you keep modeling the word's location.
  - **Caution:** if the child watches the critter more than the button, fade it faster (lower the
    opacity sooner) or switch to the ring. The critter is only meant to point at the button.
  - The ring and critter are drawn on top of the board and never block a tap, and they never move,
    resize or reflow any button.

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
  nothing carries onto Chat. The same upgrade is applied to old backup files.
- **Phase 1.6 reorganized every category page into row groups.** Built-in words moved, and
  their renames, photos and show/hide choices moved with them (they are stored by word id).
  Where an adult had added a word to a cell that a built-in word now needs, **the adult's
  word is kept** and moved to the first free cell of the same page (on the 84 board the two
  bottom rows first). The 45 Food page is completely full, so such a word goes to the first free
  cell of Favorites instead. A page button you made moves with its page, and photos move too. A note listing
  every moved word appears at the top of the adult menu until you tap **Got it**. Backups made
  before this phase are upgraded the same way when restored. Code: `js/migrate.js`.

## Install on an iPad
1. Open https://rwawrzonkowski-dotcom.github.io/AAC-App/ in **Safari**.
2. Tap the Share button, then **Add to Home Screen**.
3. Open it from the home screen icon and hold the iPad sideways.

Make sure the iPad is not on silent mode and the volume is up.

## Files
- `data/core-board.json` the word map: every word (type, stage, picture), the 45 and 84
  main grids written out row by row, and the category pages as row groups ("words" in columns
  1-9, "adds" in columns 10-12 on the 84 board). Positions are permanent.
- `js/boardmodel.js` works out which word is in which cell for a grid size and a learner;
  `js/boarddata.js` loads the word map; `js/migrate.js` upgrades older learner data.
- `js/app.js` ties it together (pages, taps, edit and model modes, the Words and Forms buttons).
- `js/forms.js` loads `data/word-forms.json` and shows the Forms popover.
- `js/board.js` draws the grid (and fits labels into buttons); `js/speech.js` speaks.
- `js/critters.js` the critter's settings, checks and drawing; `js/modelprompt.js` shows the ring
  and critter in Model mode; `js/modelsettings.js` is the Model prompt part of the adult menu.
- `js/profiles.js` + `js/db.js` learner profiles and photos (IndexedDB);
  `js/storage.js` small settings (current learner, passcode) in localStorage.
- `js/lock.js` passcode keypad; `js/adult.js` adult menu; `js/editor.js` button editor;
  `js/hold.js` press-and-hold; `js/ui.js` small dialog helpers;
  `js/events.js` in-memory tap list for a later phase.
- `images/critters/` the five drawn animals and three accessories (original drawings; the body
  color is the CSS variable `--body`, so recoloring needs no extra files).
- `images/symbols/` the built-in symbols (one SVG per word); `data/image-sources.json`
  says where each came from. `js/backup.js` saves and restores backups.
- `data/word-forms.json` the word families for the Forms button; `data/dolch.json` the 318 Dolch words
  (only read by `tools/dolch-coverage.py`, which writes `docs/dolch-coverage.md`).
- `tools/make-credits.py` rewrites CREDITS.md from image-sources.json;
  `tools/update-cache-list.py` rewrites the file list in sw.js (run both after changing
  pictures or files, then bump `CACHE_VERSION`).
- `sw.js` caches the app for offline use. Change `CACHE_VERSION` whenever files change.

## Testing locally
`python3 -m http.server` in this folder, then open http://localhost:8000.

## Credits
See [CREDITS.md](CREDITS.md). Universal Core vocabulary (c) Center for Literacy
and Disability Studies, University of North Carolina at Chapel Hill, CC BY 4.0.
