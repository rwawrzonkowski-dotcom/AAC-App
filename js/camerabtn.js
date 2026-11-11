// The camera button at the right end of the context strip (Beta 3.1, fixed in 3.2, moved in 3.3): HOLD it for 1 second (a ring fills, like the session controls), then TAP it once to
// open the iPad's camera (or the photo picker where there is no camera). A quick tap on its own does nothing, so a child can't open the camera.
// Then the quick scene sheet opens (js/sceneadult.js, "quick" mode): everything found, including remembered things, is pre-ticked; "Use now" saves
// the scene named "Scene <date, time>" and shows it on the strip. No passcode (an adult decision). During a teaching session the button is dimmed
// and a hold only shows "Finish the session first".
//
// Why "hold, then tap" (Beta 3.2): iPadOS Safari only opens the camera from an ordinary tap that lands on the photo control itself. Opening it from
// the end of a long press (our first try) is silently blocked on iPad, although desktop browsers allow it. So after the 1-second hold the button is
// "armed" for 5 seconds: the real (invisible) photo control is laid exactly over the button, the button turns green and reads "Tap", and the next
// tap lands on that control, which Safari always allows.
import { h, toast } from "./ui.js";
import { startFromPhoto } from "./sceneadult.js";

export const HOLD_MS = 1000;
export const ARMED_MS = 5000;


// button: the #camera-btn element; blocked(): a message (string) when the camera must not open now, else null.
export function initCameraButton({ button, blocked }) {
  // The photo control. capture="environment" makes an iPad open the rear camera directly; other browsers show the photo picker.
  // Beta 3.6: a FRESH control is made every time the button is armed (an iPad can refuse to open the camera again from a control it
  // has already used: the "works the first time, not the second" problem). It is laid exactly over the button so the next tap lands on it.
  let input = null;
  function makeInput() {
    if (input) input.remove();
    const el = h("input", { type: "file", accept: "image/*", capture: "environment", id: "camera-file", class: "file-hidden cam-input", tabindex: "-1", "aria-label": "Take a photo" });
    el.addEventListener("change", async () => {
      const f = el.files && el.files[0];
      disarm();
      if (!f) return;
      await startFromPhoto(f, { quick: true });
    });
    // The tap on the armed control: let the browser open the camera, then put the button back shortly after.
    el.addEventListener("click", () => setTimeout(disarm, 400));
    document.body.append(el);
    input = el;
    return el;
  }
  makeInput();

  if (!button.querySelector(".cam-tap")) button.append(h("span", { class: "cam-tap", text: "TAP" }));

  let timer = null, armTimer = null, liveTimer = null, ready = false, down = false;
  const resetHold = () => { clearTimeout(timer); timer = null; button.classList.remove("holding"); };
  function disarm() {
    clearTimeout(armTimer); armTimer = null;
    clearTimeout(liveTimer); liveTimer = null;
    ready = false;
    button.classList.remove("ready", "armed");
    if (input) { input.classList.remove("cam-armed"); input.style.cssText = ""; input.blur(); }
  }
  function place() {
    if (!input || !input.classList.contains("cam-armed")) return;
    const r = button.getBoundingClientRect();
    input.style.cssText = `left:${r.left}px; top:${r.top}px; width:${r.width}px; height:${r.height}px;`;
  }
  // The photo control goes live only a moment AFTER the finger lifts, so lifting never opens the camera by itself
  // (some browsers would treat the lift as a tap on the control). The adult always holds, lets go, then taps.
  function goLive() {
    if (!ready) return;
    makeInput();                                          // a fresh control every time
    input.classList.add("cam-armed");
    place();
    clearTimeout(armTimer);
    armTimer = setTimeout(disarm, ARMED_MS);              // not tapped in time: back to normal
  }
  function arm() {
    ready = true;
    button.classList.remove("holding");
    button.classList.add("ready", "armed");
    if (!down) { clearTimeout(liveTimer); liveTimer = setTimeout(goLive, 250); }
  }
  const lifted = () => {
    down = false;
    if (timer) { resetHold(); return; }                    // lifted before the ring was full: cancel
    if (ready) { clearTimeout(liveTimer); liveTimer = setTimeout(goLive, 250); }
  };

  button.style.setProperty("--hold-ms", HOLD_MS + "ms");
  button.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    down = true;
    disarm();
    resetHold();
    void button.offsetWidth;                         // restart the ring animation from zero
    button.classList.add("holding");
    timer = setTimeout(() => {
      timer = null;
      const why = blocked && blocked();
      if (why) { resetHold(); toast(why); return; }
      arm();                                         // ring full: the next tap opens the camera
    }, HOLD_MS);
  });
  // Lifting before the ring is full cancels the hold. Lifting after it is full leaves the button armed for the tap.
  for (const type of ["pointerup", "pointercancel", "pointerleave"]) button.addEventListener(type, lifted);
  button.addEventListener("contextmenu", (e) => e.preventDefault());
  // The screen changed size or turned while armed: move the control with the button (Beta 3.6; it used to cancel).
  window.addEventListener("resize", place);
  // Back from the camera (or from another app): start clean, whatever state the iPad left us in.
  const fresh = () => { down = false; resetHold(); disarm(); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") fresh(); });
  window.addEventListener("pageshow", fresh);
}
