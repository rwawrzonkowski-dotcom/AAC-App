// Reports: the graphs (Phase 2, Round C, beta). Every graph is drawn here as plain inline SVG: no chart library, no internet, and it
// prints crisply because SVG is vector. Each function returns an SVG string; js/reports.js and js/reportdoc.js put it on the page.
//
// HOW THE GRAPHS FOLLOW THE ABA CONVENTIONS AND THE DATA-VIZ RULES USED IN VOICE
//   - Teaching graph: one line graph per target, % independent (0 to 100) on the left, sessions in order along the bottom. Points are
//     joined only WITHIN a phase; a vertical line (labelled) marks each change of status or prompt ladder; a dashed horizontal line is
//     the target's mastery criterion. The shape of each point says WHO ran the session, the letter under the date says WHERE.
//     Under it a smaller step graph shows the average prompt help of each session (100% = full model prompt ... Independent), which is
//     how fading is read.
//   - Everyday graphs: bars for how many words were used each day with a line for how many DIFFERENT words; a growth line for the
//     vocabulary; weekly lines for message length; horizontal bars for the most used words.
//   - One axis per graph (never two scales), thin marks, soft grid lines, one color per measure (blue first, orange second), text in
//     dark gray (never the color of the data), the legend inside the graph so a printed copy is complete, a "Show as table" copy of
//     every graph on screen, and a plain-language description (aria-label) for screen readers.
//   - The app is light-only, so only the light colors are defined.
// Every point or bar carries data-* attributes (data-pct, data-v ...) that the automated tests read back.

// Colors (validated with the data-viz palette checker: blue and orange pass the lightness, separation and contrast checks).
export const COLOR = { s1: "#2a78d6", s2: "#eb6834", ink: "#0b0b0b", ink2: "#52514e", grid: "#e1e0d9", axis: "#9a988f", surface: "#ffffff", phase: "#6b6a66" };
const FONT = 'font-family="-apple-system, \'Helvetica Neue\', Arial, sans-serif"';
export const W = 640;                          // every graph is drawn 640 units wide and scaled to the page

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const r2 = (n) => Math.round(n * 100) / 100;
const compact = (v) => (Math.abs(v) >= 1000 ? r2(v / 1000) + "K" : String(r2(v)));
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// A tick line for a y axis: { max (the top of the axis), ticks }.
export function niceTicks(max, want = 4, integer = false) {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] };
  const rough = max / want, mag = Math.pow(10, Math.floor(Math.log10(rough))), norm = rough / mag;
  let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  if (integer && step < 1) step = 1;
  const top = Math.ceil(max / step - 1e-9) * step, ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(r2(v));
  return { max: top, ticks };
}

// ---------------------------------------------------------------- small pieces
const text = (x, y, s, { size = 10.5, anchor = "start", fill = COLOR.ink2, weight = "400", extra = "" } = {}) =>
  `<text x="${r2(x)}" y="${r2(y)}" font-size="${size}" text-anchor="${anchor}" fill="${fill}" font-weight="${weight}" ${FONT} ${extra}>${esc(s)}</text>`;
// The same with a white halo, so a label stays readable where it crosses a line.
const haloText = (x, y, s, o = {}) => text(x, y, s, { ...o, extra: 'stroke="#fff" stroke-width="3" paint-order="stroke" stroke-linejoin="round"' });

function svgOpen(w, h, label) {
  return `<svg class="rchart" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg" ` +
    `style="display:block;max-width:100%;height:auto" preserveAspectRatio="xMidYMid meet">`;
}

// A point's marker, drawn at (0,0): the SHAPE says who ran the session (a circle for Parent, then square, triangle, diamond, X).
export const WHO_SHAPES = ["circle", "square", "triangle", "diamond", "cross"];
export function markerShape(shape, color, hollow = false) {
  const ring = `stroke="${COLOR.surface}" stroke-width="3" paint-order="stroke" stroke-linejoin="round"`;
  const fill = hollow ? `fill="${COLOR.surface}" stroke="${color}" stroke-width="2"` : `fill="${color}" ${ring}`;
  switch (shape) {
    case "square": return `<rect x="-4.5" y="-4.5" width="9" height="9" ${fill}/>`;
    case "triangle": return `<polygon points="0,-6 5.8,4.2 -5.8,4.2" ${fill}/>`;
    case "diamond": return `<polygon points="0,-6.8 6.2,0 0,6.8 -6.2,0" ${fill}/>`;
    case "cross": return `<path d="M-4.6,-4.6L4.6,4.6M-4.6,4.6L4.6,-4.6" fill="none" stroke="${COLOR.surface}" stroke-width="6" stroke-linecap="round"/>` +
      `<path d="M-4.6,-4.6L4.6,4.6M-4.6,4.6L4.6,-4.6" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round"/>`;
    default: return `<circle r="5" ${fill}/>`;
  }
}
const whereLetter = (w) => (!w ? "" : w === "Community" ? "Cm" : w[0].toUpperCase());

// ---------------------------------------------------------------- teaching graphs
// Shared layout of the two teaching graphs, so their sessions line up above each other.
const TL = { left: 68, right: 78, top: 34 };
function xScale(n, trailing) {
  const plotW = W - TL.left - TL.right, max = trailing ? n + 1 : n + 0.5;
  return (p) => TL.left + ((p - 0.5) / (max - 0.5)) * plotW;
}

/** Which shape each Who gets, in the order the people are listed (stable for one graph set). */
export function whoShapes(whoList) {
  const map = new Map();
  [...whoList].forEach((w, i) => map.set(w, w ? WHO_SHAPES[i % WHO_SHAPES.length] : "circle"));
  return map;
}

/**
 * The % independent graph of one target. tm = a target model from reportdata.teachingModel.
 * opts: { plotH, shapes: Map(who -> shape) }
 */
export function teachingChart(tm, { plotH = 170, shapes = null } = {}) {
  const n = tm.series.length, x = xScale(n, tm.trailing), top = TL.top, plotW = W - TL.left - TL.right;
  const H = top + plotH + 66;
  const y = (pct) => top + plotH * (1 - pct / 100);
  const whoSet = shapes || whoShapes([...new Set(tm.series.map((p) => p.who))]);
  const label = `Percent independent per session for ${tm.label}: ` + tm.series.map((p) => `session ${p.n} ${Math.round(p.pct)} percent`).join(", ") +
    `. Mastery line at ${tm.masteryPct} percent.`;
  const o = [svgOpen(W, H, label)];
  o.push(text(14, top + plotH / 2, "% independent", { anchor: "middle", fill: COLOR.ink2, extra: `transform="rotate(-90 14 ${top + plotH / 2})"` }));
  // grid + y ticks
  for (const v of [0, 25, 50, 75, 100]) {
    o.push(`<line x1="${TL.left}" x2="${W - TL.right}" y1="${r2(y(v))}" y2="${r2(y(v))}" stroke="${v === 0 ? COLOR.axis : COLOR.grid}" stroke-width="1"/>`);
    o.push(text(TL.left - 8, y(v) + 3.5, String(v), { anchor: "end" }));
  }
  // phase-change lines and their labels (staggered so close ones do not overlap)
  const ends = [-1e9, -1e9, -1e9];
  const place = (xx, s, anchorEnd) => {
    const wide = s.length * 5.7 + 6, startX = anchorEnd ? xx - 4 - wide : xx + 4;
    let lvl = ends.findIndex((e) => startX >= e + 2);
    if (lvl < 0) lvl = 2;
    ends[lvl] = startX + wide;
    return { lvl, ax: anchorEnd ? xx - 4 : xx + 4 };
  };
  const first = place(TL.left, T_LABEL(tm.startPhase), false);
  o.push(text(first.ax + 0, top - 6 - first.lvl * 12 + 0, T_LABEL(tm.startPhase), { weight: "700", fill: COLOR.ink, size: 10.5 }));
  for (const l of tm.lines) {
    const xx = x(l.x), s = l.texts.join(", "), p = place(xx, s, xx + 8 + s.length * 5.7 > W - 6);
    o.push(`<line class="phase" data-x="${l.x}" data-text="${esc(s)}" x1="${r2(xx)}" x2="${r2(xx)}" y1="${top - 12 - p.lvl * 12 + 4}" y2="${top + plotH}" stroke="${COLOR.phase}" stroke-width="1.5"/>`);
    o.push(text(p.ax, top - 6 - p.lvl * 12, s, { weight: "700", fill: COLOR.ink, anchor: p.ax < xx ? "end" : "start" }));
  }
  // mastery criterion (dashed)
  const my = y(tm.masteryPct);
  o.push(`<line class="mastery" data-pct="${tm.masteryPct}" x1="${TL.left}" x2="${W - TL.right + 2}" y1="${r2(my)}" y2="${r2(my)}" stroke="${COLOR.ink}" stroke-width="1.5" stroke-dasharray="7 5"/>`);
  o.push(text(W - TL.right + 6, my + 3.5, `Mastery ${tm.masteryPct}%`, { fill: COLOR.ink, weight: "700" }));
  // lines (one per phase) and points
  for (const seg of tm.segments) {
    if (seg.length < 2) continue;
    o.push(`<path class="seg" data-n="${seg.length}" d="${seg.map((i, k) => (k ? "L" : "M") + r2(x(tm.series[i].n)) + " " + r2(y(tm.series[i].pct))).join(" ")}" fill="none" stroke="${COLOR.s1}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
  }
  for (const p of tm.series) {
    const shape = whoSet.get(p.who) || "circle";
    o.push(`<g class="pt" transform="translate(${r2(x(p.n))} ${r2(y(p.pct))})" data-session="${p.n}" data-sid="${esc(p.sessionId)}" data-date="${p.date}" data-pct="${p.pct.toFixed(2)}" ` +
      `data-help="${p.help.toFixed(3)}" data-trials="${p.trials}" data-who="${esc(p.who)}" data-where="${esc(p.where)}" data-shape="${shape}" tabindex="0">` +
      `<title>${esc(`Session ${p.n}, ${niceMD(p.date)}${p.who ? " · " + p.who : ""}${p.where ? ", " + p.where : ""}: ${Math.round(p.pct)}% independent (${p.independent} of ${p.trials} trials)`)}</title>` +
      `<circle r="14" fill="transparent"/>${markerShape(shape, COLOR.s1)}</g>`);
  }
  // x axis: session number, date, where
  const every = Math.max(1, Math.ceil(n / 14));
  tm.series.forEach((p, i) => {
    if (i % every && i !== n - 1) return;
    const xx = x(p.n);
    o.push(text(xx, top + plotH + 15, String(p.n), { anchor: "middle" }));
    o.push(text(xx, top + plotH + 28, niceMD(p.date), { anchor: "middle", size: 9.5 }));
    if (p.where) o.push(text(xx, top + plotH + 41, whereLetter(p.where), { anchor: "middle", size: 9.5, weight: "700" }));
  });
  o.push(text(TL.left - 8, top + plotH + 28, "Date", { anchor: "end", size: 9.5 }));
  o.push(text(TL.left - 8, top + plotH + 41, "Where", { anchor: "end", size: 9.5 }));
  o.push(text(TL.left + plotW / 2, top + plotH + 59, "Session", { anchor: "middle" }));
  o.push("</svg>");
  return o.join("");
}
const T_LABEL = (s) => ({ baseline: "Baseline", teaching: "Teaching", mastered: "Mastered", maintenance: "Maintenance" })[s] || s;
const niceMD = (date) => `${+date.slice(5, 7)}/${+date.slice(8, 10)}`;

/** The shapes and letters used in a teaching graph, as a small key (one line of SVG). */
export function teachingKey(shapes, wheres) {
  const o = [], items = [...shapes.entries()].filter(([w]) => w);
  let xx = TL.left;
  o.push(svgOpen(W, 24, "Key to the graph marks"));
  o.push(text(xx - 8, 15, "Who:", { anchor: "end", size: 10, weight: "700" }));
  for (const [who, shape] of items) {
    o.push(`<g transform="translate(${r2(xx + 6)} 12)">${markerShape(shape, COLOR.s1)}</g>`);
    o.push(text(xx + 16, 15, who, { size: 10 }));
    xx += 26 + who.length * 6;
  }
  if (wheres.length) {
    xx += 14;
    o.push(text(xx, 15, "Where:", { size: 10, weight: "700" }));
    xx += 44;
    for (const w of wheres) { const t = `${whereLetter(w)} = ${w}`; o.push(text(xx, 15, t, { size: 10 })); xx += 18 + t.length * 5.8; }
  }
  o.push("</svg>");
  return o.join("");
}

/** The prompt-help graph under a teaching graph: average help per session (1 = full model prompt, 0 = independent), as steps. */
export function helpChart(tm, { plotH = 92 } = {}) {
  const n = tm.series.length, x = xScale(n, tm.trailing), top = 14, plotW = W - TL.left - TL.right, H = top + plotH + 30;
  const y = (v) => top + plotH * (1 - v);
  const label = `Average prompt help per session for ${tm.label}, from model 100 percent down to independent: ` +
    tm.series.map((p) => `session ${p.n} ${Math.round(p.help * 100)} percent`).join(", ") + ".";
  const o = [svgOpen(W, H, label)];
  const names = { 1: "Model 100%", 0.75: "75%", 0.5: "50%", 0.25: "25%", 0: "Independent" };
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    o.push(`<line x1="${TL.left}" x2="${W - TL.right}" y1="${r2(y(v))}" y2="${r2(y(v))}" stroke="${v === 0 ? COLOR.axis : COLOR.grid}" stroke-width="1"/>`);
    o.push(text(TL.left - 8, y(v) + 3.5, names[v], { anchor: "end", size: 9.5 }));
  }
  for (const l of tm.lines) {
    const xx = x(l.x);
    o.push(`<line class="phase" x1="${r2(xx)}" x2="${r2(xx)}" y1="${top}" y2="${top + plotH}" stroke="${COLOR.phase}" stroke-width="1.5"/>`);
  }
  for (const seg of tm.segments) {
    const pts = seg.map((i) => [x(tm.series[i].n), y(tm.series[i].help)]);
    let d = "M" + r2(pts[0][0]) + " " + r2(pts[0][1]);
    for (let k = 1; k < pts.length; k++) {
      const mid = (pts[k - 1][0] + pts[k][0]) / 2;
      d += ` H${r2(mid)} V${r2(pts[k][1])} H${r2(pts[k][0])}`;
    }
    o.push(`<path class="hseg" d="${d}" fill="none" stroke="${COLOR.s2}" stroke-width="2" stroke-linejoin="round"/>`);
  }
  for (const p of tm.series) {
    o.push(`<g class="hpt" transform="translate(${r2(x(p.n))} ${r2(y(p.help))})" data-session="${p.n}" data-help="${p.help.toFixed(3)}">` +
      `<title>${esc(`Session ${p.n}, ${niceMD(p.date)}: average help ${Math.round(p.help * 100)}%`)}</title><circle r="4.5" fill="${COLOR.s2}" stroke="${COLOR.surface}" stroke-width="2"/></g>`);
  }
  o.push(text(TL.left + plotW / 2, top + plotH + 24, "Prompt help (average per session; the step chart falls as the prompt is faded)", { anchor: "middle", size: 9.5 }));
  o.push("</svg>");
  return o.join("");
}

// ---------------------------------------------------------------- everyday graphs
// x labels for a list of bucket keys (days or weeks): about 8 labels, never crowded.
function xTicks(keys, fmt) {
  const every = Math.max(1, Math.ceil(keys.length / 8));
  return keys.map((k, i) => (i % every === 0 ? { i, label: fmt(k) } : null)).filter(Boolean);
}
const rBar = (x0, y0, w, h, r) => {              // a column with rounded TOP corners and a square bottom
  r = Math.min(r, w / 2, h);
  return `M${r2(x0)} ${r2(y0 + h)}V${r2(y0 + r)}Q${r2(x0)} ${r2(y0)} ${r2(x0 + r)} ${r2(y0)}H${r2(x0 + w - r)}Q${r2(x0 + w)} ${r2(y0)} ${r2(x0 + w)} ${r2(y0 + r)}V${r2(y0 + h)}Z`;
};

/**
 * Words used per day (bars) with different words per day (line). One axis.
 * items: [{ key, taps, unique }]  bucket: "day" | "week"
 */
export function wordsPerDayChart(items, { bucket = "day", plotH = 150 } = {}) {
  const top = 30, left = 52, right = 16, plotW = W - left - right, H = top + plotH + 44;
  const ymax = niceTicks(Math.max(1, ...items.map((i) => i.taps)), 4, true);
  const y = (v) => top + plotH * (1 - v / ymax.max), slot = plotW / Math.max(1, items.length);
  const cx = (i) => left + slot * (i + 0.5);
  const per = bucket === "week" ? "week" : "day";
  const o = [svgOpen(W, H, `Words used per ${per} (bars) and different words per ${per} (line), ${items.length} ${per}s.`)];
  // legend
  o.push(`<rect x="${left}" y="6" width="12" height="10" rx="2" fill="${COLOR.s1}"/>`, text(left + 18, 15, `Words used (taps) per ${per}`, { size: 10.5 }));
  o.push(`<line x1="${left + 178}" x2="${left + 196}" y1="11" y2="11" stroke="${COLOR.s2}" stroke-width="2.5" stroke-linecap="round"/>`, text(left + 202, 15, `Different words per ${per}`, { size: 10.5 }));
  for (const v of ymax.ticks) {
    o.push(`<line x1="${left}" x2="${W - right}" y1="${r2(y(v))}" y2="${r2(y(v))}" stroke="${v === 0 ? COLOR.axis : COLOR.grid}" stroke-width="1"/>`, text(left - 8, y(v) + 3.5, compact(v), { anchor: "end" }));
  }
  const bw = Math.max(1, Math.min(24, slot - 2) * (slot > 6 ? 0.8 : 1));
  items.forEach((it, i) => {
    if (it.taps > 0) o.push(`<path class="bar" data-date="${it.key}" data-v="${it.taps}" d="${rBar(cx(i) - bw / 2, y(it.taps), bw, y(0) - y(it.taps), 4)}" fill="${COLOR.s1}"><title>${esc(`${niceMD(it.key)}: ${it.taps} words used, ${it.unique} different`)}</title></path>`);
  });
  const pts = items.map((it, i) => `${r2(cx(i))} ${r2(y(it.unique))}`);
  if (items.length > 1) o.push(`<path class="uline" d="M${pts.join(" L")}" fill="none" stroke="${COLOR.s2}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
  items.forEach((it, i) => {
    const big = items.length <= 31 ? 3.5 : i === items.length - 1 ? 4 : 0;      // (a long period only shows the last dot; the others stay for the table and tooltip)
    o.push(`<circle class="upt" data-date="${it.key}" data-v="${it.unique}" cx="${r2(cx(i))}" cy="${r2(y(it.unique))}" r="${it.taps > 0 ? big : 0}" fill="${COLOR.s2}" stroke="${COLOR.surface}" stroke-width="2"><title>${esc(`${niceMD(it.key)}: ${it.unique} different words`)}</title></circle>`);
  });
  for (const t of xTicks(items.map((i) => i.key), niceMD)) o.push(text(cx(t.i), top + plotH + 15, t.label, { anchor: "middle" }));
  o.push(text(left + plotW / 2, top + plotH + 36, bucket === "week" ? "Week starting" : "Day", { anchor: "middle" }), "</svg>");
  return o.join("");
}

/**
 * A line graph for one measure. points: [{ key, v (or null for a gap), tip }]. yMax: fixed top of the axis (else nice).
 * opts: { title (for screen readers), yTitle, xTitle, xFmt, integer, endLabel (text for the last value), dots (draw a dot on every point), cls }
 */
export function lineChart(points, { title, yTitle, xTitle, xFmt = niceMD, yMax = null, integer = false, endLabel = null, dots = true, cls = "lpt", plotH = 130, color = COLOR.s1 } = {}) {
  const top = 22, left = 52, right = 72, plotW = W - left - right, H = top + plotH + 44;
  const vals = points.map((p) => p.v).filter((v) => v !== null);
  const yt = yMax ? { max: yMax, ticks: [0, yMax / 4, yMax / 2, (3 * yMax) / 4, yMax].map(r2) } : niceTicks(Math.max(1, ...vals), 4, integer);
  const y = (v) => top + plotH * (1 - v / yt.max), slot = plotW / Math.max(1, points.length - 1);
  const cx = (i) => (points.length === 1 ? left + plotW / 2 : left + slot * i);
  const o = [svgOpen(W, H, `${title}: ` + (vals.length ? points.filter((p) => p.v !== null).map((p) => `${xFmt(p.key)} ${r2(p.v)}`).join(", ") : "no data") + ".")];
  if (yTitle) o.push(text(12, top + plotH / 2, yTitle, { anchor: "middle", extra: `transform="rotate(-90 12 ${top + plotH / 2})"` }));
  for (const v of yt.ticks) {
    o.push(`<line x1="${left}" x2="${W - right}" y1="${r2(y(v))}" y2="${r2(y(v))}" stroke="${v === 0 ? COLOR.axis : COLOR.grid}" stroke-width="1"/>`, text(left - 8, y(v) + 3.5, compact(v), { anchor: "end" }));
  }
  let d = "", pen = false;
  points.forEach((p, i) => { if (p.v === null) { pen = false; return; } d += (pen ? "L" : "M") + r2(cx(i)) + " " + r2(y(p.v)); pen = true; });
  if (d) o.push(`<path class="${cls}-line" d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
  const lastIdx = points.map((p) => p.v !== null).lastIndexOf(true);
  points.forEach((p, i) => {
    if (p.v === null) return;
    const r = dots || i === lastIdx ? 4.5 : 0;               // (a long graph shows only the last dot; the others stay, unseen, for the table and tests)
    o.push(`<circle class="${cls}" data-key="${p.key}" data-v="${r2(p.v)}" cx="${r2(cx(i))}" cy="${r2(y(p.v))}" r="${r}" fill="${color}" stroke="${COLOR.surface}" stroke-width="2"><title>${esc(p.tip || `${xFmt(p.key)}: ${r2(p.v)}`)}</title></circle>`);
  });
  if (endLabel && lastIdx >= 0) o.push(haloText(cx(lastIdx) + 8, y(points[lastIdx].v) + 4, endLabel, { weight: "700", fill: COLOR.ink }));
  for (const t of xTicks(points.map((p) => p.key), xFmt)) o.push(text(cx(t.i), top + plotH + 15, t.label, { anchor: "middle" }));
  if (xTitle) o.push(text(left + plotW / 2, top + plotH + 36, xTitle, { anchor: "middle" }));
  o.push("</svg>");
  return o.join("");
}

/**
 * Horizontal bars, one per item, longest first (top words, how words were reached). items: [{ key, label, value }].
 * The value is written at the tip of each bar.
 */
export function hBarChart(items, { title, unit = "", labelChars = 22, rowH = 24 } = {}) {
  const left = 8 + Math.min(labelChars, Math.max(6, ...items.map((i) => i.label.length))) * 6.2, right = 46, top = 6;
  const H = top + items.length * rowH + 6, plotW = W - left - right;
  const max = Math.max(1, ...items.map((i) => i.value));
  const o = [svgOpen(W, H, `${title}: ` + items.map((i) => `${i.label} ${i.value}`).join(", ") + ".")];
  items.forEach((it, i) => {
    const yy = top + i * rowH, w = Math.max(2, (it.value / max) * plotW), bh = 14;
    o.push(text(left - 8, yy + rowH / 2 + 3.5, clip(it.label, labelChars), { anchor: "end", size: 11 }));
    o.push(`<path class="hbar" data-key="${esc(it.key)}" data-v="${it.value}" d="M${left} ${r2(yy + (rowH - bh) / 2)}H${r2(left + w - 4)}Q${r2(left + w)} ${r2(yy + (rowH - bh) / 2)} ${r2(left + w)} ${r2(yy + (rowH - bh) / 2 + 4)}V${r2(yy + (rowH + bh) / 2 - 4)}Q${r2(left + w)} ${r2(yy + (rowH + bh) / 2)} ${r2(left + w - 4)} ${r2(yy + (rowH + bh) / 2)}H${left}Z" fill="${COLOR.s1}">` +
      `<title>${esc(`${it.label}: ${it.value}${unit}`)}</title></path>`);
    o.push(text(left + w + 6, yy + rowH / 2 + 3.5, String(it.value), { size: 10.5, fill: COLOR.ink, weight: "700" }));
  });
  o.push(`<line x1="${left}" x2="${left}" y1="${top}" y2="${H - 6}" stroke="${COLOR.axis}" stroke-width="1"/>`, "</svg>");
  return o.join("");
}
