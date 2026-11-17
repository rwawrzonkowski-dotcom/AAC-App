// Adult lock: a 4-digit passcode on a large keypad.
// This is CHILD-PROOFING, not security (4 digits can always be guessed by someone determined).
// Beta 3.36: the code is no longer kept as plain text. It is saved as a salted PBKDF2-SHA-256 hash ({ v: 1, salt, hash }), so
// anyone looking at the browser's storage cannot read it. A code saved by an older version (plain digits) still works and is
// changed to a hash the first time it is entered. After 5 wrong tries in a row the keypad waits 30 seconds.
import { load, save } from "./storage.js";
import { h, openOverlay } from "./ui.js";

// "Stay unlocked for 10 minutes": after a correct passcode (with the box ticked) the passcode step is
// skipped on this device until this time. The 3-second hold is still needed each time.
export const STAY_UNLOCKED_MS = 10 * 60 * 1000;
function stillUnlocked() {
  const until = load("unlockUntil", 0);
  const left = typeof until === "number" ? until - Date.now() : 0;
  return left > 0 && left <= STAY_UNLOCKED_MS;     // (a clock set far back cannot make it last longer)
}

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function hashCode(code, saltHex) {
  const salt = new Uint8Array(saltHex.match(/../g).map((x) => parseInt(x, 16)));
  const key = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256));
}
/** Save a new passcode as a salted hash (plain digits only where the browser has no crypto, which GitHub Pages always has). */
async function storeCode(code) {
  if (!(globalThis.crypto && crypto.subtle)) { save("passcode", code); return; }
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  save("passcode", { v: 1, salt, hash: await hashCode(code, salt) });
}
/** True if the code matches what is saved (and upgrades an old plain-text code to a hash). */
async function checkCode(code, saved) {
  if (typeof saved === "string") {
    if (code !== saved) return false;
    try { await storeCode(code); } catch (e) { /* keep the old form */ }
    return true;
  }
  if (saved && typeof saved === "object" && saved.salt && saved.hash) {
    try { return (await hashCode(code, saved.salt)) === saved.hash; } catch (e) { return false; }
  }
  return false;
}
const hasCode = (saved) => (typeof saved === "string" && /^\d{4}$/.test(saved)) || !!(saved && typeof saved === "object" && saved.hash);

// Wrong tries: after MAX_TRIES wrong codes in a row, the keypad waits WAIT_MS (kept in storage so a reload does not skip it).
const MAX_TRIES = 5, WAIT_MS = 30 * 1000;
function waitLeft() {
  const w = load("passcodeWait", null);
  const left = w && typeof w.until === "number" ? w.until - Date.now() : 0;
  return left > 0 && left <= WAIT_MS ? left : 0;          // (a clock set far back cannot make it longer)
}

// Resolves to true if the adult entered (or just created) the passcode, or is still unlocked.
export function requestAdultAccess() {
  return new Promise((resolve) => {
    const stored = load("passcode", null);
    const saved = hasCode(stored) ? stored : null;
    if (saved && stillUnlocked()) return resolve(true);
    let checking = false;
    let waitTimer = null;
    let mode = saved ? "enter" : "create";   // enter | create | confirm
    let first = "";                          // the code typed the first time (create)
    let digits = "";

    const title = h("h2");
    const hint = h("p", { class: "lock-hint" });
    const dots = h("div", { class: "lock-dots", "aria-hidden": "true" },
      [0, 1, 2, 3].map(() => h("span", { class: "dot" })));
    const forgot = h("p", { class: "lock-forgot", hidden: true });

    function paint(message) {
      title.textContent = mode === "enter" ? "Enter passcode"
        : mode === "create" ? "Create a passcode" : "Enter it again to confirm";
      const left = mode === "enter" ? waitLeft() : 0;
      if (left) {
        hint.textContent = `Too many tries. Wait ${Math.ceil(left / 1000)} seconds, then try again.`;
        clearTimeout(waitTimer); waitTimer = setTimeout(() => paint(), 1000);
        [...dots.children].forEach((d) => d.classList.remove("filled"));
        return;
      }
      hint.textContent = message || (mode === "enter" ? "" :
        mode === "create" ? "Choose 4 digits. You will use this to open the adult menu." : "Type the same 4 digits again.");
      [...dots.children].forEach((d, i) => d.classList.toggle("filled", i < digits.length));
    }

    function finish(ok) {
      if (ok) save("unlockUntil", stay.checked ? Date.now() + STAY_UNLOCKED_MS : 0);
      document.removeEventListener("keydown", onKey);
      clearTimeout(waitTimer);
      o.close();
      resolve(ok);
    }

    async function complete() {
      const code = digits;
      digits = "";
      if (mode === "enter") {
        checking = true;
        const right = await checkCode(code, saved);
        checking = false;
        if (right) { save("passcodeWait", null); return finish(true); }
        const w = load("passcodeWait", null) || {};
        const tries = (Number(w.tries) || 0) + 1;
        if (tries >= MAX_TRIES) { save("passcodeWait", { tries: 0, until: Date.now() + WAIT_MS }); return paint(); }
        save("passcodeWait", { tries });
        return paint("That is not the passcode. Try again.");
      }
      if (mode === "create") { first = code; mode = "confirm"; return paint(); }
      // confirm
      if (code === first) { await storeCode(code); return finish(true); }
      mode = "create";
      first = "";
      paint("Those did not match. Let's start again.");
    }

    function press(d) {
      if (digits.length >= 4 || checking || (mode === "enter" && waitLeft())) return;
      digits += d;
      paint();
      if (digits.length === 4) setTimeout(complete, 120);   // let the 4th dot show
    }
    function back() { digits = digits.slice(0, -1); paint(); }

    const pad = h("div", { class: "keypad" },
      ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) =>
        h("button", { type: "button", class: "key", "data-digit": d, text: d, onclick: () => press(d) })),
      h("button", { type: "button", class: "key ghost-key", text: "Cancel", onclick: () => finish(false) }),
      h("button", { type: "button", class: "key", "data-digit": "0", text: "0", onclick: () => press("0") }),
      h("button", { type: "button", class: "key ghost-key", "aria-label": "Delete digit", text: "⌫", onclick: back }));

    // A hardware keyboard works too.
    function onKey(e) {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
    }
    document.addEventListener("keydown", onKey);

    const forgotLink = h("button", {
      type: "button", class: "link-btn", text: "Forgot passcode?",
      onclick: () => {
        forgot.hidden = false;
        forgot.textContent = "The passcode can only be reset by clearing this app's website data " +
          "(iPad Settings > Safari > Advanced > Website Data, then remove this site). " +
          "Warning: this resets the passcode AND erases every learner, setting and photo on this iPad. " +
          "Keep a recent backup (adult menu > Backup). After resetting, make a new passcode and use " +
          "Restore from backup to bring the learners back.";
      },
    });
    const stay = h("input", { type: "checkbox", id: "stay-unlocked", checked: true });
    const stayRow = h("label", { class: "lock-stay" }, stay, " Stay unlocked for 10 minutes");
    const o = openOverlay([title, hint, dots, pad, stayRow, saved ? forgotLink : null, forgot], { sheetClass: "lock" });
    paint();
  });
}
