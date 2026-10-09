// Text-to-speech using the browser's built-in Web Speech API.
// No audio files and no network are used.
//
// Voice settings (voice, pitch, speed) belong to each learner's profile.
// app.js hands the current learner's settings to setVoiceSettings().

const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
let voices = [];
let settings = { voiceURI: "", pitch: 1.5, rate: 1.05 };

export function setVoiceSettings(s) { settings = s; }

// Voices load asynchronously on iOS/Chrome, so refresh when they arrive.
function refreshVoices() {
  if (synth) voices = synth.getVoices();
}

// English voices only; if the device has none, offer every voice.
export function listVoices() {
  refreshVoices();
  const english = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith("en"));
  return english.length ? english : voices.slice();
}

// Let other code (the voice picker) know when the voice list changes.
export function onVoicesChanged(fn) {
  if (!synth) return () => {};
  synth.addEventListener("voiceschanged", fn);
  return () => synth.removeEventListener("voiceschanged", fn);
}

// The chosen voice if still installed; otherwise en-US, then any English.
function pickVoice() {
  const chosen = settings.voiceURI && voices.find((v) => v.voiceURI === settings.voiceURI);
  return (
    chosen ||
    voices.find((v) => v.lang === "en-US" && v.localService) ||
    voices.find((v) => v.lang === "en-US") ||
    voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("en")) ||
    null
  );
}

export function initSpeech() {
  if (!synth) {
    console.warn("Speech synthesis is not available in this browser.");
    return;
  }
  refreshVoices();
  synth.addEventListener("voiceschanged", refreshVoices);

  // iOS only allows speech that starts inside a user gesture. On the very
  // first touch we "unlock" the engine with a silent utterance so the first
  // real word tap is not swallowed.
  const unlock = () => {
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      synth.speak(u);
    } catch (e) { /* ignore */ }
    window.removeEventListener("pointerdown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
}

// Speak text right now, interrupting anything already being spoken.
export function speak(text) {
  if (!synth || !text) return;
  try {
    synth.cancel();
    refreshVoices();
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = "en-US"; }
    u.pitch = settings.pitch;
    u.rate = settings.rate;
    synth.speak(u);
  } catch (e) {
    console.warn("Speech failed:", e);
  }
}
