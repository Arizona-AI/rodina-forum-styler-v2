#!/usr/bin/env node
/**
 * tools/generate-icons.mjs — extension icon generator (zero dependencies).
 *
 * Renders 16/32/48/128 PNGs into assets/icons/ using only Node builtins:
 * a manual PNG encoder (IHDR/IDAT/IEND chunks + CRC32 + zlib deflate) and a
 * tiny pure-RGBA rasterizer with 3x3 supersampling for clean 16px edges.
 *
 * Design: rounded-square plate (radius = 22% of size) with a vertical
 * gradient #1c1c1f -> #0d0d10, a crimson paint stroke (#d9204f -> #ff3a66)
 * sweeping lower-left to upper-right with rounded caps, and a small white
 * 4-point sparkle in the upper-left third.
 *
 * Usage: node tools/generate-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "assets", "icons");
const SIZES = [16, 32, 48, 128];
const SS = 3; // supersampling factor: render at size*SS, box-downsample SS x SS

/* ------------------------------- color ------------------------------- */

/** "#rrggbb" -> [r, g, b] (0..255). */
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));

/** Linear RGB interpolation, t in [0, 1]. */
function lerpRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const TOP = hex("#1c1c1f");
const BOTTOM = hex("#0d0d10");
const STROKE_A = hex("#d9204f");
const STROKE_B = hex("#ff3a66");

/* -------------------------------- SDFs ------------------------------- */

/** Signed distance to a rounded rectangle centred in a w x h box (negative inside). */
function sdRoundRect(x, y, w, h, r) {
  const qx = Math.abs(x - w / 2) - (w / 2 - r);
  const qy = Math.abs(y - h / 2) - (h / 2 - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

/** Distance from point p to segment a-b (also returns projection t for gradients). */
function segInfo(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.min(1, Math.max(0, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return { dist: Math.hypot(px - cx, py - cy), t };
}

/** 4-point sparkle: astroid curve sqrt(|x|/R) + sqrt(|y|/R) <= 1 (sharp points on the axes). */
function inSparkle(x, y, cx, cy, r) {
  const nx = Math.abs(x - cx) / r;
  const ny = Math.abs(y - cy) / r;
  return nx + ny + 2 * Math.sqrt(nx * ny) <= 1; // (sqrt(nx)+sqrt(ny))^2 <= 1 rearranged
}

/* ----------------------------- rasterizer ---------------------------- */

/** Source-over composite of an opaque color with alpha onto a premultiplied pixel. */
function over(buf, i, rgb, a) {
  const keep = 1 - a;
  buf[i] = rgb[0] * a + buf[i] * keep;
  buf[i + 1] = rgb[1] * a + buf[i + 1] * keep;
  buf[i + 2] = rgb[2] * a + buf[i + 2] * keep;
  buf[i + 3] = a + buf[i + 3] * keep;
}

/** Render one icon; returns straight-alpha RGBA bytes of `size` x `size`. */
function renderIcon(size) {
  const n = size * SS; // supersampled edge length
  const buf = new Float64Array(n * n * 4); // premultiplied 0..255
  const radius = 0.22 * n; // rounded corners: 22% of size
  // Stroke: lower-left -> upper-right diagonal with rounded caps.
  const ax = 0.16 * n;
  const ay = 0.82 * n;
  const bx = 0.86 * n;
  const by = 0.16 * n;
  const halfW = 0.085 * n; // stroke half-thickness
  const sx = 0.27 * n; // sparkle centre (upper-left third)
  const sy = 0.29 * n;
  const sr = 0.11 * n;

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const cx = x + 0.5;
      const cy = y + 0.5;
      // 1. rounded-square plate with vertical gradient
      if (sdRoundRect(cx, cy, n, n, radius) <= 0) {
        over(buf, i, lerpRgb(TOP, BOTTOM, y / (n - 1)), 1);
      }
      // 2. crimson paint stroke (t along the diagonal drives the gradient)
      const seg = segInfo(cx, cy, ax, ay, bx, by);
      if (seg.dist <= halfW) {
        over(buf, i, lerpRgb(STROKE_A, STROKE_B, seg.t), 1);
      }
      // 3. white sparkle on top
      if (inSparkle(cx, cy, sx, sy, sr)) {
        over(buf, i, [255, 255, 255], 1);
      }
    }
  }

  // Box downsample: average the SS x SS premultiplied samples, then un-premultiply.
  const out = new Uint8Array(size * size * 4);
  const count = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const j = ((y * SS + dy) * n + (x * SS + dx)) * 4;
          r += buf[j];
          g += buf[j + 1];
          b += buf[j + 2];
          a += buf[j + 3];
        }
      }
      const o = (y * size + x) * 4;
      const alpha = a / count;
      const div = alpha > 0 ? alpha : 1; // un-premultiply (transparent pixels stay 0)
      out[o] = Math.min(255, Math.round(r / count / div));
      out[o + 1] = Math.min(255, Math.round(g / count / div));
      out[o + 2] = Math.min(255, Math.round(b / count / div));
      out[o + 3] = Math.min(255, Math.round(alpha));
    }
  }
  return out;
}

/* ----------------------------- PNG encoder --------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** length | type | data | CRC(type+data) */
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

/** Encode straight-alpha RGBA bytes as a PNG (8-bit, colour type 6, no interlace). */
function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // bytes 10..12: compression 0, filter 0, interlace 0
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1)); // filter byte 0 + scanline, per row
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* --------------------------------- CLI -------------------------------- */

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const size of SIZES) {
    const png = encodePNG(size, renderIcon(size));
    // Sanity: PNG magic + IHDR dimensions must match the requested size.
    const magic = png.subarray(0, 8).toString("hex");
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    if (magic !== "89504e470d0a1a0a" || width !== size || height !== size) {
      throw new Error(`icon-${size}: bad PNG (magic=${magic}, ${width}x${height})`);
    }
    const file = join(OUT_DIR, `icon-${size}.png`);
    writeFileSync(file, png);
    console.log(`[icons] ${relative(ROOT, file).replace(/\\/g, "/")}  ${png.length} bytes  ${width}x${height}`);
  }
}

main();
