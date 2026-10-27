// Which "channel" this copy of the app is.
//   stable = the app clients use (the folder you are reading now, at the website's main address).
//   beta   = the test copy (the beta/ folder, at the same address + /beta/). New features are tried there first.
// The two copies live on the SAME website, so they would share saved data by accident.
// STORAGE_PREFIX keeps them apart: every saved name (database, settings, passcode, "stay unlocked" time)
// starts with it. Stable's prefix is EMPTY on purpose, so stable keeps using exactly the names it always used
// and nobody's saved learners change. Beta's prefix is "beta-", so beta has its own empty storage.
// tools/make-beta.sh writes the beta version of this file; tools/promote-beta.sh never overwrites this one.
export const CHANNEL = "stable";             // "stable" or "beta"
export const VERSION_LABEL = "VOICE 1.1";   // shown small in the adult menu and on the setup screen
export const STORAGE_PREFIX = "";            // "" for stable, "beta-" for beta
