// Picture helpers shared by the Scenes screens (Beta 3.1; moved out of js/sceneadult.js unchanged, plus the box-drawing helper):
//   photoToCanvas  draw a chosen photo (a File or Blob) on a canvas no bigger than MAX_SIDE, with the camera's rotation applied
//   cropCanvas     a square crop of the photo around a box (box in fractions 0..1)
//   canvasBlob     a canvas as a jpeg Blob
//   attachBoxDrawing  "drag a rectangle on the photo" for the scene editor, the quick sheet and "Teach again"
export const MAX_SIDE = 1280;            // the longest side of a stored photo, in pixels
export const CROP_PX = 256;              // the square picture on a strip button

export function canvasBlob(canvas, quality = 0.85) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not make the picture"))), "image/jpeg", quality));
}
function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(blob);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(u); resolve(im); };
    im.onerror = () => { URL.revokeObjectURL(u); reject(new Error("That picture could not be opened.")); };
    im.src = u;
  });
}
// Draw a chosen photo (a File or Blob) onto a canvas no bigger than MAX_SIDE. The camera's rotation is applied.
export async function photoToCanvas(file) {
  let src, w, h2;
  try {
    src = await createImageBitmap(file, { imageOrientation: "from-image" });
    w = src.width; h2 = src.height;
  } catch (e) {
    src = await loadImage(file);                 // (browsers without createImageBitmap options: the picture element applies the rotation)
    w = src.naturalWidth; h2 = src.naturalHeight;
  }
  const k = Math.min(1, MAX_SIDE / Math.max(w, h2));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h2 * k));
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  if (src.close) src.close();
  return c;
}
// A square crop of the photo around a box (box in fractions 0..1), CROP_PX or `size` pixels wide.
export function cropCanvas(photo, box, size = CROP_PX) {
  const W = photo.width, H = photo.height;
  const bw = box.w * W, bh = box.h * H;
  const side = Math.min(Math.max(bw, bh) * 1.06, Math.min(W, H));
  const sx = Math.min(W - side, Math.max(0, box.x * W + bw / 2 - side / 2));
  const sy = Math.min(H - side, Math.max(0, box.y * H + bh / 2 - side / 2));
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d").drawImage(photo, sx, sy, side, side, 0, 0, size, size);
  return c;
}

// Let the adult drag a rectangle on a photo element. `photoEl` is the photo's wrapper, `boxesEl` the layer holding the boxes.
// isOn() says whether drawing is switched on; onBox(box) gets the finished rectangle (fractions 0..1), ignoring tiny strays.
export function attachBoxDrawing(photoEl, boxesEl, isOn, onBox) {
  let start = null, ghost = null;
  const pt = (e) => {
    const r = photoEl.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const rect = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  photoEl.addEventListener("pointerdown", (e) => {
    if (!isOn()) return;
    e.preventDefault();
    start = pt(e);
    ghost = document.createElement("div");
    ghost.className = "se-ghost";
    boxesEl.append(ghost);
    try { photoEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  photoEl.addEventListener("pointermove", (e) => {
    if (!start || !ghost) return;
    const r = rect(start, pt(e));
    Object.assign(ghost.style, { left: r.x * 100 + "%", top: r.y * 100 + "%", width: r.w * 100 + "%", height: r.h * 100 + "%" });
  });
  photoEl.addEventListener("pointerup", (e) => {
    if (!start) return;
    const r = rect(start, pt(e));
    start = null;
    if (ghost) { ghost.remove(); ghost = null; }
    if (r.w < 0.03 || r.h < 0.03) return;             // too small: a stray touch
    onBox(r);
  });
  photoEl.addEventListener("pointercancel", () => { start = null; if (ghost) { ghost.remove(); ghost = null; } });
}
