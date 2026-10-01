/** About, Keyboard Shortcuts and update-check dialogs. */
import { h, icon } from './dom';
import { ICONS } from './icons';
import { Modal } from './modal';
import { t } from '../i18n';
import meta from '../../../project.json';

export const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: 'shortcuts.file',
    items: [
      ['Ctrl+O', 'menu.open'],
      ['Ctrl+N', 'menu.newWindow'],
      ['F5', 'menu.reload'],
      ['Ctrl+P', 'menu.print'],
      ['Ctrl+Shift+S', 'menu.savePdf'],
      ['Ctrl+W', 'menu.close'],
    ],
  },
  {
    group: 'shortcuts.view',
    items: [
      ['Ctrl+F', 'menu.find'],
      ['F3 / Shift+F3', 'shortcuts.findNext'],
      ['Ctrl+Shift+B', 'menu.sidebar'],
      ['Ctrl+U', 'menu.source'],
      ['Ctrl+Shift+L', 'menu.layout'],
      ['Ctrl+Shift+T', 'shortcuts.theme'],
      ['Ctrl++ / Ctrl+=', 'menu.zoomIn'],
      ['Ctrl+-', 'menu.zoomOut'],
      ['Ctrl+0', 'shortcuts.zoomReset'],
      ['F11', 'menu.fullscreen'],
      ['Esc', 'shortcuts.escape'],
    ],
  },
  {
    group: 'shortcuts.app',
    items: [
      ['Ctrl+,', 'menu.settings'],
      ['F1', 'menu.shortcuts'],
      ['Alt / F10', 'shortcuts.menu'],
    ],
  },
];

export function openShortcuts(): void {
  const m = new Modal(t('menu.shortcuts'));
  for (const g of SHORTCUTS) {
    const table = h('table', { class: 'shortcuts' });
    for (const [keys, label] of g.items) {
      table.append(
        h('tr', {}, h('td', {}, t(label as 'menu.open')), h('td', {}, ...keys.split(' / ').flatMap((k, i) => [i ? ' / ' : '', h('kbd', {}, k)]))),
      );
    }
    m.body.append(h('h3', { class: 'shortcuts-group' }, t(g.group as 'shortcuts.file')), table);
  }
  m.show();
}

type Meta = typeof meta;

export function socialLinks(m: Meta): { label: string; url: string }[] {
  const s = m.social as Record<string, string>;
  const names: Record<string, string> = { github: 'GitHub', linkedin: 'LinkedIn', instagram: 'Instagram', facebook: 'Facebook', x: 'X' };
  return Object.entries(s)
    .filter(([, url]) => typeof url === 'string' && /^https:\/\//.test(url))
    .map(([k, url]) => ({ label: names[k] ?? k, url }));
}

export function openAbout(version: string, webview: string | null, openUrl: (u: string) => void, openNotices: () => void): void {
  const m = new Modal(t('about.title', { product: meta.productName }));
  const link = (label: string, url: string) =>
    h('button', { type: 'button', class: 'link-btn', title: url, onclick: () => openUrl(url) }, label);
  const links: HTMLElement[] = [];
  if (meta.urls.website) links.push(link(t('about.website'), meta.urls.website));
  if (meta.urls.repository) links.push(link(t('about.repository'), meta.urls.repository));
  if (meta.urls.support) links.push(link(`${t('menu.support')} ♥`, meta.urls.support));
  if (meta.urls.license) links.push(link(t('about.license'), meta.urls.license));
  for (const s of socialLinks(meta)) links.push(link(s.label, s.url));
  m.body.append(
    h(
      'div',
      { class: 'about' },
      icon(ICONS.logo, 'about-logo'),
      wordmark('h3'),
      h('p', {}, meta.tagline),
      h('p', { class: 'about-meta' }, `${t('about.version', { v: version })} · ${meta.copyright.replace(/^Copyright\s*/, '')}`),
      h('p', { class: 'about-meta' }, t('about.createdBy', { author: meta.author }), ' · ', meta.publisher, ' · ', meta.urls.website.replace(/^https?:\/\//, '')),
      meta.contactEmail ? h('p', { class: 'about-meta' }, meta.contactEmail) : null,
      links.length ? h('div', { class: 'about-links' }, ...links) : null,
      h('p', { class: 'about-small' }, t('about.privacy')),
      h('p', { class: 'about-small' }, webview ? t('about.webview', { v: webview }) : ''),
      h('button', { type: 'button', class: 'link-btn about-small', onclick: () => openNotices() }, t('about.notices')),
    ),
  );
  m.show();
}

/** Compares dotted versions; prerelease suffixes are ignored. */
export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

/** `https://github.com/owner/repo` → API URL for the latest release. */
export function releasesApi(repoUrl: string): string | null {
  const m = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(repoUrl.trim());
  return m ? `https://api.github.com/repos/${m[1]}/${m[2]}/releases/latest` : null;
}

/** User-initiated only: MDVibe never checks for updates in the background. */
export async function checkForUpdates(current: string, openUrl: (u: string) => void): Promise<void> {
  const api = releasesApi(meta.urls.repository);
  const m = new Modal(t('updates.title'));
  const status = h('p', {}, t('updates.checking'));
  m.body.append(status);
  m.show();
  if (!api) {
    status.textContent = t('updates.unavailable');
    return;
  }
  try {
    const res = await fetch(api, { headers: { Accept: 'application/vnd.github+json' }, referrerPolicy: 'no-referrer', credentials: 'omit' });
    if (res.status === 404) {
      status.textContent = t('updates.none');
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    const latest = String(data.tag_name ?? '');
    if (latest && isNewer(latest, current)) {
      status.textContent = t('updates.available', { v: latest.replace(/^v/i, ''), current });
      const url = typeof data.html_url === 'string' && data.html_url.startsWith('https://github.com/') ? data.html_url : meta.urls.releases || meta.urls.repository;
      m.body.append(h('button', { type: 'button', class: 'btn primary', onclick: () => openUrl(url) }, t('updates.download')));
    } else {
      status.textContent = t('updates.latest', { v: current });
    }
  } catch (e) {
    status.textContent = t('updates.failed', { error: String(e instanceof Error ? e.message : e) });
  }
}

/** Brand wordmark: "MD" in text color, "Vibe" in primary. */
export function wordmark(tag: 'h1' | 'h3'): HTMLElement {
  const name = meta.productName;
  const split = name.startsWith('MD') ? 2 : name.length;
  return h(tag, { class: 'wordmark', 'aria-label': name }, name.slice(0, split), h('span', {}, name.slice(split)));
}

export { meta };
