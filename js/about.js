// The About screen (adult menu > About VOICE): what the app is, who made it, links, credits, privacy and the version.
// The creator and the links come from data/about.json, so they can be filled in later without touching any code
// (see README, "Filling in the About screen"). Empty values show a clearly marked placeholder so the spot is visible.
import { h, openOverlay } from "./ui.js";
import { VERSION_LABEL, CHANNEL, FULL_NAME } from "./channel.js";

const ONE_LINE = "A free AAC app that grows with the learner.";

// Read data/about.json. If it is missing or broken, behave as if it were empty (placeholders show).
// Read data/credits.json (Nov 18): the one source for credits and licenses (tools/make-credits.py writes CREDITS.md from it).
async function loadCredits() {
  try { const r = await fetch("data/credits.json"); return r.ok ? await r.json() : null; } catch (e) { return null; }
}

// The Credits and licenses page, opened from About. Text is readable offline; the links need the internet.
export function openCredits(C) {
  const link = (url, text) => h("a", { href: url, target: "_blank", rel: "noopener", text });
  const item = (it) => h("li", { class: "credit-item" },
    h("strong", { text: it.name }), " ",
    h("span", { text: "(" + it.by.replace(/\.$/, "") + ")." }), " ",
    h("span", { text: "License: " }), link(it.licenseUrl, it.license), ".",
    it.note ? h("span", { text: " " + it.note }) : null,
    it.url ? h("span", {}, " ", link(it.url, "Website")) : null);
  const o = openOverlay([
    h("div", { class: "menu-head" },
      h("h1", {}, "Credits and licenses"),
      h("button", { type: "button", class: "btn primary", id: "credits-close", text: "Close", onclick: () => o.close() })),
    h("div", { class: "menu-body", id: "credits-body" },
      h("section", { class: "panel" },
        h("p", { class: "about-copyright", text: C.copyright }),
        h("p", { text: C.summary })),
      ...C.sections.map((s) => h("section", { class: "panel" },
        h("h2", { text: s.title }),
        s.intro ? h("p", { class: "muted", text: s.intro }) : null,
        h("ul", { class: "about-list" }, s.items.map(item)))),
      h("section", { class: "panel" },
        h("h2", { text: "Notices" }),
        h("ul", { class: "about-list" }, C.notices.map((n) => h("li", { text: n }))))),
  ], { sheetClass: "menu about credits" });
  return o;
}

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

  // Credits: a short summary here; the full list (holders, licenses, links, notices) on its own page.
  const C = await loadCredits();
  const credits = h("section", { class: "panel", id: "about-credits" },
    h("h2", { text: "Credits and licenses" }),
    h("p", { text: "Words from Universal Core; pictures from Mulberry Symbols and OpenMoji; fonts and camera software from open projects. Each is used under its own license." }),
    C ? h("button", { type: "button", class: "btn", id: "about-credits-open", text: "See all credits and licenses", onclick: () => openCredits(C) }) : null);

  const privacy = h("section", { class: "panel", id: "about-privacy" },
    h("h2", { text: "Privacy" }),
    h("p", { text: "No accounts, no tracking, no ads. Everything (photos, learners, settings, and which words are used and when) stays on this device. Everyday use data only leaves this iPad in a backup an adult saves." }),
    // The website's full privacy page (data/about.json "privacyUrl", Nov 18). Hidden when empty.
    typeof about.privacyUrl === "string" && about.privacyUrl.trim()
      ? h("a", { class: "btn about-link", id: "about-privacy-link", href: about.privacyUrl.trim(), target: "_blank", rel: "noopener", text: "Read the full privacy page" })
      : null);

  const o = openOverlay([
    h("div", { class: "menu-head" },
      h("h1", {}, "About V.O.I.C.E."),
      h("button", { type: "button", class: "btn primary", id: "about-close", text: "Close", onclick: () => o.close() })),
    h("div", { class: "menu-body" },
      h("section", { class: "panel", id: "about-intro" },
        h("h2", { class: "about-title", text: "V.O.I.C.E." }),
        h("p", { class: "about-full", text: FULL_NAME }),
        h("p", { text: ONE_LINE })),
      creator, linkSection, credits, privacy,
      C ? h("p", { class: "about-copyright", id: "about-copyright", text: C.copyright + " Pictures, fonts and software from others are used under their own licenses." }) : null,
      h("p", { class: "version-label about-version", id: "about-version", text: VERSION_LABEL })),
  ], { sheetClass: "menu about" });
}
