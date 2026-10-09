// In-memory list of word taps, kept for Phase 2 (data collection).
// Nothing is saved to disk yet; the list is cleared when the app reloads.
// mode is 'model' when an adult tapped during Model mode, otherwise 'learner'.
export const events = [];

export function logWord(word, mode) {
  events.push({ word, time: Date.now(), mode });
}
