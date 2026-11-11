// Adult menu > Board > Accessibility (Beta 3.18): presets and every option of js/access.js, for the learner on screen.
// Each change is saved at once and the board behind the menu redraws (onChanged), so the adult can see it after closing the menu.
import { h } from "./ui.js";
import { getCurrent, saveProfile } from "./profiles.js";
import { PRESETS, applyPreset, cleanAccess, DEFAULT_ACCESS } from "./access.js";

const OPTIONS = [
  { key: "theme", title: "Colours (theme)", choices: [["standard", "Standard"], ["dark", "High contrast"], ["cvi", "CVI"], ["cbsafe", "Colour-blind safe"], ["dim", "Dim"]],
    help: "High contrast: black background, the word type shows as a thick coloured edge, pictures on white. CVI: black with one bright colour (yellow). Colour-blind safe: white buttons with a coloured patch behind the picture. Dim: soft dark colours with less glare (evenings, light sensitivity)." },
  { key: "font", title: "Letters (font)", choices: [["system", "VOICE standard"], ["atkinson", "Atkinson Hyperlegible"], ["lexend", "Lexend"]],
    help: "Atkinson Hyperlegible was made for readers with low vision; Lexend is designed to be easy to read. Both are free and work offline." },
  { key: "labelSize", title: "Label size", choices: [["s", "Small"], ["m", "Medium"], ["l", "Large"], ["xl", "Extra large"]],
    help: "Large and Extra large give the word more room and the picture a little less. A long word still shrinks to fit its button." },
  { key: "labelPos", title: "Label position", choices: [["bottom", "Below the picture"], ["top", "Above the picture"]] },
  { key: "labelCase", title: "Label letters", choices: [["asis", "As written"], ["lower", "lowercase"], ["upper", "UPPERCASE"]],
    help: "lowercase matches many early reading programs (the word I stays a capital). Only the buttons change; the message bar shows words as written." },
  { key: "spacing", title: "Button spacing", choices: [["normal", "Normal"], ["wide", "Wide"], ["wider", "Wider"]],
    help: "Wider gaps make a near miss land on nothing. Every word stays in its own place; the buttons just get a little smaller." },
  { key: "hidden", title: "Words not shown yet", choices: [["gray", "Gray tile"], ["dots", "Dotted outline"], ["invisible", "Not drawn"]],
    help: "How a spot saved for a later word looks. The spot is always kept, whichever you choose." },
  { key: "motion", title: "Movement", choices: [["auto", "Follow the iPad"], ["reduce", "Reduce"], ["full", "Full"]],
    help: "Reduce stops sliding, pulsing and moving pictures (the model critter appears in place). Follow the iPad uses Settings > Accessibility > Motion > Reduce Motion. Rings that fill while holding a button still fill." },
  { key: "listener", title: "Show button (for the listener)", choices: [[false, "Off"], [true, "On"]],
    help: "A Show button in the message bar puts the message full screen in very large letters, with Flip to turn it toward someone across the table. For listeners who are deaf or hard of hearing, or noisy places." },
  { key: "glow", title: "Glow while speaking", choices: [[false, "Off"], [true, "On"]],
    help: "The message bar glows while VOICE is talking, so a listener who cannot hear it can see that the learner is speaking." },
  { key: "highlight", title: "Highlight each word as it is said", choices: [[false, "Off"], [true, "On"]],
    help: "Each word in the message bar lights up as it is said (supports reading). Works with voices that report word timing; with Pause between words on, words always light up." },
];

/** The page. onChanged(): the board should redraw. refresh(): rebuild this page. */
export function accessSection({ onChanged, refresh }) {
  const cur = getCurrent();
  cur.access = cleanAccess(cur.access);
  const a = cur.access;
  const status = h("p", { class: "access-status", id: "access-status", role: "status" });
  const save = async (msg) => { await saveProfile(cur); onChanged(); refresh(); if (msg) { const s = document.getElementById("access-status"); if (s) s.textContent = msg; } };

  const presetBtns = PRESETS.map((p) => h("button", { type: "button", class: "access-preset", id: "preset-" + p.id,
    onclick: async () => { applyPreset(cur, p.id); await save(p.title + " applied. Every option below can still be changed."); } },
    h("span", { class: "ap-title", text: p.title }), h("span", { class: "ap-text", text: p.text })));

  const option = (o) => h("div", { class: "field access-option", id: "acc-" + o.key },
    h("label", { text: o.title }),
    h("div", { class: "seg-row access-seg" }, ...o.choices.map(([value, label]) =>
      h("button", { type: "button", class: "seg" + (a[o.key] === value ? " on" : ""), id: `acc-${o.key}-${value}`, text: label,
        onclick: async () => { a[o.key] = value; await save(); } }))),
    o.help ? h("p", { class: "muted", text: o.help }) : null);

  return h("section", { class: "panel", id: "sec-access" },
    h("h2", { text: "Accessibility (for this learner)" }),
    h("p", { class: "muted", text: "These change how " + cur.name + "'s screen looks and a few helps for listeners. Words never move: only colours, letters, gaps and labels change. The adult menu keeps its own look." }),
    h("h3", { class: "access-h", text: "Presets" }),
    h("p", { class: "muted", text: "A preset sets several options at once. Adjust anything afterwards." }),
    h("div", { class: "access-presets" }, ...presetBtns),
    status,
    h("h3", { class: "access-h", text: "Seeing the board" }),
    ...OPTIONS.slice(0, 8).map(option),
    h("h3", { class: "access-h", text: "For the listener" }),
    ...OPTIONS.slice(8).map(option),
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn", id: "access-reset", text: "Back to the standard look",
        onclick: async () => { cur.access = cleanAccess({ ...DEFAULT_ACCESS }); await save("Back to the standard look."); } })));
}

/** One short line for the menu row: what is on. */
export function accessSummary(raw) {
  const a = cleanAccess(raw);
  const names = { dark: "High contrast", cvi: "CVI", cbsafe: "Colour-blind safe", dim: "Dim" };
  const bits = [];
  if (names[a.theme]) bits.push(names[a.theme]);
  if (a.labelSize === "l" || a.labelSize === "xl") bits.push("Large labels");
  if (a.spacing !== "normal") bits.push("Wide gaps");
  if (a.listener) bits.push("Show");
  return bits.length ? bits.slice(0, 2).join(", ") + (bits.length > 2 ? "…" : "") : "Standard";
}
