// The "Model prompt" section of the adult menu (one set of choices per learner).
// It decides what Model mode shows on each button the adult models: a ring, a
// friendly animal (the "critter"), or both, each with its own opacity so the
// prompt can be faded out as the child succeeds. The choices are saved on the
// learner (profile.model); see js/critters.js for what they can be.
import { h } from "./ui.js";
import { getCurrent, saveProfile, getPhotoUrl, setPhoto, removePhoto } from "./profiles.js";
import { downscaleImage } from "./editor.js";
import {
  ANIMALS, COLORS, ACCESSORIES, SIZES, ARRIVALS, SIZE_PCT, buildCritter, critterSvg, critterTop,
} from "./critters.js";
import { usesRing } from "./modelprompt.js";

const STYLE_LABELS = { ring: "Ring only", critter: "Critter only", both: "Critter and ring" };
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

// refresh()        rebuilds the whole adult menu (keeps the scroll position)
// closeMenu()      closes the adult menu
// onPreviewPrompt  runs the prompt on the board (and reopens the menu afterwards)
export function modelSection({ refresh, closeMenu, onPreviewPrompt }) {
  const cur = getCurrent();
  const m = cur.model;
  const customUrl = getPhotoUrl("critter");      // the learner's own picture, or null
  const persist = () => saveProfile(cur);

  // A row of choose-one buttons. `current` is the chosen value.
  function choices(idPrefix, values, current, label, onPick, disabled = false) {
    return h("div", { class: "seg-row mp-seg" }, values.map((v) =>
      h("button", {
        type: "button", class: "seg" + (current === v ? " on" : ""), id: `${idPrefix}-${v}`, "data-value": v,
        text: label(v), disabled,
        onclick: () => { onPick(v); persist(); refresh(); },
      })));
  }

  // ----- the live preview: a pretend button with the critter on it -----
  const MOCK_W = 150, MOCK_H = 120;
  const mock = h("div", { class: "mp-mock", id: "mp-mock", style: `width:${MOCK_W}px;height:${MOCK_H}px` });
  const previewNote = h("p", { class: "muted mp-preview-note", id: "mp-preview-note" });
  let paintToken = 0;
  async function paintPreview() {
    const mine = ++paintToken;
    const side = Math.round(MOCK_H * SIZE_PCT[m.size]);
    const critter = await buildCritter(m, customUrl, side);
    if (mine !== paintToken) return;
    critter.style.opacity = String(m.critterOpacity / 100);
    critter.style.left = Math.round((MOCK_W - side) / 2) + "px";
    critter.style.top = critterTop(MOCK_H, side) + "px";
    mock.replaceChildren(critter);
    mock.classList.toggle("ring-on", usesRing(m));
    mock.style.setProperty("--ring-a", String(m.ringOpacity / 100));
    previewNote.textContent = m.style === "ring"
      ? "Ring only is chosen, so the critter is not shown on the board. It is shown here so you can design it."
      : m.style === "critter" ? "Critter only: no ring." : "Critter and ring together.";
  }
  paintPreview();

  // ----- opacity sliders -----
  function opacitySlider(id, label, key, enabled) {
    const num = h("span", { class: "slider-num", id: id + "-val", text: m[key] + "%" });
    const input = h("input", { type: "range", id, min: 0, max: 100, step: 5, value: m[key], disabled: !enabled,
      oninput: () => {
        m[key] = parseInt(input.value, 10);
        num.textContent = m[key] + "%";
        persist();
        paintPreview();
      } });
    return h("div", { class: "slider-row mp-slider" + (enabled ? "" : " off") },
      h("label", { for: id, text: label }), input, num);
  }

  // ----- the critter's picture: the drawn animals, or the learner's own -----
  const own = !!customUrl;
  const animalThumbs = ANIMALS.map((a) => {
    const thumb = h("span", { class: "mp-thumb" });
    thumb.style.setProperty("--body", m.color);
    critterSvg(a, "none").then((svg) => { thumb.innerHTML = svg; thumb.firstChild.classList.add("critter-art"); }).catch(() => {});
    return h("button", {
      type: "button", class: "seg animal-btn" + (m.animal === a ? " on" : ""), id: `mp-animal-${a}`, "data-value": a,
      "aria-label": cap(a), disabled: own,
      onclick: () => { m.animal = a; persist(); refresh(); },
    }, thumb, h("span", { text: cap(a) }));
  });

  const swatches = COLORS.map((c) => h("button", {
    type: "button", class: "swatch" + (m.color === c.value ? " on" : ""), id: `mp-color-${c.name.toLowerCase()}`,
    "data-value": c.value, "aria-label": c.name, title: c.name, disabled: own,
    style: `background:${c.value}`,
    onclick: () => { m.color = c.value; persist(); refresh(); },
  }));

  const fileIn = h("input", { type: "file", accept: "image/*", id: "mp-photo", class: "file-hidden",
    onchange: async () => {
      const f = fileIn.files && fileIn.files[0];
      fileIn.value = "";
      if (!f) return;
      try {
        await setPhoto("critter", await downscaleImage(f));     // same 512 px downscale as button photos
        refresh();
      } catch (e) { photoMsg.textContent = "That picture could not be read. Try another."; }
    } });
  const photoMsg = h("p", { class: "form-error", id: "mp-photo-error" });

  const sizeLabel = (s) => `${cap(s)} (${Math.round(SIZE_PCT[s] * 100)}%)`;
  const arrivalLabel = { hop: "Hop in", peek: "Peek up", appear: "Appear" };

  return h("section", { class: "panel", id: "sec-model" },
    h("h2", { text: "Model prompt (for this learner)" }),
    h("p", { class: "muted", text:
      "What Model mode shows on each button you model: a ring, a friendly critter, or both. " +
      "Lower the opacity over time so the prompt gets less noticeable as the child succeeds." }),

    h("div", { class: "field" }, h("label", { text: "Prompt style" }),
      choices("mp-style", ["ring", "critter", "both"], m.style, (v) => STYLE_LABELS[v], (v) => { m.style = v; })),

    opacitySlider("mp-ring-op", "Ring opacity", "ringOpacity", m.style !== "critter"),
    opacitySlider("mp-critter-op", "Critter opacity", "critterOpacity", m.style !== "ring"),
    h("p", { class: "muted", text: "At 0% that prompt is off. The model is still recorded." }),

    h("div", { class: "mp-critter" },
      h("h3", { text: "Critter" }),
      h("div", { class: "field" }, h("label", { text: "Animal" }), h("div", { class: "seg-row mp-seg mp-animals" }, animalThumbs)),
      h("div", { class: "field" }, h("label", { text: "Color" }), h("div", { class: "mp-swatches" }, swatches)),
      h("div", { class: "field" }, h("label", { text: "Accessory" }),
        choices("mp-acc", ACCESSORIES, m.accessory, cap, (v) => { m.accessory = v; }, own)),
      h("div", { class: "field" }, h("label", { text: "Size (compared with a button)" }),
        choices("mp-size", SIZES, m.size, sizeLabel, (v) => { m.size = v; })),
      h("div", { class: "field" }, h("label", { text: "How it arrives" }),
        choices("mp-arrival", ARRIVALS, m.arrival, (v) => arrivalLabel[v], (v) => { m.arrival = v; }),
        h("p", { class: "muted", text: "If the iPad is set to Reduce Motion, the critter simply appears." })),

      h("div", { class: "field" }, h("label", { text: "Your own picture" }),
        h("div", { class: "photo-row" },
          h("div", { class: "photo-thumb" }, own ? h("img", { src: customUrl, alt: "" }) : h("span", { text: "None" })),
          h("div", { class: "photo-btns" },
            h("p", { class: "pic-state", id: "mp-photo-state", text: own ? "Using your own picture" : "Using the drawn animal" }),
            h("label", { class: "btn", for: "mp-photo", id: "mp-photo-btn", text: "Use my own picture" }),
            fileIn,
            h("button", { type: "button", class: "btn", id: "mp-photo-remove", text: "Remove picture", disabled: !own,
              onclick: async () => { await removePhoto("critter"); refresh(); } }))),
        h("p", { class: "muted", text: "Pick something the child loves, like a favorite toy." }),
        own ? h("p", { class: "muted", text: "The animal, color and accessory are not used while your own picture is in use." }) : null,
        photoMsg)),

    h("div", { class: "mp-preview-row" },
      h("div", {}, h("label", { class: "mp-preview-title", text: "Preview" }), mock),
      h("div", { class: "mp-preview-side" },
        previewNote,
        h("button", { type: "button", class: "btn primary", id: "mp-preview-board", text: "Preview on board",
          onclick: () => { closeMenu(); onPreviewPrompt(); } }),
        h("p", { class: "muted", text: "Closes this menu for a moment and runs the prompt on a button. Nothing is said or added to the message." }))));
}
