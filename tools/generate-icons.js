/* Dev tool — generates the extension's PNG icon set (no image deps).
 * Design: blue rounded square + a white speech bubble (matches the in-app icon).
 * Run: node tools/generate-icons.js  → writes icons/icon{16,32,48,128}.png */
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ---- PNG encoder (RGBA, 8-bit) ----
const CRC = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) { raw[y * (1 + w * 4)] = 0; for (let x = 0; x < w * 4; x++) raw[y * (1 + w * 4) + 1 + x] = rgba[y * w * 4 + x]; }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---- Shape helpers (normalized 0..1 coords) ----
function inRR(u, v, x0, y0, x1, y1, r) {
  if (u < x0 || u > x1 || v < y0 || v > y1) return false;
  const nx = u < x0 + r ? x0 + r : (u > x1 - r ? x1 - r : u);
  const ny = v < y0 + r ? y0 + r : (v > y1 - r ? y1 - r : v);
  const dx = u - nx, dy = v - ny;
  return dx * dx + dy * dy <= r * r;
}
function sign(px, py, ax, ay, bx, by) { return (px - bx) * (ay - by) - (ax - bx) * (py - by); }
function inTri(u, v, ax, ay, bx, by, cx, cy) {
  const d1 = sign(u, v, ax, ay, bx, by), d2 = sign(u, v, bx, by, cx, cy), d3 = sign(u, v, cx, cy, ax, ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
function colorAt(u, v) {
  if (!inRR(u, v, 0.02, 0.02, 0.98, 0.98, 0.22)) return [0, 0, 0, 0];     // outside the rounded square
  const bubble = inRR(u, v, 0.22, 0.26, 0.80, 0.60, 0.10)                 // bubble body
    || inTri(u, v, 0.30, 0.56, 0.25, 0.76, 0.45, 0.59);                   // bubble tail
  return bubble ? [255, 255, 255, 255] : [37, 99, 235, 255];             // white on #2563eb
}

function render(size) {
  const ss = 4, n = ss * ss;
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const c = colorAt((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
      r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
    }
    const i = (y * size + x) * 4;
    out[i] = a ? Math.round(r / a) : 0;
    out[i + 1] = a ? Math.round(g / a) : 0;
    out[i + 2] = a ? Math.round(b / a) : 0;
    out[i + 3] = Math.round(a / n);
  }
  return out;
}

const dir = path.join(__dirname, "..", "icons");
fs.mkdirSync(dir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(dir, "icon" + size + ".png"), encodePNG(size, size, render(size)));
  console.log("wrote icons/icon" + size + ".png");
}
