// Device-aware help for adults: what kind of device this is, the "Test the volume" button with its tips,
// and the "phone" check used for the board-size tip. Nothing here touches the board or the child's data.
import { h } from "./ui.js";
import { speak } from "./speech.js";

const ua = () => navigator.userAgent || "";

export const isAndroid = () => /Android/i.test(ua());
export const isIPhone = () => /iPhone|iPod/i.test(ua());
// iPads report themselves as a Mac in "desktop website" mode, so a Mac with a touch screen counts too.
export const isIPad = () => /iPad/i.test(ua()) || (/Macintosh/i.test(ua()) && (navigator.maxTouchPoints || 0) > 1);
export const isIOS = () => isIPhone() || isIPad();

// Does this look like a phone? Small screen (shorter side under 600 CSS px) or an iPhone / Android phone
// browser ("Mobile" is in Android phone user agents, not in tablets'). The physical screen is used, not the
// window, so a narrow iPad split-screen window is still an iPad.
export function looksLikePhone() {
  const s = window.screen || {};
  const w = s.width || window.innerWidth, hgt = s.height || window.innerHeight;
  if (Math.min(w, hgt) < 600) return true;
  return isIPhone() || (isAndroid() && /Mobile/i.test(ua()));
}

export const PHONE_BOARD_TIP = "On a phone, the 45-button board is easier to tap.";
export const VOLUME_TEST_SENTENCE = "This is how loud VOICE will be";

// The tips for this device, as an array of strings (general line first).
export function volumeTips() {
  const tips = ["Turn the device volume up while VOICE is talking."];
  if (isAndroid()) {
    tips.push("On Android, the volume buttons change the ringer when nothing is playing, so press them while VOICE is talking.");
    tips.push("Android: Settings → Sounds and vibration → Volume → Media.");
    tips.push("Samsung: try Google's speech engine: Settings → General management → Text-to-speech → Preferred engine → " +
      "Speech Recognition and Synthesis from Google.");
  }
  if (isIOS()) {
    tips.push("Open Control Center (swipe down from the top right corner, or up from the bottom on devices with a Home button) and drag the volume slider up while VOICE is talking.");
    if (isIPhone()) tips.push("iPhone: flip the Ring/Silent switch (or hold the Action button) so the phone is not on silent.");
    if (isIPad()) tips.push("iPad: if a mute icon shows in Control Center, tap it off. A side switch or the sidebar can set Ring/Silent " +
      "(Settings → General → Use Side Switch To).");
  }
  tips.push("Check that the device isn't on silent mode and Bluetooth isn't sending sound elsewhere.");
  return tips;
}

// "Test the volume" button + tips beside it.
//   voice         voice settings to speak with (omit to use the current learner's)
//   tipsOnTap     true: tips appear after the first tap (keeps the small setup screen tidy)
//   extraClass    e.g. "setup-volume"
export function volumeTestBlock({ voice, tipsOnTap = false, extraClass = "" } = {}) {
  const list = h("ul", { class: "volume-tips", id: "volume-tips" }, volumeTips().map((t) => h("li", { text: t })));
  if (tipsOnTap) list.hidden = true;
  const btn = h("button", { type: "button", class: "btn", id: "volume-test", text: "Test the volume",
    onclick: () => {
      speak(VOLUME_TEST_SENTENCE, "sentence", voice);
      list.hidden = false;
    } });
  return h("div", { class: "volume-test " + extraClass }, btn, list);
}
