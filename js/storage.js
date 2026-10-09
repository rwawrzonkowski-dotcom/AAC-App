// Tiny wrapper around localStorage. Everything stays on this device.
// All access is wrapped in try/catch because Safari private mode or full
// storage can make localStorage throw. If it fails, we fall back to memory.
const PREFIX = "aac.";
const memory = {};

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw !== null) return JSON.parse(raw);
  } catch (e) {
    if (key in memory) return memory[key];
  }
  return key in memory ? memory[key] : fallback;
}

export function save(key, value) {
  memory[key] = value;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn("Could not save to localStorage:", key);
  }
}
