// App entry point: loads the word map, draws the board, wires the message bar.
import { load, save } from "./storage.js";
import { initSpeech, speak, setVoiceMode } from "./speech.js";
import { renderBoard, attachPressHandling } from "./board.js";

const sentence = []; // spoken text of each tapped word, in order

async function start() {
  // ---- TEMPORARY developer-only switches (real controls arrive in steps 6/8) ----
  // ?stage=4  -> reveal words up to stage 4 (saved on this device)
  // ?voice=adult (or child) -> choose the voice
  const params = new URLSearchParams(location.search);
  const stageParam = parseInt(params.get("stage"), 10);
  if (stageParam >= 1 && stageParam <= 4) save("stage", stageParam);
  const voiceParam = params.get("voice");
  if (voiceParam === "adult" || voiceParam === "child") setVoiceMode(voiceParam);
  // -------------------------------------------------------------------------------

  const stage = load("stage", 1);
  initSpeech();

  const res = await fetch("data/core-board.json");
  const board = await res.json();

  const chipsEl = document.getElementById("message-chips");
  function drawMessage() {
    chipsEl.innerHTML = "";
    for (const w of sentence) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = w.label;
      chipsEl.appendChild(chip);
    }
    // keep the newest word in view if the sentence is long
    const box = document.getElementById("message-text");
    box.scrollLeft = box.scrollWidth;
  }

  renderBoard(document.getElementById("board"), board, stage, (button) => {
    // Step 4: speak immediately, then add to the message bar.
    // (Category buttons just speak their name for now; navigation is step 5.)
    speak(button.spokenText || button.label);
    sentence.push({ label: button.label, spoken: button.spokenText || button.label });
    drawMessage();
  });

  // Tap the message text area -> speak the whole sentence
  attachPressHandling(document.getElementById("message-bar"), (el) => {
    if (el.id === "message-text") speak(sentence.map((w) => w.spoken).join(" "));
    else if (el.id === "delete-btn") { sentence.pop(); drawMessage(); }
    else if (el.id === "clear-btn") { sentence.length = 0; drawMessage(); }
  }, "#message-text, .bar-btn");

  // Block pinch/double-tap zoom and rubber-band scrolling on iOS
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js", { scope: "./" }).catch((e) =>
      console.warn("Offline support unavailable:", e));
  }
}

start();
