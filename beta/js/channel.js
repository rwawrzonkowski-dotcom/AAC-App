// Which "channel" this copy of the app is. This is the BETA copy (the beta/ folder):
// new features are tested here first. See the stable copy's js/channel.js for the full explanation.
// Beta's prefix "beta-" keeps its saved data completely separate from the stable app's.
// tools/make-beta.sh writes this file; do not copy it over the stable one.
export const CHANNEL = "beta";               // "stable" or "beta"
export const VERSION_LABEL = "VOICE Beta 2.3";     // shown small in the adult menu and on the setup screen
export const STORAGE_PREFIX = "beta-";       // "" for stable, "beta-" for beta
