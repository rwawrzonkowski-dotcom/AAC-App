// "Press and hold" helper with visual feedback.
// While held, the element gets the class "holding" and the CSS variable
// --hold-ms; styles.css animates a filling ring (.hold-ring) or bar (.hold-bar).
// If the finger lifts or slides off early, nothing happens.
export function attachHold(el, ms, onDone) {
  let timer = null;
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    el.classList.remove("holding");
  };
  el.style.setProperty("--hold-ms", ms + "ms");
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    cancel();
    // restart the CSS animation from zero
    void el.offsetWidth;
    el.classList.add("holding");
    timer = setTimeout(() => { cancel(); onDone(); }, ms);
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave"]) el.addEventListener(type, cancel);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}
