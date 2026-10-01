// Builds the NSIS installer bitmaps (24-bit BMP) from the brand PNGs.
//   sidebar: 164×314 (welcome/finish pages)   header: 150×57 (inner pages)
// Usage: node dev/scripts/installer-images.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = path.join(root, 'assets', 'brand', 'png');
const outDir = path.join(root, 'app', 'src-tauri', 'nsis');

/** Minimal decoder: 8-bit RGBA/RGB, non-interlaced. */
function decodePng(file) {
  const b = fs.readFileSync(file);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), depth = b[24], ctype = b[25];
  if (depth !== 8 || (ctype !== 6 && ctype !== 2) || b[28] !== 0) throw new Error(`unsupported PNG ${file}`);
  const bpp = ctype === 6 ? 4 : 3;
  const idat = [];
  for (let off = 8; off < b.length; ) {
    const len = b.readUInt32BE(off), type = b.toString('latin1', off + 4, off + 8);
    if (type === 'IDAT') idat.push(b.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp, px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, up = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      line[x] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const s = x * bpp, d = (y * w + x) * 4;
      px[d] = line[s]; px[d + 1] = line[s + 1]; px[d + 2] = line[s + 2]; px[d + 3] = bpp === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { w, h, px };
}

function canvas(w, h, rgb) {
  const px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { px[i * 4] = rgb[0]; px[i * 4 + 1] = rgb[1]; px[i * 4 + 2] = rgb[2]; px[i * 4 + 3] = 255; }
  return { w, h, px };
}

function draw(dst, src, ox, oy) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const s = (y * src.w + x) * 4, dx = ox + x, dy = oy + y;
    if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
    const d = (dy * dst.w + dx) * 4, a = src.px[s + 3] / 255;
    for (let k = 0; k < 3; k++) dst.px[d + k] = Math.round(src.px[s + k] * a + dst.px[d + k] * (1 - a));
  }
}

function writeBmp(img, file) {
  const rowSize = Math.ceil((img.w * 3) / 4) * 4, size = 54 + rowSize * img.h, b = Buffer.alloc(size);
  b.write('BM', 0); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(img.w, 18); b.writeInt32LE(img.h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28);
  b.writeUInt32LE(rowSize * img.h, 34); b.writeInt32LE(2835, 38); b.writeInt32LE(2835, 42);
  for (let y = 0; y < img.h; y++) {
    const row = 54 + (img.h - 1 - y) * rowSize;
    for (let x = 0; x < img.w; x++) {
      const s = (y * img.w + x) * 4, d = row + x * 3;
      b[d] = img.px[s + 2]; b[d + 1] = img.px[s + 1]; b[d + 2] = img.px[s];
    }
  }
  fs.writeFileSync(file, b);
  console.log(`wrote ${path.relative(process.cwd(), file)} (${img.w}×${img.h})`);
}

const side = canvas(164, 314, [0xfa, 0xfa, 0xf8]);
draw(side, decodePng(path.join(brand, 'installer-side-164x314.png')), 0, 0);
writeBmp(side, path.join(outDir, 'sidebar.bmp'));

const header = canvas(150, 57, [0xff, 0xff, 0xff]);
const icon = decodePng(path.join(brand, 'installer-header-55.png'));
draw(header, icon, 150 - icon.w - 4, 1);
writeBmp(header, path.join(outDir, 'header.bmp'));
