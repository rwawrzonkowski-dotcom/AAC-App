# VOICE Website — Handoff

*Written Nov 11, 2026, from the VOICE app project. Add this to the "VOICE Website" project and read it at the start of each session there, together with the website status doc once one exists.*

## What this project is

The public website for **VOICE** (Variable Output for Individualized Communication and Expression). VOICE is a free, iPad-first AAC speech app for nonvocal children new to AAC. It is built by **Richard Wawrzonkowski, M.S., LBA, BCBA**, is being piloted with his clients now, and will have a public release later.

**The one message for every visitor:** VOICE is a free, research-informed AAC app built by a behavior analyst. It is private by design and grows with the learner.

## How we work here

- Plan first. Nothing is built until Richard approves it.
- Ask questions, and point out options Richard hasn't considered.
- **Never change the app from this project.** The app has its own project and repository.
- Keep a status doc and update it after each milestone.

## Key links

| What | Where |
|---|---|
| Website plan (pages, audiences, look, hosting, launch checklist) | "VOICE Website Plan": https://claude.ai/artifact/7Z3uiNn1zhikg4rAroqzvB |
| Approved visual direction (website artboard) | "VOICE style mockups" canvas: https://claude.ai/artifact/GrohBofPwBiz27ThAHrfJ5 |
| App planning doc | "Portable AAC App — Planning Doc": https://claude.ai/artifact/3NVVeKFmhMpPofYq5kqFee |
| Stable app (clients use this) | https://rwawrzonkowski-dotcom.github.io/AAC-App/ (VOICE 3.2) |
| Beta app (testing only) | https://rwawrzonkowski-dotcom.github.io/AAC-App/beta/ (VOICE Beta 3.28) |
| Where the site will live | A new GitHub repository, `rwawrzonkowski-dotcom.github.io`, published free on GitHub Pages and kept separate from the app |

## Decisions already made

**Hosting**
- During the pilot, the site is free on GitHub Pages and the app keeps its current address.
- At public release, both move to one custom domain (for example voiceaac.org, with the app at /app or app.).
- Families will move their learners to the new address with backup and restore. The Get started page will walk them through it.

**Pages**
- Nine pages are planned.
- Five are enough for the pilot: **Home, Get started, For clinicians, Privacy, About.**
- The rest come later: Features, Resources, Videos and guides, Contact.

**Approved look** (from the style mockups, Nov 10)
- **Hero:** a "touch the board" hero. Tiles light up under a finger and fade; tapping one speaks it, and there are five board looks to try.
- **Main button:** a glowing orb button, "Open VOICE".
- **Headline:** it unscrambles as the page loads.
- **Colors:** the board's soft Fitzgerald Key colors on white, plus one deep accent color.
- **Type and layout:** a large, rounded, readable font, working on phone, tablet and computer.

**Easter eggs**
- On Home, five faint hidden VOICE buttons; finding them builds the sentence "I want to go play."
- A "hello" logo.
- More Easter eggs go on the other pages as they are built. They should be playful but never get in the way of a parent who is just trying to install the app.

**Name and links**
- Name as shown: **Richard Wawrzonkowski, M.S., LBA, BCBA**.
- The app's About screen has five link spots that the site should eventually fill: **Website, Resources, Trainings, Reserve a training, Contact.**

**Branding**
- The VOICE icon is an indigo speech bubble with a "V" and five colored dots.
- At public release, the App Store name will need to be something like "VOICE AAC", because the name "Voice" alone is taken.

## Site rules (match the app's values)

- **Tracking:** no ads, no tracking, no cookies. If visitor counts are wanted, use a privacy-friendly counter with no cookies.
- **Language:**
  - Parent pages use plain language and short sentences.
  - Clinical detail lives on the For clinicians page.
- **Images:**
  - Use real screenshots of the board and Richard's own photos.
  - Show no child's photo or video without the family's written consent.
- **Accessibility:** readable contrast, captions on every video, alt text on images, keyboard navigation and screen-reader labels.
- **Not medical advice:** VOICE supports, but doesn't replace, an individualized AAC assessment by an SLP or team.

## What VOICE does today (for the Features and For clinicians pages)

**Core design**
- **Motor planning first:** a word never moves once placed. Vocabulary grows by revealing hidden words in their permanent spots.
- **Grid sizes:** three per learner.
  - **24** (6×4, large buttons) is for early learners working on the Essential 8 skills, with stages 1–3; afterwards VOICE suggests moving up to the 45.
  - **45** and **84** have stages 1–5.
- **Vocabulary:**
  - Stage 1 starts with 6 words (help, stop, eat, drink, bathroom, more).
  - The core vocabulary comes from Universal Core.
  - About 1,200 words in total.
  - All 318 Dolch sight words are within 3 taps.
- **Stage 5:** 14 folders, including Where words, Thinking words, Joining words, School talk, Games and screens, extra reading words, and three "My interests" folders that adults fill.
- **Same word in more than one place:** a word can appear wherever a child or adult would look for it (TouchChat-style), without moving anything already placed.
- **Pictures:** realistic photos for objects, and simple symbols where a photo can't show the word (Mulberry Symbols, OpenMoji). Adults can take their own photos.

**Speaking and typing**
- **Speech:** instant, with separate word and sentence speeds, an optional pause between words, and child or adult voices.
- **Grammar:**
  - The Forms button changes the last word (go → went).
  - Pressing and holding a word opens a dial of its forms.
  - The little-word strip shows 8 words, each of which opens more.
- **Keyboard and number pad:**
  - The keyboard can say letter names or letter sounds as keys are tapped.
  - Optional word guesses appear in three fixed boxes above the keys.
  - The number pad says numbers aloud ("24" → "twenty-four").
- **Reading stage:** words only, with the pictures hidden.

**Teaching (ABA)**
- **Teaching sessions** are opt-in and run on a built-in prompt hierarchy with automatic fading.
- **Model mode** shows a ring and an animal "critter" whose opacity fades. Adults deliver the reinforcement.
- **Targets** can be single words or sentences, with backward and forward chaining and errorless sentence trials.
- **Readiness rules** for moving to the next stage are suggested at the end of a session, and clinicians can adjust the numbers.
- **Everyday recording and reports:**
  - a heat map of where on the board the child taps;
  - new words;
  - multi-word messages;
  - a paper-style parent summary;
  - export.

**Camera scenes**
- An adult photographs a setting, VOICE suggests words, and the adult approves them.
- The approved words appear in a separate strip, so the core words never move.

**Accessibility**
- **Themes:** High contrast, CVI, Colour-blind safe and Dim.
- **Fonts:** Atkinson Hyperlegible, Lexend and OpenDyslexic.
- **Display:** large labels and wider gaps.
- **Touch:** select on lift-off, larger touch zones, keyguard mode, dwell and hold-to-select.
- **Switch scanning.**
- **For the listener:** a "Show" screen that flips the message to face them.

**Adults**
- Several learners can share one iPad.
- Adult tools sit behind a 3-second hold and a passcode.
- Adults can edit the board.
- Backup and restore saves a learner as one file in the Files app.

## Privacy facts (for the Privacy page)

- No accounts, no ads, no tracking.
- Child photos and all data stay on the iPad. Nothing is sent anywhere.
- A backup is a file the adult saves and controls.
- The app works offline once it's installed.

## Credits and licenses (for the Credits page)

- Universal Core vocabulary (Project Core): CC BY 4.0
- Mulberry Symbols: CC BY-SA 4.0
- OpenMoji: CC BY-SA 4.0
- Fonts: Atkinson Hyperlegible, Lexend, OpenDyslexic (SIL Open Font License)
- The app's own code license is still open (MIT or GPL). Decide it before public release.

## Still open (answer before building)

1. Is the site only about VOICE, or a home for all of Richard's work with VOICE as one section?
2. A way to support the project (donations or sponsorship), or purely free?
3. A sign-up for update notes, or just a changelog page?
4. Any more colors, logo ideas, or sites Richard likes the look of?
5. The web addresses for the five About links (Website, Resources, Trainings, Reserve a training, Contact).

## Next steps

1. Answer the open questions above.
2. Make a visual mock-up of the Home page from the approved direction, and get Richard's approval.
3. Create the `rwawrzonkowski-dotcom.github.io` repository and build the 5 pilot pages.
4. Fill the app's About links with the site's addresses. This is a small change made in the app project.
5. Before public release:
   - trademark and domain check;
   - Privacy, Credits and Not-medical-advice pages;
   - a custom domain;
   - the move from the old address, with a "VOICE has moved" notice.
