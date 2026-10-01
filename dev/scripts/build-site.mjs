// Builds the static project page: docs/site → _site, filling links from
// dev/project.json. Elements marked data-optional are removed when their URL
// is not configured (no dead buttons). No analytics, no third-party requests.
//
// Usage: node dev/scripts/build-site.mjs [outDir=_site]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'dev', 'project.json'), 'utf8'));
const src = path.join(root, 'docs', 'site');
const out = path.resolve(root, process.argv[2] ?? '_site');

const repo = meta.urls.repository || meta.urls.website;
const values = {
  REPO_URL: repo,
  RELEASES_URL: meta.urls.releases || (meta.urls.repository ? `${meta.urls.repository.replace(/\/$/, '')}/releases/latest` : meta.urls.website),
  SUPPORT_URL: meta.urls.support,
};

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
const index = path.join(out, 'index.html');
let html = fs.readFileSync(index, 'utf8');
// Drop optional links whose URL is empty.
html = html.replace(/<a [^>]*href="\{\{(\w+)\}\}"[^>]*data-optional[^>]*>[\s\S]*?<\/a>/g, (m, key) => (values[key] ? m : ''));
html = html.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '#');
fs.writeFileSync(index, html);
console.log(`site built in ${path.relative(root, out)} (repository: ${repo || 'not set'})`);
