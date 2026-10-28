// The About screen (adult menu > About VOICE): what the app is, who made it, links, credits, privacy and the version.
// The creator and the links come from data/about.json, so they can be filled in later without touching any code
// (see README, "Filling in the About screen"). Empty values show a clearly marked placeholder so the spot is visible.
import { h, openOverlay } from "./ui.js";
import { VERSION_LABEL, CHANNEL } from "./channel.js";

const FULL_NAME = "Variable Output for Individualized Communication and Expression";
const ONE_LINE = "A free AAC app that grows with the learner.";

// Read data/about.json. If it is missing or broken, behave as if it were empty (placeholders show).
async function loadAbout() {
  try {
    const r = await fetch("data/about.json");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const a = await r.json();
    return a && typeof a === "object" ? a : {};
  } catch (e) {
    return {};
  }
}

// Placeholders ("Creator name goes here", "Link coming soon") are for the beta only. Stable shows nothing for empty values.
const SHOW_PLACEHOLDERS = CHANNEL !== "stable";

const text = (v) => (typeof v === "string" ? v.trim() : "");

export async function openAbout() {
  const about = await loadAbout();
  const name = text(about.creatorName);
  const creds = text(about.creatorCredentials);
  const bio = text(about.creatorBio);
  const links = Array.isArray(about.links) ? about.links : [];

  // Creator: placeholder (muted italic) while the name is empty.
  // In stable, the whole Creator section is left out when there is nothing to show in it.
  const creator = (name || creds || bio || SHOW_PLACEHOLDERS) ? h("section", { class: "panel about-creator", id: "about-creator" },
    h("h2", { text: "Creator" }),
    // Name and credentials on one line, e.g. "Richard Wawrzonkowski, M.S., LBA, BCBA".
    name ? h("p", { class: "about-name", id: "about-creator-name", text: creds ? name + ", " + creds : name })
         : (SHOW_PLACEHOLDERS ? h("p", { class: "about-placeholder", id: "about-creator-name", text: "Creator name goes here" }) : null),
    (!name && creds) ? h("p", { class: "about-creds", text: creds }) : null,
    bio ? h("p", { class: "about-bio", text: bio }) : null) : null;

  // Links: a button when there is a web address, otherwise a muted "coming soon" line. Opens in a new tab.
  const linkItems = links.map((l) => {
    const label = text(l && l.label) || "Link";
    const url = text(l && l.url);
    return url
      ? h("a", { class: "btn about-link", href: url, target: "_blank", rel: "noopener", text: label })
      : (SHOW_PLACEHOLDERS ? h("span", { class: "about-placeholder about-link-soon", text: "Link coming soon: " + label }) : null);
  }).filter(Boolean);
  // No heading when there is nothing to list (stable, all links empty).
  const linkSection = linkItems.length ? h("section", { class: "panel", id: "about-links" },
    h("h2", { text: "Resources" }),
    h("div", { class: "about-link-row" }, linkItems)) : null;

  const credits = h("section", { class: "panel", id: "about-credits" },
    h("h2", { text: "Credits" }),
    h("ul", { class: "about-list" },
      h("li", { text: "Vocabulary: Universal Core, Center for Literacy and Disability Studies, UNC Chapel Hill (CC BY 4.0)." }),
      h("li", { text: "Symbols: Mulberry Symbols and OpenMoji (CC BY-SA 4.0)." }),
      h("li", { text: "Symbols and critters drawn for this project (CC BY-SA 4.0)." })),
    h("p", { class: "muted", text: "The full list is in CREDITS.md in the project." }));

  const privacy = h("section", { class: "panel", id: "about-privacy" },
    h("h2", { text: "Privacy" }),
    h("p", { text: "No accounts, no tracking, no ads. Everything (photos, learners, settings, and which words are used and when) stays on this device. Everyday use data only leaves this iPad in a backup an adult saves." }));

  const o = openOverlay([
    h("div", { class: "menu-head" },
      h("h1", {}, "About VOICE"),
      h("button", { type: "button", class: "btn primary", id: "about-close", text: "Close", onclick: () => o.close() })),
    h("div", { class: "menu-body" },
      h("section", { class: "panel", id: "about-intro" },
        h("h2", { class: "about-title", text: "VOICE" }),
        h("p", { class: "about-full", text: FULL_NAME }),
        h("p", { text: ONE_LINE })),
      creator, linkSection, credits, privacy,
      h("p", { class: "version-label about-version", id: "about-version", text: VERSION_LABEL })),
  ], { sheetClass: "menu about" });
}
