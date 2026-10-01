// Copies brand assets into the public tree with all embedded metadata removed
// (C2PA/XMP/EXIF/text chunks in PNG, <metadata> in SVG, PNG frames inside ICO).
// Pixels and vector shapes are untouched.
//
// Usage: node dev/scripts/clean-assets.mjs <srcDir> <dstDir> [file...]
import fs from 'node:fs';
import path from 'node:path';

const KEEP_PNG = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'pHYs', 'sBIT']);
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function cleanPng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  const out = [SIG];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const chunk = buf.subarray(off, off + 12 + len);
    if (KEEP_PNG.has(type)) out.push(chunk);
    off += 12 + len;
    if (type === 'IEND') break;
  }
  return Buffer.concat(out);
}

export function cleanSvg(text) {
  return text
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
    .replace(/\s+xmlns:c2pa="[^"]*"/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim() + '\n';
}

export function cleanIco(buf) {
  const count = buf.readUInt16LE(4);
  const images = [];
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    const size = buf.readUInt32LE(e + 8);
    const offset = buf.readUInt32LE(e + 12);
    let data = buf.subarray(offset, offset + size);
    if (data.subarray(0, 8).equals(SIG)) data = cleanPng(data);
    images.push({ entry: Buffer.from(buf.subarray(e, e + 16)), data });
  }
  const header = Buffer.from(buf.subarray(0, 6));
  let offset = 6 + count * 16;
  const entries = images.map(({ entry, data }) => {
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((x) => x.data)]);
}

function clean(src, dst) {
  const ext = path.extname(src).toLowerCase();
  const buf = fs.readFileSync(src);
  let out;
  if (ext === '.png') out = cleanPng(buf);
  else if (ext === '.svg') out = cleanSvg(buf.toString('utf8'));
  else if (ext === '.ico') out = cleanIco(buf);
  else out = buf;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, out);
  const leftover = /c2pa|jumb/i.test(Buffer.isBuffer(out) ? out.toString('latin1') : out);
  if (leftover) throw new Error(`metadata still present in ${dst}`);
  console.log(`clean  ${path.relative(process.cwd(), dst)}`);
}

if (process.argv[1] && process.argv[1].endsWith("clean-assets.mjs")) {
  const [srcDir, dstDir, ...files] = process.argv.slice(2);
  if (!srcDir || !dstDir) {
    console.error('usage: clean-assets.mjs <srcDir> <dstDir> [relative files...]');
    process.exit(2);
  }
  const list = files.length ? files : fs.readdirSync(srcDir, { recursive: true }).filter((f) => fs.statSync(path.join(srcDir, f)).isFile());
  for (const f of list) clean(path.join(srcDir, f), path.join(dstDir, f));
}
