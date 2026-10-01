// Propagates dev/project.json (the single source of product metadata and
// version) into the files whose formats require their own copy:
//   dev/app/package.json              version
//   dev/app/src-tauri/Cargo.toml      version, authors, description
//   dev/app/src-tauri/tauri.conf.json productName, identifier, publisher, copyright, homepage, descriptions
// The UI (About, links) and the installer read the values from these at build time.
//
// Usage:  node dev/scripts/sync-metadata.mjs           write
//         node dev/scripts/sync-metadata.mjs --check   fail if anything is out of sync (CI)
//         node dev/scripts/sync-metadata.mjs --tag v1.2.3   additionally verify a release tag
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dev = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const meta = JSON.parse(fs.readFileSync(path.join(dev, 'project.json'), 'utf8'));
const check = process.argv.includes('--check');
const tagIdx = process.argv.indexOf('--tag');
const tag = tagIdx > 0 ? process.argv[tagIdx + 1] : null;
const problems = [];

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(meta.version)) problems.push(`project.json version "${meta.version}" is not SemVer`);
if (tag && tag.replace(/^v/, '') !== meta.version) problems.push(`tag ${tag} does not match version ${meta.version}`);

function update(file, transform) {
  const full = path.join(dev, file);
  const before = fs.readFileSync(full, 'utf8');
  const after = transform(before);
  if (after === before) return;
  if (check) problems.push(`${file} is out of sync with project.json`);
  else {
    fs.writeFileSync(full, after);
    console.log(`updated ${file}`);
  }
}

const json = (fn) => (text) => {
  const obj = JSON.parse(text);
  fn(obj);
  return JSON.stringify(obj, null, 2) + '\n';
};

update('app/package.json', json((p) => {
  p.version = meta.version;
}));

update('app/src-tauri/tauri.conf.json', json((c) => {
  c.productName = meta.productName;
  c.mainBinaryName = meta.executableName;
  c.version = '../package.json';
  c.identifier = meta.identifier;
  c.bundle.publisher = meta.publisher;
  c.bundle.copyright = meta.copyright;
  c.bundle.homepage = meta.urls.website || undefined;
  c.bundle.longDescription = meta.description;
}));

update('app/src-tauri/Cargo.toml', (text) =>
  text
    .replace(/^version = ".*"$/m, `version = "${meta.version}"`)
    .replace(/^authors = \[.*\]$/m, `authors = ["${meta.author}"]`),
);

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(check ? `✓ metadata in sync (version ${meta.version})` : `✓ synced version ${meta.version}`);
