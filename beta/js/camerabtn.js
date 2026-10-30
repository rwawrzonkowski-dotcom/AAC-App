// The camera button in the top bar (Beta 3.1): HOLD it for 1 second (a ring fills, like the session controls) and LIFT your finger to open the iPad's
// camera (or the photo picker where there is no camera). A quick tap does nothing. Then the quick scene sheet opens (js/sceneadult.js, "quick" mode):
// everything found, including remembered things, is pre-ticked; "Use now" saves the scene named "Scene <date, time>" and shows it on the strip.
// No passcode (an adult decision). During a teaching session the button is dimmed and a hold only shows "Finish the session first".
//
// Why the camera opens on LIFT and not the instant the ring is full: iPadOS only lets a page open the camera or photo picker from inside a real touch
// event (finger up), not from a timer. The ring turning green means "now lift".
import { h } from "./ui.js";
import { startFromPhoto } from "./sceneadult.js";

export const HOLD_MS = 1000;

let toastTimer = null;
function toast(text) {
  document.querySelectorAll(".cam-toast").forEach((t) => t.remove());
  const t = h("div", { class: "cam-toast", role: "status", text });
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

// button: the #camera-btn element; blocked(): a message (string) when the camera must not open now, else null.
export function initCameraButton({ button, blocked }) {
  // The hidden file input. capture="environment" makes an iPad open the rear camera directly; other browsers show the photo picker.
  const input = h("input", { type: "file", accept: "image/*", capture: "environment", id: "camera-file", class: "file-hidden", tabindex: "-1", "aria-hidden": "true" });
  document.body.append(input);
  input.addEventListener("change", async () => {
    const f = input.files && input.files[0];
    input.value = "";
    if (!f) return;
    await startFromPhoto(f, { quick: true });
  });

  let timer = null, ready = false, busy = false;
  const reset = () => { clearTimeout(timer); timer = null; ready = false; button.classList.remove("holding", "ready"); };
  button.style.setProperty("--hold-ms", HOLD_MS + "ms");
  button.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (busy) return;
    reset();
    void button.offsetWidth;                         // restart the ring animation from zero
    button.classList.add("holding");
    timer = setTimeout(() => {
      timer = null;
      const why = blocked && blocked();
      if (why) { reset(); toast(why); return; }
      ready = true;
      button.classList.remove("holding");
      button.classList.add("ready");
    }, HOLD_MS);
  });
  button.addEventListener("pointerup", () => {
    const go = ready;
    reset();
    if (!go || busy) return;                         // lifted too early: nothing happens
    busy = true;
    input.value = "";
    input.click();
    setTimeout(() => { busy = false; }, 800);
  });
  for (const type of ["pointercancel", "pointerleave"]) button.addEventListener(type, reset);
  button.addEventListener("contextmenu", (e) => e.preventDefault());
}
