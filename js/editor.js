// The editor sheet that opens when an adult taps a cell in Edit mode.
// It never offers a way to MOVE a word: a cell's place is permanent.
import { h, openOverlay } from "./ui.js";

// Shrink a chosen photo to at most 512 px on its long side, as a JPEG (~0.85).
// Works on-device; the picture is never uploaded anywhere.
export function downscaleImage(file, maxSide = 512, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))),
        "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image")); };
    img.src = url;
  });
}

// d = the cell description from resolvePage(); photoUrl = its current photo (or null).
// onOpenPage(pageId) is used by the "Open this page" button on category buttons.
// Resolves to null (cancelled) or:
//   { show: 'auto'|true|false, label, spoken, photo: undefined|Blob|null, removeWord: bool }
//   photo: undefined = unchanged, Blob = new photo, null = remove photo
export function openCellEditor(d, photoUrl, { onOpenPage } = {}) {
  return new Promise((resolve) => {
    const isNew = d.kind === "empty";
    const isCustom = !!d.custom;
    const curLabel = isNew ? "" : d.label;
    const curSpoken = isNew ? "" : d.spoken;

    // ----- state held until Save -----
    let show = d.ov.show === undefined ? "auto" : d.ov.show;
    let photo;                       // undefined | Blob | null
    let previewUrl = photoUrl;       // what the thumbnail shows
    let linked = curSpoken.toLowerCase() === curLabel.toLowerCase();   // spoken follows label

    const labelIn = h("input", { type: "text", class: "text-input", id: "ed-label", maxlength: 30, value: curLabel });
    const spokenIn = h("input", { type: "text", class: "text-input", id: "ed-spoken", maxlength: 60,
      value: curSpoken, placeholder: "Same as label" });
    labelIn.addEventListener("input", () => { if (linked) spokenIn.value = labelIn.value; });
    spokenIn.addEventListener("input", () => { linked = false; });

    // The built-in symbol (if this button has one) shows when there is no photo.
    const symbolUrl = d.base && d.base.image ? d.base.image : null;
    const thumb = h("div", { class: "photo-thumb" });
    const picState = h("p", { class: "pic-state", id: "ed-pic-state" });
    function paintThumb() {
      if (previewUrl) {
        thumb.replaceChildren(h("img", { src: previewUrl, alt: "" }));
        picState.textContent = "Using your photo";
      } else if (symbolUrl) {
        thumb.replaceChildren(h("img", { class: "symbol", src: symbolUrl, alt: "" }));
        picState.textContent = "Using built-in symbol";
      } else {
        thumb.replaceChildren(h("span", { text: "No picture" }));
        picState.textContent = "No picture yet";
      }
    }
    paintThumb();

    const fileIn = h("input", { type: "file", accept: "image/*", id: "ed-photo", class: "file-hidden" });
    fileIn.addEventListener("change", async () => {
      const f = fileIn.files && fileIn.files[0];
      if (!f) return;
      try {
        photo = await downscaleImage(f);
        if (previewUrl && previewUrl !== photoUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(photo);
        paintThumb();
      } catch (e) { error.textContent = "That picture could not be read. Try another."; }
    });

    const error = h("p", { class: "form-error" });

    // Show / Hide control (not for brand-new words)
    let showRow = null;
    if (!isNew) {
      const opts = [
        ["auto", d.base && d.base.stage !== undefined ? "Follow stage" : "Automatic"],
        [true, "Always show"],
        [false, "Always hide"],
      ];
      const btns = opts.map(([val, text]) => h("button", {
        type: "button", class: "seg", "data-show": String(val), text,
        onclick: () => { show = val; paintSeg(); },
      }));
      const paintSeg = () => opts.forEach(([val], i) => btns[i].classList.toggle("on", show === val));
      paintSeg();
      showRow = h("div", { class: "field" }, h("label", { text: "Visibility" }), h("div", { class: "seg-row" }, btns));
    }

    function close(result) {
      if (previewUrl && previewUrl !== photoUrl) URL.revokeObjectURL(previewUrl);
      o.close();
      resolve(result);
    }

    function save() {
      const label = labelIn.value.trim();
      if (!label) { error.textContent = "Please type a label."; labelIn.focus(); return; }
      close({ show, label, spoken: spokenIn.value.trim() || label, photo, removeWord: false });
    }

    const o = openOverlay([
      h("h2", { text: isNew ? "Add a word here" : "Edit button" }),
      isNew ? h("p", { class: "muted", text: "This word will stay in this exact spot." }) : null,
      showRow,
      h("div", { class: "field" }, h("label", { for: "ed-label", text: "Label (what is written)" }), labelIn),
      h("div", { class: "field" }, h("label", { for: "ed-spoken", text: "Spoken text (what is said)" }), spokenIn),
      h("div", { class: "field" }, h("label", { text: "Photo" }),
        h("div", { class: "photo-row" }, thumb,
          h("div", { class: "photo-btns" },
            picState,
            h("label", { class: "btn", for: "ed-photo", text: "Take or choose photo" }),
            fileIn,
            h("button", { type: "button", class: "btn", id: "ed-remove-photo", text: symbolUrl ? "Remove my photo (use symbol)" : "Remove photo",
              onclick: () => { photo = null; previewUrl = null; paintThumb(); } })))),
      d.loadBoard && onOpenPage
        ? h("button", { type: "button", class: "btn wide", text: "Open this page",
            onclick: () => { close(null); onOpenPage(d.loadBoard); } })
        : null,
      isCustom
        ? h("button", { type: "button", class: "btn danger wide", id: "ed-remove-word", text: "Remove this word",
            onclick: () => close({ removeWord: true }) })
        : null,
      error,
      h("div", { class: "btn-row" },
        h("button", { type: "button", class: "btn", id: "ed-cancel", text: "Cancel", onclick: () => close(null) }),
        h("button", { type: "button", class: "btn primary", id: "ed-save", text: isNew ? "Add word" : "Save", onclick: save })),
    ], { sheetClass: "editor" });
  });
}
