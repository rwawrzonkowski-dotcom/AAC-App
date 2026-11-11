// "My things" in the adult menu (Beta 3.1): Adult menu > Scenes > My things. For the learner on screen:
//   - how sure VOICE must be before it suggests a remembered thing in a new photo (Match strictness: Low / Medium / High);
//   - the list of things VOICE has been taught (picture + word), each with Rename, Teach again (another photo of it) and Delete.
// A thing is added from the scene editor ("Remember this", js/sceneadult.js). Everything stays on this iPad.
import { h, openOverlay, askText, askConfirm } from "./ui.js";
import { getCurrent, saveProfile } from "./profiles.js";
import * as things from "./things.js";
import { loadRecognizer } from "./recognize.js";
import { photoToCanvas, attachBoxDrawing } from "./photoboxes.js";
import { wordByLabel, loadSceneConfig } from "./scenewords.js";

export function thingsSection(ctx) {
  const cur = getCurrent();
  const box = h("div", { class: "my-things", id: "my-things" },
    h("h3", { text: "My things" }),
    h("p", { class: "muted", text: "VOICE learns from your photos on this iPad only. When you draw a box around something in a scene photo and leave “Remember this” ticked, " +
      "VOICE keeps a small picture of it and a fingerprint of how it looks. In later photos it suggests “Remembered: …” with a box. Nothing is sent anywhere." }));

  // Match strictness.
  const strictBtn = (v) => h("button", { type: "button", class: "seg" + (cur.matchStrictness === v ? " on" : ""), id: `strict-${v}`, text: things.STRICTNESS_LABEL[v],
    onclick: async () => { cur.matchStrictness = v; await saveProfile(cur); ctx.refresh(); } });
  box.append(h("div", { class: "field touch-setting", id: "setting-match-strictness" },
    h("label", { text: "Match strictness" }),
    h("div", { class: "seg-row" }, things.STRICTNESS.map(strictBtn)),
    h("p", { class: "muted", text: "How sure VOICE must be before it says it recognizes one of your things. Low suggests more, and is wrong more often; High suggests fewer, " +
      "and is wrong less often. You always see the suggestion and can untick it before anything is saved." })));

  const list = h("div", { class: "thing-list", id: "thing-list" }, h("p", { class: "muted", text: "Loading…" }));
  box.append(list);
  paint();
  return box;

  async function paint() {
    const all = await things.listThings(cur.id);
    if (!all.length) { list.replaceChildren(h("p", { class: "muted", id: "thing-none", text: "Nothing remembered yet. In a scene photo, draw a box around something and leave “Remember this” ticked." })); return; }
    list.replaceChildren(...all.map((t) => {
      const img = h("img", { class: "sl-thumb", alt: "" });
      const u = URL.createObjectURL(t.picture);
      img.onload = () => URL.revokeObjectURL(u);
      img.src = u;
      return h("div", { class: "scene-row thing-row", "data-thing": t.id },
        img,
        h("div", { class: "sl-main" },
          h("div", { class: "sl-name", text: t.label }),
          h("div", { class: "muted sl-sub", text: `${t.photos || 1} ${(t.photos || 1) === 1 ? "photo" : "photos"} · ${t.views.length} fingerprints` })),
        h("div", { class: "sl-btns" },
          h("button", { type: "button", class: "btn thing-rename", text: "Rename", onclick: async () => {
            const name = await askText("Rename this thing", t.label, "Save");
            if (!name) return;
            await loadSceneConfig();
            const w = wordByLabel(name);
            t.label = name; t.spoken = w ? w.spoken : name; t.wordId = w ? w.id : null;
            await things.putThing(t); paint();
          } }),
          h("button", { type: "button", class: "btn thing-again", text: "Teach again", onclick: () => teachAgain(t, paint) }),
          h("button", { type: "button", class: "btn danger thing-delete", text: "Delete", onclick: async () => {
            if (!(await askConfirm(`Make VOICE forget "${t.label}"? Scenes that already use it keep their buttons.`, "Forget it"))) return;
            await things.deleteThing(cur.id, t.id); paint();
          } })));
    }));
  }
}

// Teach again: choose another photo of the thing, drag a box around it, and its fingerprints are added to the thing.
function teachAgain(t, done) {
  const input = h("input", { type: "file", accept: "image/*", id: "thing-file", class: "file-hidden" });
  const o = openOverlay([
    h("h2", { text: `Teach again: ${t.label}` }),
    h("p", { class: "muted", text: "Choose another photo that shows it (a different place, angle or distance helps most). Then drag a box around it." }),
    h("div", { class: "btn-row left" }, h("label", { class: "btn primary", for: "thing-file", id: "thing-choose", text: "Take or choose a photo" }), input),
    h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn", text: "Cancel", onclick: () => o.close() })),
  ], { sheetClass: "small" });
  input.addEventListener("change", async () => {
    const f = input.files && input.files[0];
    input.value = "";
    if (!f) return;
    let canvas;
    try { canvas = await photoToCanvas(f); } catch (e) { o.close(); await askConfirm("That picture could not be opened.", "OK"); return; }
    o.close();
    boxScreen(t, canvas, done);
  });
}

function boxScreen(t, canvas, done) {
  const url = URL.createObjectURL(new Blob([]));            // (placeholder so revoke below is always valid)
  URL.revokeObjectURL(url);
  let box = null;
  const photoEl = h("div", { class: "se-photo drawing", id: "thing-photo" });
  photoEl.style.aspectRatio = canvas.width + " / " + canvas.height;
  const pic = h("canvas", { class: "se-canvas" });
  pic.width = canvas.width; pic.height = canvas.height;
  pic.getContext("2d").drawImage(canvas, 0, 0);
  const boxesEl = h("div", { class: "se-boxes" });
  photoEl.append(pic, boxesEl);
  const msg = h("p", { class: "backup-status", id: "thing-msg", role: "status" });
  const add = h("button", { type: "button", class: "btn primary", id: "thing-add", text: `Add to “${t.label}”`, disabled: true });
  const o = openOverlay([
    h("h2", { text: `Teach again: ${t.label}` }),
    h("p", { class: "muted", text: "Drag a box around it." }),
    photoEl, msg,
    h("div", { class: "btn-row" }, h("button", { type: "button", class: "btn", id: "thing-cancel", text: "Cancel", onclick: () => o.close() }), add),
  ], { sheetClass: "scene quick" });
  attachBoxDrawing(photoEl, boxesEl, () => true, (r) => {
    box = r;
    boxesEl.replaceChildren();
    const b = h("div", { class: "se-box on" });
    Object.assign(b.style, { left: r.x * 100 + "%", top: r.y * 100 + "%", width: r.w * 100 + "%", height: r.h * 100 + "%" });
    boxesEl.append(b);
    add.disabled = false;
  });
  add.addEventListener("click", async () => {
    if (!box) return;
    add.disabled = true; msg.textContent = "Learning…";
    try {
      const det = await loadRecognizer();
      if (!det.features) throw new Error("recognition is not available");
      await things.loadMean();
      const views = await things.fingerprintsFor(det, canvas, box);
      const fresh = (await things.listThings(getCurrent().id)).find((x) => x.id === t.id) || t;
      things.addViews(fresh, views);
      await things.putThing(fresh);
      o.close();
      done();
    } catch (e) {
      console.warn("Could not teach again:", e);
      msg.textContent = "That did not work (" + (e && e.message ? e.message : "unknown problem") + ").";
      add.disabled = false;
    }
  });
}
