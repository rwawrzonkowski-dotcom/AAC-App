# VOICE — Project Status and Reference

*Last updated: Oct 29, 2026 (VOICE 1.1 stable; Beta 2.5 in test). Read this first in any new session instead of re-reading old chats.*

**VOICE** = Variable Output for Individualized Communication and Expression. A free, iPad-first AAC (speech) app for nonvocal children new to AAC, built by **Richard Wawrzonkowski, M.S., LBA, BCBA**. Pilot with his clients now; public release later.

## Where things live

| What | Where |
|---|---|
| Stable app (clients use this) | https://rwawrzonkowski-dotcom.github.io/AAC-App/ — label "VOICE 2.0" (promoted Oct 29) |
| Beta app (testing only) | https://rwawrzonkowski-dotcom.github.io/AAC-App/beta/ — label "VOICE Beta 3.1": VOICE 2.0 plus **camera scenes** (Phase 3), **scene-name vocabulary**, **My things** and the **camera button** (see below) |
| Code | GitHub repo `rwawrzonkowski-dotcom/AAC-App` (branch `main`); restore points: branches `stable-1.0` (before VOICE) `stable-1.1` (VOICE 1.1) and `stable-2.0` (VOICE 2.0) |
| Planning doc (source of truth for decisions) | https://claude.ai/code/artifact/133274d9-e0f2-4009-8086-6f527aebe3af |
| Website plan | https://claude.ai/code/artifact/35106cdc-bca5-4b24-8e2f-c5c6a34d44d0 |
| This status file | Project doc `claude/VOICE-status.md` and repo `docs/VOICE-STATUS.md` |

## How we work

- **Opus plans and reviews; Sonnet builds.** Nothing is built until Richard says "approved."
- **New features go to the beta first.** Root folder = stable; `beta/` = full copy with its own storage (`beta-` prefix), passcode and offline cache. Only `beta/` and `tools/` change during feature work.
- **"Promote"** → `tools/promote-beta.sh "VOICE 1.1"` copies beta to stable (sets VOICE names, new icon, About data). **"Roll back"** → restore the most recent `stable-*` branch.
- **Before every push:** confirm no stable file changed (for beta work), board cells unchanged on 45 and 84, no console errors. After pushing, devices update when the app is fully closed and reopened.
- **Commit trailer:** `Co-Authored-By` + `Claude-Session` lines; author `Claude <noreply@anthropic.com>`.
- Tag pushes are blocked by the workspace proxy; use branches as restore points.

## Fixed design rules

1. A word never moves once placed (motor planning). Hidden words are gray tiles in their spot.
2. Landscape only. Grid chosen per learner: 45 (9×5) or 84 (12×7). Top four rows match across sizes; the bottom row moves down two rows on 84.
3. Vocabulary grows by revealing words (stages 1–4), never rearranging.
4. Privacy: no accounts, ads or tracking; everything stays on the iPad; backups are files the adult saves.
5. Open sources only: Universal Core (CC BY 4.0), Mulberry Symbols and OpenMoji (CC BY-SA 4.0), plus symbols drawn for this project.
6. Built-in folders may be up to 4 taps deep; adult-made pages are limited to 3.

## What's built (all live)

**Board and speech**
- 45 and 84 boards, 6 categories plus Chat, About me, Feelings, Animals; about 1,000 words total.
- Stage 1 starts with help, stop, eat, drink, bathroom, more. New page words appear at stage 3.
- Instant speech; message bar speaks the sentence; separate word speed, sentence speed and optional pause between words; child/adult voice with pitch and speed sliders.
- Word-only reading stage (hides pictures).

**Pages and words**
- Folders on every category and Words page (66 folders), e.g. Food → More food → Desserts.
- Top bar: Words (all 318 Dolch words within 3 taps), Forms (go → went), ABC keyboard (QWERTY with apostrophe), number pad (24 → "twenty-four").

**Adults**
- 3-second hold + passcode (stays unlocked 10 minutes); quick setup screen on new devices and new learners.
- Several learners per iPad; edit mode with Hear it, photos from camera, adult-made pages; About me fill-in sentences.
- Model mode with ring and customizable animal critter, both with opacity sliders for fading.
- Touch supports: hold to select, ignore repeated taps.
- Backup and restore (one learner or all).
- Event log of taps with word ids, ready for Phase 2 data.

**Added in VOICE 1.1 (promoted Oct 27)**
- Press-and-hold word-forms dial: tap or slide; fixed spots (past up, -ing right, -s down, participle left); markers can be turned off; on from stage 3.
- VOICE name, new icon (indigo speech bubble with "V" and five colored dots), About VOICE screen with Richard's name and five blank link spots (Website, Resources, Trainings, Reserve a training, Contact).
- iPhone safe areas: equal side margins keep buttons clear of the camera cutout and home bar; the board stays centered so nothing moves when the phone is turned. iPads unchanged.
- "Test the volume" button (setup screen and adult menu Voice section) with iOS or Android/Samsung tips; every utterance plays at full volume.
- Phones: setup screen and Board size panel recommend the 45 board.

## Added in VOICE 2.0 (promoted Oct 29): Phase 2, Rounds A, B and C — targets, sessions, prompting and fading, teaching instructions, everyday recording, reports

Promoted to clients Oct 29. Adult menu > Teaching (see README "Teaching sessions (beta)").
- **Targets** per learner (word id + page path), chosen by tapping words in an "Add targets" mode; status Baseline / Teaching / Mastered / Maintenance; per-target direction (most-to-least default or least-to-most), time delay (3 s), fade after 3 correct, back up after 2 misses, mastery rule (80% independent, 3 sessions, 3 trials each, 2 different people or settings), optional reward picture.
- **Sessions** (Who: Parent/RBT/Teacher/BCBA/Other; Where: Home/Clinic/School/Community): the empty context strip holds 1-second-hold controls (target, Start trial, Opportunity [NET], Skip, End session, trial counter). Prompt LADDERS (Beta 2.3): most help to least, then Independent; the default ladder only fades the Model prompt (100/75/50/25%). Forward chaining for words on category pages. Automatic fading for most-to-least targets; mastery and next-stage suggestions at session end (adult confirms).
- **Data** (IndexedDB stores `targets`, `sessions`, `trials`, keyed `<learnerId>|<id>`; database version 2) included in backups (file version 11, "Include teaching data", on by default). Round C (reports) reads these rows and the everyday data.
- **Teaching instructions (Beta 2.1, Oct 28):** 10 BCBA-approved templates (`beta/data/teaching-templates.json`), each with Clinical and Parent wording for cue, set up, when to teach, reinforcement, error correction and notes (`{word}`, `{name}` tokens). A target starts with a template picked from its word, then its page or folder, then General (`js/templates.js`); Round A targets get one on first load. Per target: edit any box, reset a box, change template, copy to other targets or to another learner (instructions only). Adult menu > Teaching > Teaching templates edits the wording per device (restore original wording; saved in all-learner backups, asks before replacing on restore). The session strip has an **Instructions** control (1-second hold) that opens a card for the current target; blocked while a trial runs. Backup file version 12.
- Tested with Playwright at 1180x820 and 1024x768 on the 45 and 84 boards; stable app files unchanged.

- **Reports (Beta 2.5, Oct 29, Round C):** adult menu > Reports (README "Reports (beta)"). Learner, range (2/4/12 weeks, all, custom) and Who / Where filters; tabs Teaching (per-target % independent line graph with mastery line, phase lines, Who shapes and Where letters, plus a prompt-help step graph; target table; session list), Everyday use (words and different words per day, vocabulary growth, weekly message length and % 2+ words, top 20, how reached, newest words), Printable summary (clinical page, optional instruction program sheet and notes, window.print), Parent summary (plain language, parent-wording practice list) and Export (CSV: trials, sessions, targets, everyday events, daily summary; UTF-8 BOM, share sheet). New files `js/reports.js` (screen), `js/reportdata.js` (numbers), `js/reportcharts.js` (hand-written SVG), `js/reportdoc.js` (page pieces and printable pages), `js/reportexport.js` (CSV); print CSS at the end of `styles.css`. Small changes: `daily` rows also keep `howCounts` and `utteranceWords` (null on days saved earlier; Reports reads raw rows for those days), `db.getPage` takes an end key and `db.countRange` was added, ranged readers in `js/everyday.js`. Opens in about 0.3 s with 50,000 taps. Tested with Playwright at 1180x820 and 1024x768 (graphs and CSV recomputed independently from the seeded rows, filters, print/PDF layout, empty states, regression, offline); stable app files unchanged.
- **Voice picker (Beta 2.4, Oct 28):** adult menu > Voice lists the voices installed on the device (no recorded or bundled voices): English grouped by accent (United States, United Kingdom, Australia, Ireland, India, South Africa, Scotland, New Zealand, Other English), a last "Fun voices" group for Apple novelty voices (list `NOVELTY_NAMES` in `js/voicepicker.js`), and a collapsed "Show other languages". Badges: Premium / Enhanced / Standard (from "premium", "enhanced", "compact" in the voice name or voiceURI), Novelty, On this device, Needs internet. Preview per voice at the learner's pitch and sentence speed; selection saved per learner in the existing `voiceURI`; if the saved voice is not on this device a notice names the fallback and the saved choice is kept. Waits for late iOS voice lists (`voiceschanged` plus a 6 s retry). Collapsible "Get more voices" help (iOS or Android text by device, Siri caveat) and a one-line pointer on the setup screen (`js/devicetips.js`). New file `js/voicepicker.js`; no board change. Tested with Playwright (stubbed iOS-like and Android-like voice lists) at 1180x820 and 1024x768; stable app files unchanged.
- **Prompt ladders (Beta 2.3, Oct 28):** replaced the old levels 0-7 (their fade from a faint model to a full-strength glow/path ring increased salience). A ladder = ordered steps `{type, opacity}` (model, critter, ring, glow, path; 1-100%) from most to least help, then Independent; time delay is the wait before a prompt appears, not a step. Default ladder = Model 100/75/50/25% (per-target *Fading step size*: Standard 25%, Medium 10%, Fine 5%; changing it keeps the nearest opacity). *Custom* ladder per target (editor: add/remove/reorder/preview; glow and path exist only here and now honor opacity). Most-to-least starts at the target's step and climbs toward more help on error/no response; least-to-most climbs from the faintest step. Fading rule unchanged. Trials save `promptStep`, `startStep`, `help` (0-1, opacity-weighted) beside the old `promptLevel`; old targets migrate (7/6/5/4 -> Model 100/75/50/25%, 3 and 2 -> 25%, 1/0 -> Independent; logged as "ladder update"), old trials get a computed `help`. Backup file version 14. Code: `js/teaching.js` (rules), `js/ladderui.js` (screens), `js/modelprompt.js` (`sustainStep`). Tested with Playwright at 1180x820 and 1024x768, 45 and 84 boards; stable app files unchanged.
- **Everyday recording (Beta 2.2, Oct 28):** adult menu > Data: everyday use (README "Everyday recording (beta)"). On by default for every learner, per-learner On/Off and Pause, saved on the iPad only. IndexedDB stores `events` (each selected word: id, label, how reached, mode learner/model/session, session and trial ids), `utterances` (message-bar sentences ended by bar tap, Clear or 20 s idle), `daily` (per-day summary kept forever: learner taps, unique and new words, utterances, multi-word, longest, word counts, model and session taps) and `firstseen` (first learner use per word; makes "new word" survive pruning); database version 3. Raw rows kept 90 / **180** / 365 days or forever (pruned at app start). Check panel, "Clear this learner's everyday data" (optional second box for sessions and trials), backup "Include everyday use data" (backup file version 13; summaries rebuilt on restore). Speech is never delayed (record is queued, written after 1.5 s). Reports (Round C, built in beta 2.5) read `daily` first and the raw rows for detail; helper readers are in `js/everyday.js` (`listDaily`, `listEvents`, `listUtterances`, `newWordsSince`).
- Tested with Playwright at 1180x820 and 1024x768, 45 and 84 boards, including 50,000 seeded events; stable app files unchanged.

## Beta 3.0 (in test, not promoted): Phase 3 camera scenes

Adult menu > **Scenes** (README "Scenes (beta)"). An adult takes or chooses a photo; the app finds everyday objects in it **on the iPad** (TensorFlow.js + COCO-SSD, bundled, no internet);
the adult approves, renames, adds things by hand (drag a box, pick a board word or type a new one), ticks related words (`data/scene-related.json`), orders the buttons, names the scene, saves.
The scene's buttons show in the context strip (photo crop + label for things, board symbol + label for related words) in a fixed saved order, paged by a small arrow when more than fit.
A tap speaks, adds the chip, records everyday use (`how: "scene"` + scene id) and gently glows the word's permanent board spot (main-board cell, or the category button that leads to it); nothing navigates.
Scene switcher = 1-second hold on the scene name; session hides the strip, Model mode rings the strip button. Optional per-scene **photo button** opens a full-screen tappable photo
(`how: "photo scene"`). Scenes are per learner (IndexedDB store `scenes`, **database version 4**, upgrade from version 3 keeps all rows), in backups (**file version 15**, "Include scenes and photos").
- Recognition files (`beta/vendor/` 1.5 MB, `beta/models/coco-ssd/` 18 MB) are loaded only when a scene is made, are **not** in the install cache and live in the cache `beta-aac-models-v1`
  (never deleted by app updates; "Download object recognition for offline use (18 MB)" button). `tools/update-cache-list.py` skips them; `tools/promote-beta.sh` and `make-beta.sh` copy them and set the cache name (`aac-models-v1` in stable).
- Open decisions for Richard: root CREDITS.md is generated by `tools/make-credits.py` (updated with the TF.js / COCO-SSD section) and should be regenerated when this is promoted; recognition quality on real clinic photos is unproven (see tests).

## Beta 3.1 (in test, not promoted): scene-name words, "Teach VOICE your things", camera button

- **Scene-name vocabulary.** Naming (or renaming) a scene suggests board words that fit the place in a group "Words for <name>" (unchecked checkboxes): `data/scene-places.json` maps place keywords
  (park, playground, kitchen, snack, bath time, bedroom, school, bus, store, zoo, farm, pool, doctor, library, party...) to board word ids; several places merge. Detected things such as oven, dining table, refrigerator,
  toilet, sink or bed suggest the matching place even with no keyword in the name.
- **My things (Teach VOICE your things).** In the scene approval screen every thing has a "Remember this" box (on for things drawn by hand, off for detected ones). VOICE keeps the picture and a fingerprint of it
  per learner (IndexedDB store `things`, database version 5) and in later photos suggests "Remembered: <word>" with a box, pre-ticked, outranking the generic recognition label. Adult menu > Scenes > My things lists them
  (rename, Teach again, delete) and holds **Match strictness** (Low / Medium / High, per learner). Included in backups (file version 16). On-device only. **No new download:** the fingerprints come from the COCO-SSD MobileNet
  backbone already bundled (nodes `Conv_1/Relu6` 10x10x1280 and `expanded_conv_13/expand/Relu6` 19x19x576, read from the same model run that finds objects). See README "Scenes (beta)".
- **How well it works (honest):** on 7 real things in stereo photo pairs plus zoomed, small and dim versions (25 findable cases, 12 photos without the things) the default (Medium, 0.70) found 25/25 with 0 wrong suggestions; this set was also used to tune, so expect lower on real clinic photos. Thresholds Low 0.62 / Medium 0.70 / High 0.78. Not yet tried on real iPad photos of the learners' own things: do that in the pilot.
- **Camera button.** Top bar, right of ABC (Auto = stage 3 and up, Always, Never per learner). Hold 1 second until the ring fills, then lift: the camera opens, a compact sheet shows everything found pre-ticked, "Use now" makes a scene named
  "Scene <Mon D, h:mm AM/PM>" and shows it on the strip; "More options" opens the full editor. No passcode. Dimmed during a teaching session.
- **TODO (not built, decision C):** a broader 1,000-class recognizer (an ImageNet-style classifier so "toy", "swing", "slide" and more things are named automatically) could not be obtained offline from this environment
  (only the 80-class COCO-SSD graph is available; no new model can be downloaded here). Options when a network is available: bundle MobileNet-v2 ImageNet (about 14 MB) or an open-vocabulary CLIP-style model (much bigger); until then, My things
  and drawing a box by hand cover what COCO does not know.

## Next steps

1. **Done Oct 27:** VOICE 1.1 promoted to clients. Pilot iPads update after the app is fully closed and reopened; the home-screen label changes to "VOICE" only if the icon is removed and re-added (save a backup first).
2. **Send web addresses** for the About links whenever ready.
3. **Pilot gate:** about two weeks of daily use with clients on the stable app.
4. **Phase 2 — teaching and data:** Rounds A (targets, sessions, prompting, fading, mastery), B (everyday recording) and C (reports and export) promoted to clients as VOICE 2.0 on Oct 29 (upgrade from 1.1 verified: learners, boards and stage kept). Next: pilot use of reports and teaching sessions.
5. **Phase 3 — camera scenes:** built in Beta 3.0 (see above): needs testing with real photos before promoting.
6. **Website:** answer the open questions in the website plan, then build the pilot pages (Home, Get started, For clinicians, About, Privacy) at rwawrzonkowski-dotcom.github.io.
7. **Before public release:** trademark and domain check, privacy policy, App Store name (e.g. "VOICE AAC"; "Voice" is taken), app code license (MIT or GPL), move app and site to a custom domain using backup/restore.
8. **Phase 4 — native iPad app** for the App Store (needs a Mac with Xcode and the $99/year developer account).

## Open smaller items

- About 60 weak or self-drawn symbols to review (stand-ins like granola bar, ranch, kinship words); real photos will help most.
- Default photos for nouns: currently symbols, with adults adding real photos per learner.
- A 24-location grid is mentioned in the original rules but not built (only 45 and 84).
- Optional visual cue during the dial's half-second hold.
- Insect "fly" shares a label with the verb in Forms.
- Optional later: VOICE's own built-in offline voice (allows volume boost and the same voice on every device; adds 20–60 MB). Revisit if loudness complaints continue.
