// FCT mode settings (Beta 3.48): the cleaner used for new learners, old learners and backups. No screen code here (see js/fct.js).
export const DEFAULT_STEPS = [0, 5, 10, 20, 30, 60];

/** A learner's FCT settings with every field present and in range (used for new learners, old learners and backups). */
export function cleanFct(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const nat = (v, d, lo, hi) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
  let steps = Array.isArray(o.steps) ? o.steps.filter((x) => typeof x === "number" && isFinite(x) && x >= 0 && x <= 3600).map(Math.round) : [];
  steps = [...new Set(steps)].sort((a, b) => a - b).slice(0, 12);
  if (!steps.length) steps = DEFAULT_STEPS.slice();
  return {
    on: o.on === true,
    wordId: typeof o.wordId === "string" && /^[A-Za-z0-9_:,@.+~-]{1,80}$/.test(o.wordId) ? o.wordId : null,
    label: typeof o.label === "string" ? o.label.slice(0, 40) : "",
    highlight: o.highlight !== false,
    steps,
    upAfter: nat(o.upAfter, 3, 1, 20),
    downAfter: nat(o.downAfter, 2, 1, 20),
    step: Math.min(nat(o.step, 0, 0, 11), steps.length - 1),
    calm: nat(o.calm, 0, 0, 99),              // calm waits in a row at this step
    rough: nat(o.rough, 0, 0, 99),            // waits with problem behavior in a row at this step
    behavior: typeof o.behavior === "string" && o.behavior.trim() ? o.behavior.trim().slice(0, 40) : "problem behavior",
  };
}

