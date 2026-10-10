// In-memory list of word taps, kept for Phase 2 (data collection).
// Nothing is saved to disk yet; the list is cleared when the app reloads.
// mode is 'model' when an adult tapped during Model mode, otherwise 'learner'.
// Model events also record the prompt that was set at that moment:
//   prompt: { style: "ring" | "critter" | "both", ringOpacity: 0..100, critterOpacity: 0..100 }
// (an opacity of 0 means that prompt was off, but the model is still logged).
export const events = [];

export function logWord(word, mode, prompt) {
  const e = { word, time: Date.now(), mode };
  if (prompt) e.prompt = { ...prompt };
  events.push(e);
}
