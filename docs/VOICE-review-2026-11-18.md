# V.O.I.C.E. audit and status: Nov 18, 2026

*Reviewed: V.O.I.C.E. 3.5 (stable) and Beta 3.46 (same code). A read-only audit: nothing in the app was changed. Every suggestion below needs Richard's approval before it is built.*

## Where things stand

| | |
|---|---|
| **Clients use** | V.O.I.C.E. 3.5 (promoted Nov 18). Restore points: 3.2, 3.3, 3.4. |
| **Since the last review (Nov 10)** | 51 commits, Beta 3.17 to 3.46, four promotions (3.2 to 3.5). Every decision from the Nov 10 review is built. |
| **Vocabulary** | 1,610 placed words on 125 pages; 1,491 pictures (Mulberry 908, OpenMoji 432, drawn for V.O.I.C.E. 151); about 410 plural forms. All 318 Dolch words within 3 taps. |
| **Website** | Live at rwawrzonkowski-dotcom.github.io/voice/, linked from About (Website, privacy page). |
| **Name** | V.O.I.C.E. (read aloud as "voice"); copyright and licenses settled (all rights reserved; credits page in the app). |

## How this was checked

- **Automated tests:** 25 browser test files, 495 checks. 492 pass. The 3 failures are out-of-date tests, not app bugs: the version number (t342), and the listener-view check (t318) that has been out of date since Beta 3.18.
- **Motor planning:** every word, folder and Back button on the 24, 45 and 84 boards in 3.5 was compared with VOICE 3.2: 4,153 positions, **0 moved**.
- **Privacy:** the app's code makes no calls to outside servers. The only web addresses it opens are the About links and the credits page links, and only when an adult taps them.
- **Saved data:** V.O.I.C.E. asks the browser to keep its data, and warns adults when it is open in a Safari tab instead of from the Home Screen (where Safari can erase data after about 7 days without use).
- **Upgrades:** 3.2 to 3.3, 3.3 to 3.4 and 3.4 to 3.5 were each tested with the same learner: name, stage, renamed words, the adult's own words and usage data all came through.
- **Size:** about 34 MB in all. The camera's object finder (about 20 MB) downloads only when Camera scenes is first used.
- Last Lighthouse run (Nov 16): performance 94, accessibility 94, best practices 100, SEO 100.

**Not checked:** a real iPad. Everything since VOICE 3.2 has been tested only in a test browser: critters and costumes, the turn screen, the hold dial for plurals, the place rows, letter + key word, word guesses, and how fast folders open on your oldest pilot iPad.

## Findings, most important first

### 1. The photo rule is not met (a fixed design rule)

The project rules and the planning doc say objects use **realistic photos**. Today **no button uses a photo**: the 671 nouns all show symbols, and about 30 nouns have no picture at all (oven, desk, cart, sand, monkey bars...). Adults can add their own photos per learner, which is the best fit for a child's real cup or dog, but nothing ships with photos.

Options:
- **A. Starter photo pack.** Real photos for the most-used nouns (about 150: food, drinks, toys, body, clothes), from public-domain and CC0 sources (Openverse), shown by default. The symbol stays one switch away. Licensing is clean, but photo quality and consistency vary, and finding them is slow, careful work.
- **B. Your own photo shoot.** You (or a helper) photograph the 150 items on a plain background. The look is consistent, you own them outright, and they fit "© Richard Wawrzonkowski".
- **C. Change the rule.** Keep symbols by default, and make "add a photo" easier (for example, taking photos for many buttons in one pass). Then update the planning doc so the rule matches the app.
- A per-learner switch ("photos first" or "symbols first") works with A or B. Some learners, especially those with CVI or early on, do much better with one or the other.

### 2. The automated tests are not saved anywhere permanent

The 25 test files (about 500 checks) live only in this work session's temporary folder. If the session's workspace is reset, they are gone, and every future change loses its safety net.
- **Suggested fix:** save them in the repository (a `tests/` folder, which the app never loads) and fix the 3 out-of-date checks. This is a small change with no effect on the app.

### 3. Nothing since VOICE 3.2 has been tried on a real iPad

Things a test browser can't judge:
- the hold dial's timing under a child's finger;
- whether the critters read clearly at arm's length;
- turn-screen behavior when the iPad rotates;
- how loud and clear "bee, ball" sounds;
- folder speed on the oldest pilot iPad.

- **Suggested:** a 20-minute checklist on one pilot iPad (I can write it), and notes back from one or two families.

### 4. The docs have drifted from the app

- **Status doc:**
  - The beta row still says "VOICE Beta 3.23".
  - "Next steps" still lists finished items (promote 1.1, promote 3.0).
  - The header line has grown into a paragraph.
- **Planning doc ("the source of truth"):**
  - Its open questions still ask whether the app should have a name (decided: V.O.I.C.E.) and MIT or GPL (decided: all rights reserved).
  - It still says nouns use Openverse photos (see finding 1).
- **Suggested:** tidy both, with the planning doc changes shown as suggestions for you to accept.

### 5. Small items

- `app.js` is 1,329 lines, the main tangle for the native app (noted Nov 10). There's no urgency.
- About 84 content words have no picture (finding 1), plus 137 little words that are words-only by design.
- Old saved teaching targets keep old label text (for example "carrots") in lists.
- Letter sounds are still the "letter + key word" stand-in until 26 sounds are recorded.

## Decisions still open (collected from all docs)

| Area | Open item |
|---|---|
| Pictures | Finding 1: photo pack, photo shoot or rule change |
| Premium | Data recorded while locked; price; free-tier learner limit; VOICE Pro district features |
| Legal | Attorney check of LICENSE and the paid tiers before the App Store; trademark and domain |
| Vocabulary | Your review of the stage 5 word lists and the 24-board folders |
| Keyboard | Recorded letter sounds (you or an SLP, 26 clips) |
| Camera | Camera strip rework (open since Phase 3) |
| Website | Resources, Trainings, Reserve a training and Contact links (waiting on pages) |
| Native app | Wrap the web app or rebuild; needs a Mac and the $99/year developer account |
| Planning doc questions never answered | Spanish or other languages; which iPad models clients use; who edits boards (BCBA, SLP, parents); default prompting style for new learners; he/she on the People page or the main grid |

## Questions to sharpen the core idea

1. **Who is the first user you picture?** A parent at home with no training, an RBT in a session, or you? When their needs conflict (simple vs. powerful), whose wins?
2. **What does success look like at 3 months of the pilot?** For example: more spontaneous requests, longer messages, fewer challenging behaviors, or families using it outside sessions? This decides which data matters most.
3. **How do your clients' special interests show up today?** Do they want to *talk about* the interest (commenting, scripting) or *get* it (requesting)? That changes whether interest support belongs in vocabulary, motivation or both.
4. **Where do pilot families get stuck now?** Setup, modeling, charging, the child exiting the app, the iPad being used for videos instead?
5. **Do clients move between home, clinic and school with one iPad, or several?** Several iPads would make "the same board everywhere" a real problem to solve.
6. **Spanish (or another language) in the pilot?** Many AAC families need it, and it is far easier to plan for now than to retrofit.

## New ideas to consider (none built; for discussion)

**Behavior-analytic tools**
- **Functional communication training (FCT) mode.** Pick a replacement request (break, help, all done). V.O.I.C.E. makes it extra easy to reach, records each use, and supports thinning: after the request, the adult taps a "wait" timer and the learner sees a countdown before the break. The timer lengthens over time on a schedule you set. This pairs naturally with the existing prompting, and few AAC apps have it.
- **Delay and denial tolerance.** A "not now / first-then" response the adult can show on the message bar ("first work, then iPad") with a timer, without leaving the board.
- **Token board.** An adult-run token strip above the board (5 tokens, then the chosen reinforcer), recorded with the session. Adults still deliver the reinforcer.

**Special interests**
- **Interest starter packs.** Ready word sets an adult can load into a blank My interests folder: trains, dinosaurs, space, animals, cars, weather, cooking and generic video games. These would be words only, with no brand names or logos. They'd use open symbols, and the adult adds photos.
- **Interest as motivation.** Let the learner's interest theme the critter, the turn screen or a celebration after a new word. The motivating thing then appears on the device itself.
- **Comment scripts.** Short commenting lines for the interest ("look, a train!", "my favorite"), placed in the folder as phrases, to shift from requesting toward sharing.

**Everyday life**
- **Visual schedules and first-then boards** on their own screen, built from the same pictures, since many families use paper versions now.
- **Family voices.** A parent records a few personal words (a sibling's name, "grandma") on the iPad, with nothing uploaded. This is different from the shelved voice cloning.
- **Moving a learner between iPads without accounts.** Send a backup by AirDrop or as a QR code, so home and school iPads can share the same learner privately.
- **Staying in V.O.I.C.E.** A short in-app guide to the iPad's Guided Access (keeps the child in the app), shown to adults.

**Pilot learning**
- **Pilot check-in sheet.** A one-page parent and clinician form each month (what worked, what didn't, words requested), stored with your client records rather than in the app.

## Richard's answers (Nov 18)

- **Photos:** change the rule. Symbols by default, and an easier way to add pictures, including sending items found in a camera scene to their buttons.
- **First user:** a parent or a school paraprofessional.
- **FCT mode:** start planning it in beta.
- **Interest starter packs:** a priority.
- Plans recorded in the planning doc under "Plans from the Nov 18 audit".
