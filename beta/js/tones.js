// Tones for the message bar (Beta 3.16): the TONE WHEEL (js/tonewheel.js) and the learner's MOOD.
// A web app can change only three things about the iPad's voice for one sentence: pitch, speed and the punctuation the voice reads
// (a "?" gives a rising question tone, "!" a lively ending, "..." a trailing-off one). Each tone is a preset of those three. It is tone
// COLOURING: clearly different from tone to tone, not an actor's voice, and better with Enhanced / Premium voices. (The native app can
// go further; the wheel and the presets carry over.)
//
// The 8 spots are fixed, like the forms dial, going round clockwise from the top: the lively feelings on the top and right, the
// quieter ones on the bottom and left. Each uses the picture of the matching Feelings word (the question spot uses "what").
//   pitch  added to the learner's pitch (the voice's range is 0 to 2; the result is kept inside it)
//   rate   multiplies the learner's Sentence speed
//   end    the punctuation spoken at the end of the message
//   novelty  "silly" borrows an installed novelty voice for the message when there is one (otherwise it is just very high and quick)
export const TONES = [
  { id: "happy",    label: "happy",    wordId: "happy",   pitch: +0.20, rate: 1.08, end: "!" },
  { id: "excited",  label: "excited",  wordId: "excited", pitch: +0.35, rate: 1.18, end: "!" },
  { id: "silly",    label: "silly",    wordId: "silly",   pitch: +0.50, rate: 1.12, end: "!", novelty: true },
  { id: "question", label: "question", wordId: "what",    pitch: +0.10, rate: 1.00, end: "?" },
  { id: "calm",     label: "calm",     wordId: "calm",    pitch: -0.10, rate: 0.85, end: "." },
  { id: "sad",      label: "sad",      wordId: "sad",     pitch: -0.35, rate: 0.75, end: "..." },
  { id: "mad",      label: "mad",      wordId: "mad",     pitch: -0.25, rate: 1.10, end: "!" },
  { id: "scared",   label: "scared",   wordId: "scared",  pitch: +0.30, rate: 1.20, end: "?" },
];
export const TONE_IDS = TONES.map((t) => t.id);
export const toneById = (id) => TONES.find((t) => t.id === id) || null;

// Novelty voices to try for "silly", friendliest first (names compared without spaces, lower case).
const SILLY_VOICES = ["boing", "bubbles", "superstar", "jester", "wobble", "goodnews", "trinoids", "bahh"];

/** The message text with the tone's ending (any punctuation already at the end is replaced). */
export function toneText(text, tone) {
  if (!tone) return text;
  return String(text).replace(/[\s.!?…,;:]+$/u, "") + tone.end;
}
/** The voice settings for this tone: { pitch, rate, voiceURI } from the learner's own. voices = the installed SpeechSynthesisVoice list. */
export function toneSettings(base, tone, voices = []) {
  if (!tone) return base;
  const pitch = Math.min(2, Math.max(0.3, (base.pitch ?? 1) + tone.pitch));
  const s = { ...base, pitch, sentenceRate: (typeof base.sentenceRate === "number" ? base.sentenceRate : 0.9) * tone.rate };
  if (tone.novelty) {
    const byName = (n) => voices.find((v) => v.name.toLowerCase().replace(/\s+/g, "") === n);
    const v = SILLY_VOICES.map(byName).find(Boolean);
    if (v) { s.voiceURI = v.voiceURI; s.pitch = 1; }        // a novelty voice is silly enough at its own pitch
  }
  return s;
}
