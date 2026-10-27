# VOICE — Project Status and Reference

*Last updated: Oct 27, 2026. Read this first in any new session instead of re-reading old chats.*

**VOICE** = Variable Output for Individualized Communication and Expression. A free, iPad-first AAC (speech) app for nonvocal children new to AAC, built by **Richard Wawrzonkowski, M.S., LBA, BCBA**. Pilot with his clients now; public release later.

## Where things live

| What | Where |
|---|---|
| Stable app (clients use this) | https://rwawrzonkowski-dotcom.github.io/AAC-App/ — label "Stable 1.0" (still named "AAC Board" until the next promote) |
| Beta app (testing only) | https://rwawrzonkowski-dotcom.github.io/AAC-App/beta/ — label "VOICE Beta 1.3" |
| Code | GitHub repo `rwawrzonkowski-dotcom/AAC-App` (branch `main`); restore point branch `stable-1.0` |
| Planning doc (source of truth for decisions) | https://claude.ai/code/artifact/133274d9-e0f2-4009-8086-6f527aebe3af |
| Website plan | https://claude.ai/code/artifact/35106cdc-bca5-4b24-8e2f-c5c6a34d44d0 |
| This status file | Project doc `claude/VOICE-status.md` and repo `docs/VOICE-STATUS.md` |

## How we work

- **Opus plans and reviews; Sonnet builds.** Nothing is built until Richard says "approved."
- **New features go to the beta first.** Root folder = stable; `beta/` = full copy with its own storage (`beta-` prefix), passcode and offline cache. Only `beta/` and `tools/` change during feature work.
- **"Promote"** → `tools/promote-beta.sh "VOICE 1.1"` copies beta to stable (sets VOICE names, new icon, About data). **"Roll back to stable"** → restore branch `stable-1.0`.
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

**Beta only (waiting to be promoted)**
- Press-and-hold word-forms dial: tap or slide; fixed spots (past up, -ing right, -s down, participle left); markers can be turned off; on from stage 3.
- VOICE name, new icon (indigo speech bubble with "V" and five colored dots), About VOICE screen with Richard's name and five blank link spots (Website, Resources, Trainings, Reserve a training, Contact).
- iPhone safe areas: equal side margins keep buttons clear of the camera cutout and home bar; the board stays centered so nothing moves when the phone is turned. iPads unchanged.
- "Test the volume" button (setup screen and adult menu Voice section) with iOS or Android/Samsung tips; every utterance plays at full volume.
- Phones: setup screen and Board size panel recommend the 45 board.

## Next steps

1. **Test the beta on an iPad** (dial, name, icon, About). Then say "promote" → becomes VOICE 1.1 for clients.
2. **Send web addresses** for the About links whenever ready.
3. **Pilot gate:** about two weeks of daily use with clients on the stable app.
4. **Phase 2 — teaching and data:** opt-in teaching sessions, prompt hierarchy with automatic fading (including critter and ring opacity), mastery suggestions for stages, data reports and export.
5. **Phase 3 — camera scenes:** photograph a setting, approve suggested words, show them in the context strip (the strip is reserved but unused).
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
