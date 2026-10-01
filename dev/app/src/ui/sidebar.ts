/** Collapsible sidebar: document outline and recent documents. */
import { clear, h, icon, relativeTime } from './dom';
import { ICONS } from './icons';
import { t } from '../i18n';
import type { Heading } from '../markdown/engine';
import type { RecentItem } from '../core/backend';

export interface SidebarCallbacks {
  onHeading(h: Heading): void;
  onRecentOpen(item: RecentItem): void;
  onRecentMenu(item: RecentItem, at: { x: number; y: number } | HTMLElement): void;
  onClearRecent(): void;
  onTab(tab: 'outline' | 'recent'): void;
  onOpenSettings(): void;
}

/** Above this many headings the outline is built in chunks to keep input responsive. */
const OUTLINE_CHUNK = 400;

export class Sidebar {
  readonly el: HTMLElement;
  private outline: HTMLElement;
  private recent: HTMLElement;
  private tabs: Record<'outline' | 'recent', HTMLButtonElement>;
  private items: HTMLElement[] = [];
  private headings: Heading[] = [];
  private activeIdx = -1;
  private buildToken = 0;
  tab: 'outline' | 'recent' = 'outline';

  constructor(private cb: SidebarCallbacks) {
    const mkTab = (id: 'outline' | 'recent', label: string, ic: string) =>
      h(
        'button',
        { type: 'button', role: 'tab', class: 'side-tab', id: `tab-${id}`, 'aria-controls': `panel-${id}`, onclick: () => this.setTab(id, true) },
        icon(ic),
        h('span', {}, label),
      );
    this.tabs = { outline: mkTab('outline', t('sidebar.outline'), ICONS.outline), recent: mkTab('recent', t('sidebar.recent'), ICONS.clock) };
    this.outline = h('nav', { class: 'side-panel outline', id: 'panel-outline', role: 'tabpanel', 'aria-labelledby': 'tab-outline' });
    this.recent = h('div', { class: 'side-panel recent', id: 'panel-recent', role: 'tabpanel', 'aria-labelledby': 'tab-recent' });
    this.el = h(
      'aside',
      { class: 'sidebar', 'aria-label': t('sidebar.label') },
      h('div', { class: 'side-tabs', role: 'tablist' }, this.tabs.outline, this.tabs.recent),
      this.outline,
      this.recent,
    );
    this.setTab('outline', false);
  }

  setTab(tab: 'outline' | 'recent', user: boolean): void {
    this.tab = tab;
    for (const [k, b] of Object.entries(this.tabs)) {
      b.setAttribute('aria-selected', String(k === tab));
      b.tabIndex = k === tab ? 0 : -1;
    }
    this.outline.hidden = tab !== 'outline';
    this.recent.hidden = tab !== 'recent';
    if (user) this.cb.onTab(tab);
  }

  setHeadings(list: Heading[]): void {
    this.headings = list;
    this.items = [];
    this.activeIdx = -1;
    clear(this.outline);
    if (!list.length) {
      this.outline.append(h('p', { class: 'side-empty' }, t('sidebar.noHeadings')));
      return;
    }
    const min = Math.min(...list.map((x) => x.level));
    const token = ++this.buildToken;
    const build = (from: number) => {
      if (token !== this.buildToken) return;
      const frag = document.createDocumentFragment();
      const end = Math.min(list.length, from + OUTLINE_CHUNK);
      for (let i = from; i < end; i++) {
        const hd = list[i];
        const a = h(
          'a',
          { class: 'toc-item', href: `#${hd.id}`, 'data-depth': String(Math.min(hd.level - min, 4)), title: hd.text },
          hd.text || '—',
        );
        a.addEventListener('click', (e) => {
          e.preventDefault();
          this.cb.onHeading(hd);
          this.setActive(i);
        });
        this.items.push(a);
        frag.append(a);
      }
      this.outline.append(frag);
      if (end < list.length) requestAnimationFrame(() => build(end));
    };
    build(0);
  }

  setActive(i: number): void {
    if (i === this.activeIdx) return;
    this.items[this.activeIdx]?.classList.remove('active');
    this.items[this.activeIdx]?.removeAttribute('aria-current');
    this.activeIdx = i;
    const el = this.items[i];
    if (!el) return;
    el.classList.add('active');
    el.setAttribute('aria-current', 'location');
    const box = this.outline.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) el.scrollIntoView({ block: 'nearest' });
  }

  get headingList(): Heading[] {
    return this.headings;
  }

  setRecent(items: RecentItem[], enabled: boolean, currentPath: string | null): void {
    clear(this.recent);
    if (!enabled) {
      this.recent.append(
        h('p', { class: 'side-empty' }, t('sidebar.recentOff')),
        h('button', { type: 'button', class: 'link-btn', onclick: () => this.cb.onOpenSettings() }, t('sidebar.privacySettings')),
      );
      if (!items.length) return;
    }
    if (!items.length) {
      this.recent.append(h('p', { class: 'side-empty' }, t('sidebar.noRecent')));
      return;
    }
    const list = h('ul', { class: 'recent-list' });
    for (const it of items) list.append(recentRow(it, this.cb, currentPath));
    this.recent.append(
      list,
      h('div', { class: 'side-foot' }, h('button', { type: 'button', class: 'link-btn', onclick: () => this.cb.onClearRecent() }, t('recent.clear'))),
    );
  }
}

export function recentRow(it: RecentItem, cb: Pick<SidebarCallbacks, 'onRecentOpen' | 'onRecentMenu'>, currentPath: string | null): HTMLElement {
  const isCurrent = currentPath !== null && currentPath.toLowerCase() === it.path.toLowerCase();
  const more = h('button', { type: 'button', class: 'icon-btn recent-more', title: t('recent.actions'), 'aria-label': t('recent.actionsFor', { name: it.name }) }, icon(ICONS.more));
  more.addEventListener('click', (e) => {
    e.stopPropagation();
    cb.onRecentMenu(it, more);
  });
  const row = h(
    'li',
    {
      class: `recent-item${it.exists ? '' : ' missing'}${isCurrent ? ' current' : ''}`,
      title: it.path,
    },
    h(
      'button',
      { type: 'button', class: 'recent-open', 'aria-label': `${it.name} — ${it.path}` },
      h('span', { class: 'recent-name' }, it.pinned ? icon(ICONS.pin, 'icon pin') : null, h('span', {}, it.name)),
      h('span', { class: 'recent-meta' }, it.exists ? `${relativeTime(it.openedAt)} · ${it.dir}` : `${t('recent.missing')} · ${it.dir}`),
    ),
    more,
  );
  row.querySelector('.recent-open')!.addEventListener('click', () => cb.onRecentOpen(it));
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    cb.onRecentMenu(it, { x: e.clientX, y: e.clientY });
  });
  return row;
}
