# VOICE changelog and code map

*Updated Nov 4, 2026, at VOICE Beta 3.13. Part 1 lists what changed in each version; part 2 shows which code runs which feature.*
*Paths are inside `beta/` (the stable copy in the repo root has the same layout).*

## Part 1: Versions

| Version | Date | What changed | Main files |
|---|---|---|---|
| **Beta 3.13** | Nov 5 | **Done always works:** banner Done/Undo (Add targets, Add a sentence, Edit) act on click with a finger-lift fallback; leaving the mode always completes; holding the gear also ends Add targets / Edit (a sentence of 2+ words is saved). | `app.js` (`onBannerTap`, `stopChoosing`, `openAdult`) |
| Beta 3.12 | Nov 5 | **Sentence targets:** chains of 2–6 words taught by total task, forward or backward chaining; each word has its own prompt step and fades on its own; forward chaining has the app model the rest, backward fills in the first words; optional "say the sentence" step; next-word suggestion at session end; task-analysis table in Reports; Sentence words CSV. Backup v18. | `teaching.js`, `session.js`, `teachui.js`, `teachdata.js`, `ladderui.js`, `app.js`, `reportdata.js`, `reportdoc.js`, `reportexport.js`, `reports.js`, `backup.js`, `index.html`, `styles.css` |
| Beta 3.11 | Nov 4 | **End modeling button:** the top banner is only a label now (iPadOS delays or cancels touches at the top edge when opened from the Home Screen, so the banner hold could not finish). A large End modeling button at the right end of the message bar ends Model mode with two taps (tap, then "Tap again to end" within 3 s). | `index.html`, `styles.css`, `app.js` (`initModelEnd`, `placeModelEnd`, `resetModelEnd`) |
| Beta 3.10 | Nov 4 | **Ending Model mode:** the whole purple banner is the 2-second hold target (with an invisible margin to reach 44 px), it sits above the scene photo and Forms popover, and the adult menu shows "Stop modeling" while modeling. | `index.html`, `styles.css`, `app.js` (`attachHold` on `#model-banner`, `isModeling` / `onStopModel`), `adult.js` |
| **Beta 3.9** | Nov 4 | **Adult menu redesign** (iPad Settings style): on iPad a list on the left (learner card, quick actions, search, grouped rows showing current values) and the chosen page on the right; on a phone one column at a time with "‹ Settings". **Parent / Clinician view** (device-wide, chosen on the first setup screen, switchable in the menu's top bar; Parent hides Targets and sessions, Everyday data and "Start a session"). **Settings search** (title + keywords, start-of-word matching, "N more results in Clinician view"). The five Auto/Always/Never choices moved to one "Buttons on the board" page; "Reading and typing" got its own page. **Code review:** removed `events.js` (an in-memory tap list that was never read and grew all session; everyday recording already saves every tap) and 16 unused functions; removed one unused style. | `settingsnav.js` (new), `adult.js`, `setup.js`, `styles.css` |
| Beta 3.8 | Nov 4 | Six built-in phrase buttons now show the same words they say (I don't understand, I don't know, I don't like it, what's your name?, I use this device to talk, Please give me time to answer). | `data/core-board.json` |
| Beta 3.7 | Nov 4 | **Little-word strip:** 8 little words in fixed strip slots, each with a hold dial of 4 more (40 words). Scene takes the strip over; per-learner Auto/Always/Never. Backup v17. | `littlewords.js` (new), `app.js`, `adult.js`, `profiles.js`, `backup.js`, `everyday.js`, `reportdata.js`, `reportexport.js` |
| Beta 3.6 | Oct 30 | Scene tags say where a word lives (On board · folder / Hidden for now / Scene only). Camera: fresh photo control each time, reset on return, bold pulsing TAP. | `scenewords.js` (`whereIs`, `placeTag`), `sceneadult.js`, `camerabtn.js` |
| Beta 3.5 | Oct 30 | Adult-menu circle made findable: gear icon, quick-tap hint, once-per-learner pointer, "Show where the adult menu is". | `adulthint.js` (new), `ui.js` (`toast`), `index.html` |
| Beta 3.4 | Oct 30 | Data safety: asks the browser to keep data; Home Screen notice on iPad Safari; status line under Backup. Updates download only changed files (fingerprinted cache list). | `keepdata.js` (new), `sw.js`, `tools/update-cache-list.py` |
| Beta 3.3 | Oct 29 | Narrow Delete/Clear; camera button moved to the strip, so the message bar shows more words. | `index.html`, `styles.css`, `app.js` |
| Beta 3.2 | Oct 29 | Camera button hold-then-tap (iPad Safari blocks the camera after a long press). | `camerabtn.js` |
| Beta 3.1 | Oct 29 | Scene-name words, "Teach VOICE your things" (My things), camera button. Backup v16. | `scenewords.js`, `things.js`, `thingsui.js`, `camerabtn.js`, `data/scene-places.json` |
| Beta 3.0 | Oct 29 | **Phase 3 camera scenes:** on-device object finding, approve and arrange, scene strip, photo scene, glow on the board. Backup v15. | `recognize.js`, `sceneadult.js`, `scenedata.js`, `scenestrip.js`, `scenewords.js`, `photoboxes.js`, `vendor/`, `models/` |
| **VOICE 2.0** | Oct 29 | **Phase 2 promoted:** targets, sessions, prompt ladders and fading, teaching instructions, everyday recording, reports and CSV export, voice picker. | see "Teaching" and "Data and reports" below |
| VOICE 1.1 | Oct 27 | VOICE name and icon, About screen, word-forms dial, iPhone safe areas, Test the volume, phone tips. | `dial.js`, `forms.js`, `about.js`, `devicetips.js` |
| VOICE 1.0 | Oct | Phase 1: 45/84 boards, stages, folders, Words menu, keyboard, number pad, adult menu, edit mode, Model mode, several learners, backup. | most of "Board" below |

## Part 2: Which code runs which feature

### Start-up, storage and offline
| Feature | Code |
|---|---|
| Wiring everything together: board redraws, taps, message bar, modes | `app.js` |
| Stable vs beta copy (storage prefix, version label) | `channel.js` |
| Saved settings (localStorage, never throws) | `storage.js` |
| Database (IndexedDB wrapper: prefix reads, ranges, batches) | `db.js` |
| Offline cache and updates that download only changed files | `sw.js`, `tools/update-cache-list.py` |
| Keeping data safe (persist request, Home Screen notice, Backup status line) | `keepdata.js` |
| First-run setup (board choice, Parent/Clinician view, restore) | `setup.js` |
| Upgrading data saved by older versions | `migrate.js` |

### Board and speaking
| Feature | Code |
|---|---|
| Word map loading | `boarddata.js`, `data/core-board.json` |
| Which word sits where (45/84 layouts, stages, pages, folders) | `boardmodel.js` |
| Drawing the grid; tap, hold-to-select, ignore-repeats, hold-for-dial | `board.js` (`renderBoard`, `attachPressHandling`) |
| Speech (word vs sentence speed, pauses between words) | `speech.js` |
| Voice picker (installed voices by accent, novelty voices) | `voicepicker.js` |
| Word forms (Forms button) and the press-and-hold forms dial | `forms.js`, `dial.js`, `data/word-forms.json` |
| Little-word strip and its dials | `littlewords.js` (+ `updateLittle`, `onLittleTap`, `openLittleDial` in `app.js`) |
| Keyboard (ABC) and number pad | `keyboard.js`, `numberwords.js` |
| Editing a button (photo, label, Hear it, show/hide) | `editor.js` |
| Learner profiles and their settings | `profiles.js` |
| Press-and-hold ring helper | `hold.js` |
| Device tips (phone check, Test the volume, more voices) | `devicetips.js` |

### Adult screens
| Feature | Code |
|---|---|
| Adult menu layout, quick actions and every settings page | `adult.js` |
| Menu structure: pages, groups, Parent/Clinician view, search | `settingsnav.js` |
| Passcode lock | `lock.js` |
| Finding the adult menu (gear, tap hint, pointer) | `adulthint.js` |
| Overlays, prompts, toast | `ui.js` |
| About screen and its links | `about.js`, `data/about.json` |
| Backup and restore files (versions 1–17) | `backup.js` |

### Modeling and teaching
| Feature | Code |
|---|---|
| Model mode prompt (ring and critter, opacity) | `modelprompt.js`, `critters.js`, `modelsettings.js` |
| Starting and ending Model mode (End modeling button, menu quick action) | `app.js` (`startModeling`, `stopModeling`, `initModelEnd`, `placeModelEnd`), `adult.js`, `#model-banner` and `#model-end` in `index.html` |
| Teaching rules: ladders, fading, mastery (pure, testable) | `teaching.js` |
| Sentence targets: rules (phases, per-word fading, next-word suggestion) | `teaching.js` ("Sentence targets" section) |
| Sentence targets: building one on the board (Add a sentence) | `app.js` (`startChoosing("sentence")`, `chooseCell`, `markTargets`) |
| Sentence targets: running a trial (fill-in, app modeling, say-the-sentence step) | `session.js` (`startSentenceTrial`, `beginLink`, `nextPart`), `app.js` (`modelChainWords`) |
| Sentence targets: settings and the "Add the next word?" question | `teachui.js` (`chainSection`, `askPhase`) |
| Sentence targets: task-analysis table and CSV | `reportdata.js` (`chainModel`), `reportdoc.js` (`chainTable`), `reportexport.js` (`sentenceRows`) |
| Targets, sessions and trials storage | `teachdata.js` |
| A running session (strip controls, trials, prompts) | `session.js` |
| Teaching screens (targets, start a session, summary) | `teachui.js`, `ladderui.js` |
| Teaching instructions (templates, Clinical/Parent wording) | `templates.js`, `instrui.js`, `instrcard.js`, `data/teaching-templates.json` |

### Data and reports
| Feature | Code |
|---|---|
| Everyday recording (taps, messages, daily summaries, first use) | `everyday.js` |
| Everyday data settings panel | `datapanel.js` |
| Report numbers (pure) | `reportdata.js` |
| Charts (hand-written SVG) | `reportcharts.js` |
| Report pages (on screen, printable clinical and parent summaries) | `reportdoc.js`, `reports.js` |
| CSV export (with formula guard) | `reportexport.js` |

### Scenes
| Feature | Code |
|---|---|
| Object recognition on the device (lazy-loaded) | `recognize.js`, `vendor/tf.min.js`, `models/coco-ssd/` |
| Scene screens (new scene, approve, arrange, quick sheet) | `sceneadult.js` |
| Scene storage and backup | `scenedata.js` |
| Scene strip, photo scene, glow on the board | `scenestrip.js` |
| Scene words: suggestions, related words, place words, where a word lives (tags) | `scenewords.js`, `data/scene-*.json` |
| My things (remembered objects) | `things.js`, `thingsui.js`, `data/embed-mean.json` |
| Photo helpers (rotate, crop, draw a box) | `photoboxes.js` |
| Camera button (hold, then tap) | `camerabtn.js` |

### Tools (not part of the app)
| Tool | Purpose |
|---|---|
| `tools/make-beta.sh`, `tools/promote-beta.sh` | Make the beta copy; promote beta to stable |
| `tools/update-cache-list.py` | Regenerate the offline file list with fingerprints |
| `tools/make-credits.py` | Build CREDITS.md |
| `tools/make-icons.py`, `tools/make-beta-icons.py` | App icons |
| `tools/dolch-coverage.py` | Check that every Dolch word is reachable |
| `tools/test-numberwords.mjs` | Number-to-words test |

## Code review notes (Nov 4)
- **Size:** about 11,900 lines of JavaScript in 55 files; the largest are `app.js` (895), `adult.js` (658), `sceneadult.js` (614) and `everyday.js` (532).
- **Removed as excess:** `events.js` (never-read tap list, grew every session) and the unused functions `listEvents`, `listUtterances` (everyday), `familyCount` (forms), `isLoaded` and `MAP_PX` (recognize), `daysBetween` (reportdata), `getScene` (scenedata), `photoSceneOpen` (scenestrip), `trialRunning` and `liveInfo` (session), `listVoices` and `isSequencePlaying` (speech), `loadedFor` (teachdata), `posIndependent` (teaching), `hasTemplate` (templates), `promptInfo` (app); unused style `.action-row`.
- **Kept on purpose:** constants and helpers exported only for testing (e.g. `computeDialLayout`, `csvCell`, `setDetectorForTests`); style classes built at runtime (`type-…`, `st-…`, `vp-q-…`).
- **Worth doing later:** `app.js` and `adult.js` keep growing; when the native app starts, split `app.js` into board, message bar and modes, and move each adult page into its own small file.
