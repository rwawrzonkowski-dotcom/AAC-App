# VOICE: context handoff for a related project

*Written Nov 3, 2026. Add this file to another Claude project so it knows what VOICE is, the decisions behind it, and where it stands.*
*For reusing VOICE's code, see the companion file `VOICE-handoff-core.md`.*

## 1. What VOICE is

**VOICE** (Variable Output for Individualized Communication and Expression) is a free, iPad-first AAC (speech-generating) app.
- **Users:** nonvocal children who are new to AAC and often have strong special interests.
- **Creator:** Richard Wawrzonkowski, M.S., LBA, BCBA (behavior analyst).
- **Goal:** pilot with Richard's own clients now, then a free public release.
- **Comparable apps:** TouchChat, LAMP Words for Life, Proloquo2Go, TD Snap, Speak for Yourself, CoughDrop, and Cboard (free and open source).
- **What sets it apart:**
  - It's free.
  - It's private: everything stays on the device, with no accounts, ads or tracking.
  - It's built by a behavior analyst. Prompting, prompt fading and data collection are built in, not added later.
  - It supports photo "scenes" made from the child's real surroundings.

## 2. Fixed design rules (do not break these)

1. **Motor planning first.** A word never changes location once placed. Hidden words are gray tiles in their permanent spots.
2. **The grid is chosen at setup.** It's 45 (9×5) or 84 (12×7) locations, landscape. A 24 grid is planned but not built. Vocabulary grows by *revealing* words in stages 1–4, never by rearranging.
3. **Photos and symbols.** Realistic photos for objects; simple symbols only where a photo can't show the word.
4. **Photo scenes.** An adult photographs a setting, the app suggests words, the adult approves them, and they appear in a separate context strip. Core words never move.
5. **Shaping.** Built-in prompt hierarchy with automatic fading. Teaching sessions are opt-in, and adults deliver reinforcement (the app never plays rewards).
6. **Privacy.** Child photos and data stay on the device. No accounts, ads or tracking. Backups are files the adult saves.
7. **Open sources only.** Universal Core vocabulary (CC BY 4.0), Mulberry Symbols and OpenMoji (CC BY-SA 4.0), plus symbols drawn for the project. Never LAMP or PCS material.

## 3. How the work runs

- **Roles:** Claude Opus plans and reviews; Claude Sonnet writes code. **Nothing is built until Richard says "approved."** Claude should ask questions and teach options he hasn't considered.
- **Stable and beta copies:**
  - Stable (clients use it): https://rwawrzonkowski-dotcom.github.io/AAC-App/
  - Beta (testing): https://rwawrzonkowski-dotcom.github.io/AAC-App/beta/
  - New work goes to beta first. "Promote" copies beta to stable.
- **Code:** GitHub `rwawrzonkowski-dotcom/AAC-App`. Plain HTML/CSS/JavaScript with no build step, works offline, hosted on GitHub Pages.
- **Status file:** the claude.ai Project doc `claude/VOICE-status.md` (repo copy `docs/VOICE-STATUS.md`). It's read at the start of every session.
- **Planning doc (source of truth):** https://claude.ai/code/artifact/133274d9-e0f2-4009-8086-6f527aebe3af
- **Website plan:** https://claude.ai/code/artifact/35106cdc-bca5-4b24-8e2f-c5c6a34d44d0
- **Roadmap:** web app for phases 1–3; native iPad app on the App Store last (phase 4, needs a Mac and a $99/year developer account).

## 4. Where it stands (Nov 3, 2026)

| Version | Status | Contents |
|---|---|---|
| VOICE 1.1 | promoted Oct 27 | Board, speech, folders, word-forms dial, adult menu, backups |
| **VOICE 2.0** | **stable, with clients** | Phase 2: teaching sessions, prompt ladders and fading, teaching instructions, everyday recording, reports and CSV export |
| **Beta 3.6** | in test | Phase 3: camera scenes, "My things", camera button, data protection, faster updates, adult-menu hints, clearer scene tags |

### Built features
- **Board:** 45/84 grids with about 1,000 words. Stage 1 starts with help, stop, eat, drink, bathroom and more. 66 folders, up to 4 taps deep. The Words menu holds all 318 Dolch words within 3 taps. Top bar has Words, Forms, ABC keyboard, number pad, Delete and Clear. Press-and-hold word-forms dial (go → went, going, goes). Word-only reading stage.
- **Speech:** the device's own voices, with child/adult choice, pitch, speed and pauses between words.
- **Adults:**
  - adult menu (3-second hold on the gear circle plus a 4-digit passcode);
  - several learners per iPad;
  - edit mode;
  - Model mode (ring and animal "critter" prompts with opacity fading);
  - touch supports;
  - backups.
- **Teaching (Phase 2):**
  - **Targets** per learner, with Baseline, Teaching, Mastered and Maintenance status.
  - **Sessions** record Who (parent, RBT, teacher, BCBA) and Where (home, clinic, school, community).
  - **Prompt ladders:** the default is Model 100/75/50/25% then Independent; step sizes are Standard, Medium (10%) and Fine (5%); custom ladders can add glow and path prompts.
  - **Fading rules:** fade after 3 correct in a row, back up after 2 misses.
  - **Mastery** is suggested only, never automatic: 80% independent across 3 sessions with 2 different people or settings.
  - **Teaching instructions:** 10 templates, each with Clinical and Parent wording.
- **Data:** everyday word use is recorded on the device. Reports give per-target graphs, vocabulary growth, message length, printable clinical and parent summaries, and CSV export.
- **Scenes (Phase 3, beta):**
  - Objects are recognized on the device (COCO-SSD, 80 everyday classes, no internet).
  - "Teach VOICE your things" remembers a child's own objects by photo.
  - Naming a scene suggests words that fit the place.
  - Scene buttons appear in the context strip, and the word's permanent board spot glows.
  - The camera button needs a hold, then a tap (an iPad Safari requirement).
- **Data safety:** VOICE asks the browser to keep its data. On iPad it prompts adults to add VOICE to the Home Screen, because Safari can erase website data after about 7 days without use.

## 5. Decisions already made (and why)

- **Web first, native last.** It's faster to iterate during the pilot; App Store distribution comes later.
- **Stable and beta copies on one site,** with separate storage, so clients are never hit by untested changes.
- **No recorded or bundled voices** (too much storage). The device's installed voices are used, including Apple's novelty voices.
- **Mastery is a suggestion; the adult decides.** Reinforcement comes from adults, not the app.
- **Prompt fading lowers a prompt's visibility (opacity) step by step,** not prompt type alone. Glow and path prompts exist only inside custom ladders.
- **A broader object recognizer (1,000 classes) is deferred to the native app** (Apple Vision). For now, "My things" and drawing a box by hand fill the gaps.
- **Branches are used as restore points** (`stable-1.0`, `stable-1.1`, `stable-2.0`), because tag pushes are blocked.

## 6. Open questions and live discussions

- **Little words (brainstorm, Nov 3, not decided).** Words like *am, and, an, the, is, to* take 3 taps today (Words menu › Little words or More little words), so they can't be added fluently. The main board has no free spots on either grid. Options discussed:
  1. A fixed little-word row in the context strip when no scene is showing (about 8 permanent slots, e.g. a, the, and, is, am, are, to, of).
  2. Press-and-hold chunks through the word-forms dial: "I" → "I am"; noun → "a cookie" / "the cookie"; "go" → "to go".
  3. A per-learner option to stay on the Little words page until "Back".
  4. Next-word suggestions. Fast, but positions change, so there's no motor plan. Opt-in for literate users only.
  5. Fill-in grammar when speaking. Clinically touchy because the device would speak words the child didn't choose. Off by default, if offered at all.
  - Recommended: 1 and 2, plus 3. Still waiting on Richard's answers: who mostly taps these words (child or adult modeling), whether the strip is usually free, which 8 words to use, and whether option 5 is ruled out.
- **Competition questions raised (Oct 30):**
  - moving to an insurance-funded device later (with a different motor plan);
  - a Speak for Yourself–style "explore" mode;
  - home and school iPads (merging data without the cloud);
  - teaching adults to set up Guided Access;
  - keyguards and switch access;
  - Spanish and bilingual families;
  - BACB conflict-of-interest planning for piloting your own app with your own clients;
  - how to keep it free over time, and the license choice.
- **Before public release:** trademark and domain check, privacy policy, App Store name (e.g. "VOICE AAC"; "Voice" is taken), code license (MIT or GPL), custom domain.
- **Smaller items:** about 60 weak symbols to review; the 24 grid isn't built; the About screen links (Website, Resources, Trainings, Reserve a training, Contact) are still blank.

## 7. Pilot reminders

- Add VOICE to the Home Screen on every client iPad and always open it from that icon. The icon has its own storage, separate from Safari's, so move learners over with a backup and restore.
- After an update, fully close and reopen the app to get the new version.
- Save backups regularly (adult menu › Backup › Save backup of all learners).

## 8. Words used in this project

| Term | Meaning |
|---|---|
| Motor planning | Each word keeps one permanent spot, so the child learns its location like typing |
| Stage | How much of the vocabulary is revealed (1–4) |
| Context strip | The row under the message bar: page titles, scene buttons, session controls, camera |
| Scene | A photo of a setting plus the approved words for it, shown in the strip |
| Model mode | An adult taps words while a ring or critter prompt shows where they are |
| Prompt ladder | Ordered prompt steps from most help to Independent |
| Target | A word being taught in sessions, with its own prompt and mastery settings |
| Everyday use | Free (non-session) tapping, recorded for reports |

## 9. How a related project might connect (fill in)

- **The related project:** _(name and purpose)_
- **Shared users or learners?** _(same children and families? same clinicians?)_
- **Shared data?** If yes, agree on one file format. VOICE backups are versioned JSON files (currently around version 16).
- **Shared rules?** Privacy (data on the device), open sources, and adults delivering reinforcement probably carry over.
- **Shared code?** See `VOICE-handoff-core.md`. The teaching engine (prompt ladders, fading, mastery) and the reports are the most reusable parts.
