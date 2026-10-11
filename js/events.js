// In-memory list of word taps, kept for Phase 2 (data collection).
// Nothing is saved to disk yet; the list is cleared when the app reloads.
// mode is 'model' when an adult tapped during Model mode, otherwise 'learner'.
// Model events also record the prompt that was set at that moment:
//   prompt: { style: "ring" | "critter" | "both", ringOpacity: 0..100, critterOpacity: 0..100 }
// (an opacity of 0 means that prompt was off, but the model is still logged).
//
// A word tapped on the board also records its id (word: "fall", id: "fall-season"), so two words that share a label
// ("fall" the season / "fall" the verb, "May" the month / "may") stay distinguishable. A word an adult added has the
// id of its cell (for example "pe-friends:0,0"). Typed letters and number-pad numbers have no id.
// Using the Forms button logs the same kind of event with the chosen form added:
//   { word: "go", form: "went", id: "go", time, mode: "model" | "learner", prompt? }
// (word = the word that was tapped on the board; form = the form that was chosen.)
export const events = [];

export function logWord(word, mode, prompt, extra) {
  const e = { word, time: Date.now(), mode };
  if (extra) Object.assign(e, extra);
  if (prompt) e.prompt = { ...prompt };
  events.push(e);
}
