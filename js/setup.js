// Quick setup screen: a large, simple, adult-facing full-screen card (not part of the board).
// Shown on the very first open on a device (no learners yet) and when an adult taps
// "Add learner" in the adult menu. Three big choices:
//   Full board, 84 buttons   -> gridSize 84, stage 5 (every word; stage 5 since Beta 3.26)
//   Full board, 45 buttons   -> gridSize 45, stage 5
//   New AAC learner          -> gridSize 45, stage 1 (6 words; reveal more as the learner grows)
//   Big buttons, 24          -> gridSize 24, stage 1 (Beta 3.25: its own large-button board for early learners; 6 words)
// Words and keyboard buttons stay on Auto (so they show from stage 3).
// On the first open there is also a "Restore from a backup file" link (uses the existing restore flow).
import { h } from "./ui.js";
import { restoreFromFile } from "./backup.js";
import { listProfiles, CHILD_VOICE } from "./profiles.js";
import { volumeTestBlock, looksLikePhone, PHONE_BOARD_TIP, moreVoicesLine } from "./devicetips.js";
import { VERSION_LABEL } from "./channel.js";
import { getView, setView } from "./settingsnav.js";

export const SETUP_CHOICES = [
  { id: "full84", title: "Full board — 84 buttons", gridSize: 84, stage: 5,
    text: "Every word is shown on the larger board. Good for testing or an experienced user." },
  { id: "full45", title: "Full board — 45 buttons", gridSize: 45, stage: 5,
    text: "Every word is shown on the standard board." },
  { id: "new", title: "New AAC learner", gridSize: 45, stage: 1,
    text: "Starts with 6 words. Reveal more as the learner grows." },
  { id: "big24", title: "Big buttons — 24", gridSize: 24, stage: 1,
    text: "Large buttons for early skills: requests, breaks, finished, yes / no, and telling you something hurts. Starts with 6 words." },
];

// Show the setup card. `first` = true on a brand-new device (adds the Restore link, no Cancel).
// Resolves to { name, gridSize, stage }, or { restored: true } after a backup was restored,
// or null if an adult cancelled (only possible when `first` is false).
export function showSetup({ first = false } = {}) {
  return new Promise((resolve) => {
    const defaultName = "Learner " + (listProfiles().length + 1);
    const nameIn = h("input", { type: "text", class: "text-input", id: "setup-name", maxlength: 40,
      value: defaultName, "aria-label": "Learner name", autocomplete: "off" });

    const done = (v) => { screen.remove(); resolve(v); };
    const choose = (c) => done({ name: nameIn.value.trim() || defaultName, gridSize: c.gridSize, stage: c.stage });

    // On a phone, the 45-button choice is marked "Recommended for phones" (choices and defaults are unchanged).
    const phone = looksLikePhone();
    const choices = SETUP_CHOICES.map((c) =>
      h("button", { type: "button", class: "setup-choice" + (c.id === "new" || c.id === "big24" ? " new" : ""), id: "setup-" + c.id,
        "data-grid": c.gridSize, "data-stage": c.stage, onclick: () => choose(c) },
        h("span", { class: "setup-choice-title", text: c.title }),
        h("span", { class: "setup-choice-text", text: c.text }),
        phone && c.id === "full45" ? h("span", { class: "setup-badge", id: "setup-recommended", text: "Recommended for phones" }) : null));

    // Restore link (first open only). A label for a hidden file input, like the adult menu's Backup section.
    const fileIn = first ? h("input", { type: "file", accept: ".json,application/json", id: "setup-restore-file", class: "file-hidden",
      onchange: async (e) => {
        const f = e.target.files[0];
        e.target.value = "";
        if (!f) return;
        screen.hidden = true;                       // let the restore dialogs show on their own
        await restoreFromFile(f);
        if (listProfiles().length) return done({ restored: true });
        screen.hidden = false;                      // cancelled or failed: back to the choices
      } }) : null;

    // First setup only (Beta 3.9): who will mostly use the adult menu on this iPad. It decides which settings the menu shows
    // (js/settingsnav.js); it can be switched any time in the menu's top bar. Saved as soon as it is tapped.
    const viewRow = first ? h("div", { class: "seg-row setup-view-row" }) : null;
    const paintView = () => viewRow.replaceChildren(...[["parent", "Parent or caregiver"], ["clinician", "Clinician or teacher"]].map(([v, text]) =>
      h("button", { type: "button", class: "seg" + (getView() === v ? " on" : ""), id: "setup-view-" + v, text,
        onclick: () => { setView(v); paintView(); } })));
    if (first) paintView();

    const screen = h("div", { class: "setup-screen", id: "setup-screen", role: "dialog", "aria-label": "Set up VOICE" },
      h("div", { class: "setup-card" },
        h("h1", { text: "Set up VOICE" }),
        h("div", { class: "setup-name-row" },
          h("label", { for: "setup-name", text: first ? "Learner name (optional)" : "Learner name" }), nameIn),
        first ? h("div", { class: "setup-view", id: "setup-view" },
          h("span", { class: "setup-view-label", text: "Adult menu for:" }), viewRow,
          h("small", { class: "muted", text: "Parent shows the everyday settings; Clinician adds teaching sessions and data. You can switch any time." })) : null,
        phone ? h("p", { class: "setup-phone-tip", id: "setup-phone-tip", text: PHONE_BOARD_TIP }) : null,
        h("div", { class: "setup-choices" }, choices),
        // Volume check with the default child voice (no learner exists yet on a new device)
        volumeTestBlock({ voice: CHILD_VOICE, tipsOnTap: true, extraClass: "setup-volume" }),
        moreVoicesLine(),
        h("p", { class: "muted setup-note", text: "You can change this anytime in the adult menu." }),
        h("div", { class: "setup-foot" },
          first ? h("label", { class: "link-btn", for: "setup-restore-file", id: "setup-restore", text: "Restore from a backup file" }) : null,
          first ? null : h("button", { type: "button", class: "btn", id: "setup-cancel", text: "Cancel", onclick: () => done(null) })),
        h("p", { class: "version-label setup-version", id: "setup-version", text: VERSION_LABEL }),
        fileIn));
    document.body.appendChild(screen);
  });
}
