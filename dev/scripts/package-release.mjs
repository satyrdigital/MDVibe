// Collects release artifacts into dist/:
//   MDVibe-Setup.exe              installer under a stable name (for releases/latest/download/…)
//   MDVibe-Setup-<v>.exe         NSIS installer (from the Tauri bundler)
//   MDVibe-<v>-win-<arch>.zip     portable build (exe + notices + license info)
//   SHA256SUMS.txt                checksums of everything above
//
// Usage: node dev/scripts/package-release.mjs [--target x86_64-pc-windows-msvc]
// Run after `npm run app:build` (and after signing, if signing is configured).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'dev', 'project.json'), 'utf8'));
const v = meta.version;
const ti = process.argv.indexOf('--target');
const target = ti > 0 ? process.argv[ti + 1] : null;
const arch = target?.startsWith('aarch64') ? 'arm64' : 'x64';
const targetDir = path.join(root, 'dev', 'app', 'src-tauri', 'target', ...(target ? [target] : []), 'release');
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });

const exe = path.join(targetDir, `${meta.executableName}.exe`);
if (!fs.existsSync(exe)) throw new Error(`missing ${exe} — run npm run app:build first`);

const nsisDir = path.join(targetDir, 'bundle', 'nsis');
const setup = fs.readdirSync(nsisDir).find((f) => f.endsWith('-setup.exe') && f.includes(v));
if (!setup) throw new Error(`no NSIS installer for ${v} in ${nsisDir}`);
const setupOut = `${meta.productName}-Setup-${v}${arch === 'x64' ? '' : `-${arch}`}.exe`;
fs.copyFileSync(path.join(nsisDir, setup), path.join(dist, setupOut));
// Stable name: the project page links to releases/latest/download/MDVibe-Setup.exe.
const stableOut = `${meta.productName}-Setup${arch === 'x64' ? '' : `-${arch}`}.exe`;
fs.copyFileSync(path.join(nsisDir, setup), path.join(dist, stableOut));

// Portable zip
const stage = path.join(root, 'temp', `portable-${v}-${arch}`);
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
fs.copyFileSync(exe, path.join(stage, `${meta.executableName}.exe`));
for (const f of ['THIRD_PARTY_NOTICES.md', 'LICENSE']) {
  if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(stage, f));
}
fs.writeFileSync(
  path.join(stage, 'README-portable.txt'),
  [
    `${meta.productName} ${v} — portable build`,
    '',
    `Run ${meta.executableName}.exe. Nothing is installed and no file associations are registered.`,
    'To appear in "Open with" and to set MDVibe as the default app for .md files, use the installer.',
    'Requires the Microsoft Edge WebView2 Runtime (included in Windows 11 and current Windows 10).',
    'Settings and recent documents are stored in %APPDATA%\\' + meta.identifier,
    '',
    meta.copyright,
    '',
  ].join('\r\n'),
);
const zipOut = `${meta.productName}-${v}-win-${arch}.zip`;
fs.rmSync(path.join(dist, zipOut), { force: true });
// Windows' bsdtar writes zip archives (-a); GNU tar from Git Bash would treat "E:" as a host.
const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
execFileSync(tar, ['-a', '-c', '-f', path.join(dist, zipOut), '-C', stage, '.'], { stdio: 'inherit' });

// Checksums (all artifacts currently in dist/ for this version)
const files = fs
  .readdirSync(dist)
  .filter((f) => (f.includes(v) || f === stableOut) && !f.endsWith('.txt'))
  .sort();
const sums = files.map((f) => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(dist, f))).digest('hex')}  ${f}`);
fs.writeFileSync(path.join(dist, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
for (const f of [...files, 'SHA256SUMS.txt']) {
  console.log(`${String(fs.statSync(path.join(dist, f)).size).padStart(10)}  dist/${f}`);
}
