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
// options:
//   onOpenPage(pageId)  used by the "Open this page" button on category / page buttons
//   canMakePage         true if "Make this a page" may be offered (depth limit, see boardmodel.js)
// Resolves to null (cancelled) or:
//   { show: 'auto'|true|false, label, spoken, fill, photo: undefined|Blob|null,
//     removeWord: bool, makePage: bool, deletePage: bool }
//   photo: undefined = unchanged, Blob = new photo, null = remove photo
export function openCellEditor(d, photoUrl, { onOpenPage, canMakePage = false } = {}) {
  return new Promise((resolve) => {
    const isNew = d.kind === "empty";
    const isCustom = !!d.custom;
    const isPageButton = !!d.opens;                       // a button an adult made to open a page
    const isFillIn = !!(d.sentence && d.blank);           // "My name is ___"
    const curLabel = isNew ? "" : d.label;
    const curSpoken = isNew ? "" : d.spoken;

    // ----- state held until Save -----
    let show = d.ov.show === undefined ? "auto" : d.ov.show;
    let photo;                       // undefined | Blob | null
    let previewUrl = photoUrl;       // what the thumbnail shows
    let linked = curSpoken.toLowerCase() === curLabel.toLowerCase();   // spoken follows label
    let makePage = false;            // new button: "A page" chosen

    const labelIn = h("input", { type: "text", class: "text-input", id: "ed-label", maxlength: 30, value: curLabel });
    const spokenIn = h("input", { type: "text", class: "text-input", id: "ed-spoken", maxlength: 60,
      value: curSpoken, placeholder: "Same as label" });
    labelIn.addEventListener("input", () => { if (linked) spokenIn.value = labelIn.value; });
    spokenIn.addEventListener("input", () => { linked = false; });
    const labelCaption = h("label", { for: "ed-label", text: isPageButton ? "Page name" : "Label (what is written)" });
    const spokenField = h("div", { class: "field", id: "ed-spoken-field", hidden: isPageButton },
      h("label", { for: "ed-spoken", text: "Spoken text (what is said)" }), spokenIn);

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

    // Show / Hide control (not for brand-new buttons, and not for blank sentences,
    // which simply stay hidden until they are filled in)
    let showRow = null;
    if (!isNew && !isFillIn) {
      const opts = [
        ["auto", d.stageGated ? "Follow stage" : "Automatic"],
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

    // New button: is it a word or a page? (offered only while the depth limit allows)
    let kindRow = null;
    const kindNote = h("p", { class: "muted", id: "ed-kind-note",
      text: "This word will stay in this exact spot." });
    function paintKind() {
      wordBtn.classList.toggle("on", !makePage);
      pageBtn.classList.toggle("on", makePage);
      labelCaption.textContent = makePage ? "Page name" : "Label (what is written)";
      spokenField.hidden = makePage;
      kindNote.textContent = makePage
        ? "This button will open a new empty page. On that page, Back sits in this same spot. Words you add there come back to the main board when tapped."
        : "This word will stay in this exact spot.";
      addBtn.textContent = makePage ? "Add page" : "Add word";
    }
    const wordBtn = h("button", { type: "button", class: "seg on", id: "ed-kind-word", text: "A word",
      onclick: () => { makePage = false; paintKind(); } });
    const pageBtn = h("button", { type: "button", class: "seg", id: "ed-kind-page", text: "Make this a page",
      onclick: () => { makePage = true; paintKind(); } });
    if (isNew && canMakePage) {
      kindRow = h("div", { class: "field" }, h("label", { text: "This button is" }), h("div", { class: "seg-row" }, wordBtn, pageBtn));
    }

    // Fill-in field for sentence buttons ("My name is ___")
    let fillBlock = null, fillIn = null;
    if (isFillIn) {
      fillIn = h("input", { type: "text", class: "text-input", id: "ed-fill", maxlength: 60,
        value: d.fill, placeholder: d.base.fillHint || "" });
      const says = h("p", { class: "muted", id: "ed-says" });
      const paintSays = () => {
        const t = fillIn.value.trim();
        says.textContent = t ? "Will say: " + d.template.replace("___", t) : "Empty: this button stays hidden (gray) on the board until you fill it in.";
      };
      fillIn.addEventListener("input", paintSays);
      paintSays();
      fillBlock = h("div", { id: "ed-fill-block" },
        h("p", { class: "muted", text: "This button says: " + d.template }),
        h("div", { class: "field" }, h("label", { for: "ed-fill", text: "Fill in" }), fillIn, says),
        d.base.privacy
          ? h("p", { class: "privacy-note", id: "ed-privacy",
              text: "Anyone holding this iPad can hear this. Only add what is safe to share." })
          : null);
    }

    function close(result) {
      if (previewUrl && previewUrl !== photoUrl) URL.revokeObjectURL(previewUrl);
      o.close();
      resolve(result);
    }

    function save() {
      if (isFillIn) {
        close({ show, label: d.label, spoken: d.spoken, fill: fillIn.value.trim(), photo, removeWord: false });
        return;
      }
      const label = labelIn.value.trim();
      if (!label) { error.textContent = makePage || isPageButton ? "Please type a page name." : "Please type a label."; labelIn.focus(); return; }
      close({ show, label, spoken: spokenIn.value.trim() || label, photo, removeWord: false, makePage });
    }

    const addBtn = h("button", { type: "button", class: "btn primary", id: "ed-save", text: isNew ? "Add word" : "Save", onclick: save });

    const o = openOverlay([
      h("h2", { text: isNew ? "Add a button here" : isPageButton ? "Edit page button" : "Edit button" }),
      isNew ? kindNote : null,
      kindRow,
      showRow,
      fillBlock,
      isFillIn ? null : h("div", { class: "field" }, labelCaption, labelIn),
      isFillIn ? null : spokenField,
      h("div", { class: "field" }, h("label", { text: "Photo" }),
        h("div", { class: "photo-row" }, thumb,
          h("div", { class: "photo-btns" },
            picState,
            h("label", { class: "btn", for: "ed-photo", text: "Take or choose photo" }),
            fileIn,
            h("button", { type: "button", class: "btn", id: "ed-remove-photo", text: symbolUrl ? "Remove my photo (use symbol)" : "Remove photo",
              onclick: () => { photo = null; previewUrl = null; paintThumb(); } })))),
      d.loadBoard && onOpenPage
        ? h("button", { type: "button", class: "btn wide", id: "ed-open-page", text: "Open this page",
            onclick: () => { close(null); onOpenPage(d.loadBoard); } })
        : null,
      isPageButton
        ? h("button", { type: "button", class: "btn danger wide", id: "ed-delete-page", text: "Delete this page and everything on it",
            onclick: () => close({ deletePage: true }) })
        : isCustom
          ? h("button", { type: "button", class: "btn danger wide", id: "ed-remove-word", text: "Remove this word",
              onclick: () => close({ removeWord: true }) })
          : null,
      error,
      h("div", { class: "btn-row" },
        h("button", { type: "button", class: "btn", id: "ed-cancel", text: "Cancel", onclick: () => close(null) }),
        addBtn),
    ], { sheetClass: "editor" });
    paintKind_init();
    function paintKind_init() { if (isNew && canMakePage) paintKind(); }
  });
}
