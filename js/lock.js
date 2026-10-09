// Adult lock: a 4-digit passcode on a large keypad.
// This is CHILD-PROOFING, not security. The code is kept in plain text in
// localStorage on this device.
import { load, save } from "./storage.js";
import { h, openOverlay } from "./ui.js";

// Resolves to true if the adult entered (or just created) the passcode.
export function requestAdultAccess() {
  return new Promise((resolve) => {
    const saved = load("passcode", null);
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
      hint.textContent = message || (mode === "enter" ? "" :
        mode === "create" ? "Choose 4 digits. You will use this to open the adult menu." : "Type the same 4 digits again.");
      [...dots.children].forEach((d, i) => d.classList.toggle("filled", i < digits.length));
    }

    function finish(ok) {
      document.removeEventListener("keydown", onKey);
      o.close();
      resolve(ok);
    }

    function complete() {
      const code = digits;
      digits = "";
      if (mode === "enter") {
        if (code === saved) return finish(true);
        return paint("That is not the passcode. Try again.");
      }
      if (mode === "create") { first = code; mode = "confirm"; return paint(); }
      // confirm
      if (code === first) { save("passcode", code); return finish(true); }
      mode = "create";
      first = "";
      paint("Those did not match. Let's start again.");
    }

    function press(d) {
      if (digits.length >= 4) return;
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
        forgot.textContent = "The passcode can only be reset by clearing this app's data " +
          "(iPad Settings > Safari > Advanced > Website Data, then remove this site). " +
          "Warning: this also erases all learner profiles, settings and photos on this device.";
      },
    });
    const o = openOverlay([title, hint, dots, pad, saved ? forgotLink : null, forgot], { sheetClass: "lock" });
    paint();
  });
}
