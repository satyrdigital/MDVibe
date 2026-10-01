/**
 * MDVibe window controller. One window shows at most one document for its
 * whole lifetime; opening anything else starts a new, independent instance.
 */
import type { Backend, DocumentError, LoadedDocument, RecentItem, StartupInfo } from '../core/backend';
import { clone, normalize, type Settings, type Theme } from '../core/settings';
import { layoutVars, pageRule, pdfOptions } from '../core/layout';
import { renderMarkdown } from '../markdown/pipeline';
import { buildFragment } from '../markdown/sanitize';
import { copyText, decorateCodeBlocks, highlightAll } from '../markdown/codeblocks';
import type { Heading } from '../markdown/engine';
import { clear, formatBytes, h, icon } from './dom';
import { ICONS } from './icons';
import { closeAllMenus, isMenuOpen, openMenu, type MenuEntry } from './menu';
import { closeModal, isModalOpen, Modal } from './modal';
import { toast } from './toast';
import { FindBar } from './find';
import { recentRow, Sidebar } from './sidebar';
import { LayoutPanel, openSettings, type SettingsTab } from './settings-ui';
import { checkForUpdates, meta, openAbout, openShortcuts, releasesApi, wordmark } from './dialogs';
import { LANGUAGES, resolveLanguage, systemLanguage, t } from '../i18n';

const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
/** Above this size the document opens in Source view first (rendering is offered). */
const RENDER_SOFT_LIMIT = 24 * 1024 * 1024;
/** Above this size a "rendering…" indicator is shown. */
const SLOW_RENDER_BYTES = 2 * 1024 * 1024;
/** Above this size off-screen blocks are laid out lazily (content-visibility). */
const LARGE_LAYOUT_BYTES = 200 * 1024;

type Mode = 'welcome' | 'loading' | 'document' | 'error';

interface ScrollAnchor {
  line: number;
  offset: number;
  atBottom: boolean;
  ratio: number;
}

export class App {
  private settings: Settings;
  private doc: LoadedDocument | null = null;
  private mode: Mode = 'welcome';
  private zoom = 1;
  private sourceView = false;
  private allowRemoteThisWindow = false;
  private alwaysOnTop = false;
  private fullscreen = false;
  private recent: RecentItem[] = [];
  private headingEls: HTMLElement[] = [];
  private renderSeq = 0;
  private saveTimer = 0;
  private lastSavedJson = '';
  private changedOnDisk = false;
  private pageSheet = new CSSStyleSheet();

  // DOM
  private root!: HTMLElement;
  private toolbar!: HTMLElement;
  private titleEl!: HTMLElement;
  private viewport!: HTMLElement;
  private banners!: HTMLElement;
  private sheet!: HTMLElement;
  private article!: HTMLElement;
  private sourceEl!: HTMLPreElement;
  private stateView!: HTMLElement;
  private dropOverlay!: HTMLElement;
  private menuBtn!: HTMLButtonElement;
  private layoutBtn!: HTMLButtonElement;
  private themeBtn!: HTMLButtonElement;
  private sidebar!: Sidebar;
  private find!: FindBar;
  private layoutPanel!: LayoutPanel;

  constructor(
    private backend: Backend,
    private info: StartupInfo,
  ) {
    this.settings = normalize(info.settings);
    this.lastSavedJson = JSON.stringify(this.settings);
  }

  // ───────────────────────────── setup ─────────────────────────────

  async start(): Promise<void> {
    this.buildDom();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, this.pageSheet];
    this.applySettings(null);
    this.bindGlobalEvents();
    await this.bindBackendEvents();
    void this.refreshRecent();

    const t0 = performance.now();
    const restore = takeRestoreState();
    if (this.info.launchFile) await this.loadHere(this.info.launchFile);
    else if (restore?.path) await this.loadHere(restore.path);
    else this.showWelcome();
    if (restore) this.applyRestoreState(restore);
    const renderMs = performance.now() - t0;

    // Show the window after the first paint (no white flash).
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void this.backend.ready({ renderMs, docBytes: this.doc?.bytes });
        this.viewport.focus({ preventScroll: true });
      }),
    );
  }

  private buildDom(): void {
    const iconBtn = (ic: string, label: string, onclick: (e: MouseEvent) => void, extra: Record<string, string> = {}) =>
      h('button', { type: 'button', class: 'icon-btn', title: label, 'aria-label': label, onclick: onclick as EventListener, ...extra }, icon(ic));

    this.titleEl = h('div', { class: 'doc-title', title: '' });
    this.layoutBtn = iconBtn(ICONS.type, t('toolbar.layout'), () => this.layoutPanel.toggle(this.layoutBtn), { 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
    this.menuBtn = iconBtn(ICONS.more, t('toolbar.menu'), () => this.openMainMenu(), { 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
    this.themeBtn = iconBtn(ICONS.monitor, '', () => this.cycleTheme());
    this.toolbar = h(
      'header',
      { class: 'toolbar' },
      iconBtn(ICONS.sidebar, `${t('menu.sidebar')} (Ctrl+Shift+B)`, () => this.toggleSidebar()),
      this.titleEl,
      h('div', { class: 'toolbar-spacer' }),
      iconBtn(ICONS.search, `${t('menu.find')} (Ctrl+F)`, () => this.openFind()),
      this.themeBtn,
      this.layoutBtn,
      this.menuBtn,
    );

    this.sidebar = new Sidebar({
      onHeading: (hd) => this.scrollToHeading(hd),
      onRecentOpen: (it) => this.openRecent(it),
      onRecentMenu: (it, at) => this.recentMenu(it, at),
      onClearRecent: () => this.clearRecent(),
      onTab: (tab) => this.update((s) => { s.ui.sidebarTab = tab; }),
      onOpenSettings: () => this.openSettings('privacy'),
    });

    this.banners = h('div', { class: 'banners', role: 'region', 'aria-label': t('banners.label') });
    this.article = h('article', { class: 'md', 'aria-live': 'off' });
    this.sourceEl = h('pre', { class: 'source-view', hidden: true });
    this.stateView = h('div', { class: 'state-view', hidden: true });
    this.sheet = h('div', { class: 'sheet' }, this.article, this.sourceEl);
    this.viewport = h(
      'main',
      { class: 'viewport', tabindex: '-1', 'aria-label': t('viewport.label') },
      this.banners,
      this.stateView,
      h('div', { class: 'canvas' }, this.sheet),
    );
    this.find = new FindBar(() => (this.mode !== 'document' ? null : this.sourceView ? this.sourceEl : this.article), this.viewport);
    this.layoutPanel = new LayoutPanel(() => this.settings, this.update, (tab) => this.openSettings(tab));
    this.dropOverlay = h('div', { class: 'drop-overlay', hidden: true }, h('div', { class: 'drop-card' }, icon(ICONS.file), h('span', { class: 'drop-text' }, '')));

    this.root = h(
      'div',
      { class: 'app' },
      this.toolbar,
      h('div', { class: 'workspace' }, this.sidebar.el, this.viewport, this.find.el),
      this.layoutPanel.el,
      this.dropOverlay,
    );
    document.body.append(this.root);

    this.article.addEventListener('click', (e) => this.onDocClick(e));
    this.article.addEventListener('auxclick', (e) => {
      if (e.button === 1) this.onDocClick(e);
    });
    this.viewport.addEventListener('contextmenu', (e) => this.onContextMenu(e));
    let spyQueued = false;
    this.viewport.addEventListener(
      'scroll',
      () => {
        if (spyQueued) return;
        spyQueued = true;
        requestAnimationFrame(() => {
          spyQueued = false;
          this.scrollSpy();
        });
      },
      { passive: true },
    );
    this.viewport.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        this.stepZoom(e.deltaY < 0 ? 1 : -1);
      },
      { passive: false },
    );
    // Reveal the toolbar in full-screen mode when the pointer reaches the top edge.
    this.root.addEventListener('mousemove', (e) => {
      if (!this.fullscreen) return;
      this.root.classList.toggle('reveal-toolbar', e.clientY < 8 || (this.root.classList.contains('reveal-toolbar') && e.clientY < 52));
    });
  }

  // ─────────────────────────── settings ───────────────────────────

  update = (mutate: (s: Settings) => void): void => {
    const before = clone(this.settings);
    mutate(this.settings);
    this.settings = normalize(this.settings);
    this.applySettings(before);
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveSettings(), 300);
  };

  private saveSettings(): void {
    const json = JSON.stringify(this.settings);
    if (json === this.lastSavedJson) return;
    this.lastSavedJson = json;
    this.backend.saveSettings(this.settings).catch((e) => {
      this.backend.log('error', `settings save failed: ${e}`);
      toast(t('error.settingsSave'), { kind: 'error' });
    });
  }

  private resolvedTheme(): 'light' | 'dark' {
    const th = this.settings.appearance.theme;
    if (th !== 'system') return th;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private applySettings(before: Settings | null): void {
    const s = this.settings;
    const html = document.documentElement;
    html.dataset.theme = this.resolvedTheme();
    html.dataset.mdstyle = s.appearance.style;
    html.dataset.headingAccent = String(s.appearance.headingAccent);
    html.dataset.codeBg = String(s.code.background);
    html.dataset.printTheme = s.page.printTheme;
    html.dataset.printBg = String(s.page.printBackgrounds);
    this.viewport.dataset.view = s.page.view;
    for (const [k, v] of Object.entries(layoutVars(s, this.zoom))) html.style.setProperty(k, v);
    this.pageSheet.replaceSync(pageRule(s));
    this.root.classList.toggle('no-sidebar', !s.ui.sidebarVisible);
    this.sidebar.setTab(s.ui.sidebarTab, false);

    if (!before || before.appearance.theme !== s.appearance.theme) {
      void this.backend.setTheme(s.appearance.theme === 'system' ? null : s.appearance.theme).catch(() => {});
      this.updateThemeButton();
    }
    if (!before) return;
    if (resolveLanguage(before.appearance.language) !== resolveLanguage(s.appearance.language)) {
      this.reloadForLanguage();
      return;
    }
    const needsRender =
      before.documents.rawHtml !== s.documents.rawHtml ||
      before.documents.remoteImages !== s.documents.remoteImages ||
      before.code.syntaxHighlighting !== s.code.syntaxHighlighting ||
      before.code.lineNumbers !== s.code.lineNumbers ||
      before.code.wrap !== s.code.wrap;
    if (needsRender && this.doc && !this.sourceView) void this.renderDocument(true);
    if (before.privacy.rememberRecent !== s.privacy.rememberRecent) this.renderRecentViews();
  }

  private static readonly THEME_ORDER: Theme[] = ['system', 'light', 'dark'];

  private themeLabel(theme: Theme): string {
    return t(`appearance.theme.${theme}` as 'appearance.theme.system');
  }

  private updateThemeButton(): void {
    const theme = this.settings.appearance.theme;
    const ic = theme === 'light' ? ICONS.sun : theme === 'dark' ? ICONS.moon : ICONS.monitor;
    this.themeBtn.replaceChildren(icon(ic));
    const label = t('toolbar.theme', { mode: this.themeLabel(theme) });
    this.themeBtn.title = label;
    this.themeBtn.setAttribute('aria-label', label);
  }

  /** System → Light → Dark → System. */
  private cycleTheme(): void {
    const order = App.THEME_ORDER;
    const next = order[(order.indexOf(this.settings.appearance.theme) + 1) % order.length];
    this.setTheme(next);
  }

  private setTheme(theme: Theme): void {
    this.update((s) => {
      s.appearance.theme = theme;
    });
    toast(t('toast.theme', { mode: this.themeLabel(theme) }), { ms: 1200 });
  }

  private setLanguageSetting(language: Settings['appearance']['language']): void {
    this.update((s) => {
      s.appearance.language = language;
    });
  }

  /**
   * The whole UI is re-created in the new language: the window keeps its
   * document, scroll position, zoom and view mode across the reload.
   */
  private reloadForLanguage(): void {
    window.clearTimeout(this.saveTimer);
    this.saveSettings();
    const state: RestoreState = {
      path: this.doc?.path ?? null,
      scrollTop: this.viewport.scrollTop,
      zoom: this.zoom,
      sourceView: this.sourceView,
      sidebarVisible: this.settings.ui.sidebarVisible,
    };
    try {
      sessionStorage.setItem(RESTORE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable: the reload still works, without restoring state */
    }
    window.setTimeout(() => location.reload(), 150);
  }

  private applyRestoreState(r: RestoreState): void {
    if (r.zoom !== 1) this.setZoom(r.zoom, false);
    if (r.sourceView) this.setSourceView(true);
    if (this.settings.ui.sidebarVisible !== r.sidebarVisible) {
      this.settings.ui.sidebarVisible = r.sidebarVisible;
      this.root.classList.toggle('no-sidebar', !r.sidebarVisible);
    }
    // Set now (layout is current after rendering) and once more after fonts settle.
    this.viewport.scrollTop = r.scrollTop;
    void document.fonts?.ready.then(() => {
      this.viewport.scrollTop = r.scrollTop;
    });
  }

  /** Another instance saved settings: adopt everything except this window's UI state. */
  private async onExternalSettings(): Promise<void> {
    let fresh: Settings;
    try {
      fresh = normalize(await this.backend.loadSettings());
    } catch {
      return;
    }
    fresh.ui = this.settings.ui;
    const json = JSON.stringify(fresh);
    if (json === JSON.stringify(this.settings)) return;
    const before = this.settings;
    this.settings = fresh;
    this.lastSavedJson = json;
    this.applySettings(before);
  }

  private openSettings(tab: SettingsTab = 'appearance'): void {
    this.layoutPanel.close();
    openSettings(() => this.settings, this.update, { clearRecent: () => this.clearRecent() }, tab);
  }

  // ─────────────────────────── documents ───────────────────────────

  private async loadHere(path: string): Promise<void> {
    this.mode = 'loading';
    this.setTitle(path.split(/[\\/]/).pop() ?? path, path);
    let doc: LoadedDocument;
    try {
      doc = await this.backend.openDocument(path);
    } catch (e) {
      this.showError(e as DocumentError, path);
      return;
    }
    this.doc = doc;
    this.mode = 'document';
    this.stateView.hidden = true;
    this.changedOnDisk = false;
    this.root.classList.add('has-doc');
    this.setTitle(doc.name, doc.path);
    if (doc.bytes > RENDER_SOFT_LIMIT) {
      this.sourceView = true;
      this.banner('large', 'info', t('banner.large', { size: formatBytes(doc.bytes) }), [
        { label: t('banner.renderAnyway'), run: () => this.setSourceView(false) },
      ]);
    }
    await this.renderDocument(false);
    void this.refreshRecent();
  }

  private async reload(user: boolean): Promise<void> {
    if (!this.doc) return;
    try {
      const doc = await this.backend.reloadDocument();
      this.doc = doc;
      this.changedOnDisk = false;
      this.removeBanner('changed');
      this.removeBanner('deleted');
      await this.renderDocument(true);
      if (user) toast(t('toast.reloaded'));
    } catch (e) {
      const err = e as DocumentError;
      if (err.kind === 'notFound') this.onDeleted();
      else if (err.kind === 'locked') {
        // Writer still busy; the watcher will fire again when it finishes.
        if (user) toast(t('error.locked.title'), { kind: 'error' });
      } else {
        this.backend.log('warn', `reload failed: ${err.kind}`);
        if (user) toast(t('error.reload'), { kind: 'error' });
      }
    }
  }

  private onDeleted(): void {
    this.banner('deleted', 'warn', t('banner.deleted'), [{ label: t('menu.reload'), run: () => void this.reload(true) }]);
  }

  private captureScroll(): ScrollAnchor | null {
    const vp = this.viewport;
    const max = vp.scrollHeight - vp.clientHeight;
    const atBottom = max > 0 && vp.scrollTop >= max - 4;
    const ratio = max > 0 ? vp.scrollTop / max : 0;
    if (this.sourceView) return { line: -1, offset: vp.scrollTop, atBottom, ratio };
    const top = vp.getBoundingClientRect().top;
    const els = this.article.querySelectorAll<HTMLElement>('[data-line]');
    // Binary search for the first block whose bottom is below the viewport top.
    let lo = 0;
    let hi = els.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (els[mid].getBoundingClientRect().bottom > top) {
        found = mid;
        hi = mid - 1;
      } else lo = mid + 1;
    }
    if (found < 0) return { line: -1, offset: vp.scrollTop, atBottom, ratio };
    const el = els[found];
    return { line: Number(el.dataset.line), offset: el.getBoundingClientRect().top - top, atBottom, ratio };
  }

  private restoreScroll(a: ScrollAnchor | null): void {
    const vp = this.viewport;
    if (!a) {
      vp.scrollTop = 0;
      return;
    }
    if (a.atBottom) {
      vp.scrollTop = vp.scrollHeight;
      return;
    }
    if (a.line < 0 || this.sourceView) {
      vp.scrollTop = a.offset;
      return;
    }
    const els = this.article.querySelectorAll<HTMLElement>('[data-line]');
    let best: HTMLElement | null = null;
    for (const el of els) {
      const l = Number(el.dataset.line);
      if (l <= a.line) best = el;
      else break;
    }
    if (!best) {
      vp.scrollTop = a.ratio * (vp.scrollHeight - vp.clientHeight);
      return;
    }
    vp.scrollTop += best.getBoundingClientRect().top - vp.getBoundingClientRect().top - a.offset;
  }

  private async renderDocument(preserveScroll: boolean): Promise<void> {
    const doc = this.doc;
    if (!doc) return;
    const seq = ++this.renderSeq;
    const anchor = preserveScroll ? this.captureScroll() : null;
    const slow = doc.bytes > SLOW_RENDER_BYTES && !this.sourceView;
    if (slow) this.banner('rendering', 'info', t('banner.rendering', { size: formatBytes(doc.bytes) }), [], false);
    this.root.classList.toggle('source-mode', this.sourceView);

    if (this.sourceView) {
      this.article.hidden = true;
      this.sourceEl.hidden = false;
      this.sourceEl.textContent = doc.text;
      this.sidebar.setHeadings(this.sidebar.headingList);
    } else {
      let result;
      try {
        result = await renderMarkdown(doc.text, { rawHtml: this.settings.documents.rawHtml });
      } catch (e) {
        this.backend.log('error', `render failed: ${e}`);
        this.removeBanner('rendering');
        this.banner('render-failed', 'warn', t('banner.renderFailed'), [{ label: t('menu.source'), run: () => this.setSourceView(true) }]);
        return;
      }
      if (seq !== this.renderSeq) return;
      const remote = this.settings.documents.remoteImages || this.allowRemoteThisWindow;
      const { fragment, info } = buildFragment(result.html, result.hasRawHtml, { imageBase: this.info.imageBase, remoteImages: remote });
      this.sourceEl.hidden = true;
      this.sourceEl.textContent = '';
      this.article.hidden = false;
      this.article.classList.toggle('large', doc.bytes > LARGE_LAYOUT_BYTES);
      this.article.replaceChildren(fragment);
      decorateCodeBlocks(this.article, { highlight: this.settings.code.syntaxHighlighting, lineNumbers: this.settings.code.lineNumbers, wrap: this.settings.code.wrap }, this.viewport);
      this.headingEls = result.headings.map((hd) => this.findAnchor(hd.id) as HTMLElement);
      this.sidebar.setHeadings(result.headings);
      if (info.blockedImages > 0) {
        this.banner('remote', 'info', t('banner.remoteBlocked', { n: info.blockedImages }), [
          { label: t('banner.loadImages'), run: () => { this.allowRemoteThisWindow = true; this.removeBanner('remote'); void this.renderDocument(true); } },
          { label: t('banner.alwaysLoad'), run: () => { this.removeBanner('remote'); this.update((s) => { s.documents.remoteImages = true; }); } },
        ]);
      } else this.removeBanner('remote');
    }
    this.removeBanner('rendering');
    this.removeBanner('render-failed');
    this.restoreScroll(anchor);
    this.scrollSpy();
    this.find.refresh();
  }

  private setSourceView(on: boolean): void {
    if (!this.doc || this.sourceView === on) return;
    this.sourceView = on;
    if (!on) this.removeBanner('large');
    void this.renderDocument(false);
  }

  private showWelcome(): void {
    this.mode = 'welcome';
    this.setTitle(t('welcome.title'), '');
    this.stateView.hidden = false;
    this.root.classList.remove('has-doc');
    this.renderWelcome();
  }

  private renderWelcome(): void {
    if (this.mode !== 'welcome') return;
    clear(this.stateView);
    const items = this.settings.privacy.rememberRecent ? this.recent.slice(0, 8) : [];
    const list = h('ul', { class: 'recent-list welcome-recent' });
    for (const it of items) list.append(recentRow(it, { onRecentOpen: (x) => this.openRecent(x), onRecentMenu: (x, at) => this.recentMenu(x, at) }, null));
    this.stateView.append(
      h(
        'div',
        { class: 'welcome' },
        icon(ICONS.logo, 'welcome-logo'),
        wordmark('h1'),
        h('p', { class: 'welcome-tag' }, meta.tagline),
        h('button', { type: 'button', class: 'btn primary', onclick: () => void this.openDialog() }, icon(ICONS.folder), h('span', {}, t('welcome.open')), h('kbd', {}, 'Ctrl+O')),
        h('div', { class: 'dropzone' }, t('welcome.drop')),
        items.length ? h('div', { class: 'welcome-recent-wrap' }, h('h2', {}, t('sidebar.recent')), list) : null,
      ),
    );
  }

  private showError(err: DocumentError, path: string): void {
    this.mode = 'error';
    this.doc = null;
    this.root.classList.remove('has-doc');
    const kind = err?.kind ?? 'other';
    const titles: Record<string, [string, string]> = {
      notFound: [t('error.notFound.title'), t('error.notFound.text')],
      accessDenied: [t('error.access.title'), t('error.access.text')],
      locked: [t('error.locked.title'), t('error.locked.text')],
      isDirectory: [t('error.dir.title'), t('error.dir.text')],
      tooLarge: [t('error.large.title'), t('error.large.text')],
      notText: [t('error.notText.title'), t('error.notText.text')],
      other: [t('error.other.title'), t('error.other.text')],
    };
    const [title, text] = titles[kind] ?? titles.other;
    this.setTitle(title, path);
    this.backend.log('warn', `open failed: ${kind}`);
    clear(this.stateView);
    this.stateView.hidden = false;
    const details = h('details', { class: 'error-details' }, h('summary', {}, t('error.details')), h('pre', {}, `${path}\n${err?.detail ?? String(err)}`));
    this.stateView.append(
      h(
        'div',
        { class: 'error-view', role: 'alert' },
        icon(ICONS.warn, 'error-icon'),
        h('h1', {}, title),
        h('p', {}, text),
        h('p', { class: 'error-path' }, path),
        h(
          'div',
          { class: 'error-actions' },
          h('button', { type: 'button', class: 'btn primary', onclick: () => void this.loadHere(path) }, t('error.retry')),
          h('button', { type: 'button', class: 'btn', onclick: () => void this.openDialog() }, t('menu.open')),
        ),
        details,
      ),
    );
  }

  private setTitle(name: string, path: string): void {
    this.titleEl.textContent = name;
    this.titleEl.title = path;
    document.title = name ? `${name} — ${meta.productName}` : meta.productName;
  }

  /** Opens a path: here if this window is empty, otherwise in a new instance. */
  private async openPath(path: string): Promise<void> {
    if (this.doc && this.doc.path.toLowerCase() === path.toLowerCase()) {
      toast(t('toast.alreadyOpen'));
      return;
    }
    if (this.mode === 'welcome' || this.mode === 'error') {
      await this.loadHere(path);
      return;
    }
    try {
      await this.backend.openInNewWindow(path);
    } catch (e) {
      toast(String(e), { kind: 'error' });
    }
  }

  private async openDialog(): Promise<void> {
    const path = await this.backend.pickMarkdownFile().catch(() => null);
    if (path) await this.openPath(path);
  }

  // ─────────────────────────── recent ───────────────────────────

  private async refreshRecent(): Promise<void> {
    try {
      this.recent = await this.backend.recentList();
    } catch {
      this.recent = [];
    }
    this.renderRecentViews();
  }

  private renderRecentViews(): void {
    this.sidebar.setRecent(this.recent, this.settings.privacy.rememberRecent, this.doc?.path ?? null);
    this.renderWelcome();
  }

  private openRecent(it: RecentItem): void {
    if (!it.exists) {
      toast(t('recent.missingToast', { name: it.name }), {
        kind: 'error',
        action: { label: t('recent.remove'), run: () => void this.backend.recentRemove(it.path).then(() => this.refreshRecent()) },
      });
      return;
    }
    void this.openPath(it.path);
  }

  private recentMenu(it: RecentItem, at: { x: number; y: number } | HTMLElement): void {
    const entries: MenuEntry[] = [
      { label: t('recent.open'), action: () => this.openRecent(it), disabled: !it.exists },
      { label: t('menu.openLocation'), action: () => this.reveal(it.path), disabled: !it.exists },
      { label: t('menu.copyPath'), action: () => void this.copy(it.path) },
      'separator',
      { label: it.pinned ? t('recent.unpin') : t('recent.pin'), action: () => void this.backend.recentSetPinned(it.path, !it.pinned).then(() => this.refreshRecent()) },
      { label: t('recent.remove'), action: () => void this.backend.recentRemove(it.path).then(() => this.refreshRecent()) },
    ];
    openMenu(entries, at);
  }

  private clearRecent(): void {
    const m = new Modal(t('recent.clearTitle'));
    m.body.append(
      h('p', {}, t('recent.clearText')),
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, t('common.cancel')),
        h('button', { type: 'button', class: 'btn danger', onclick: async () => { m.close(); await this.backend.recentClear(); await this.refreshRecent(); toast(t('recent.cleared')); } }, t('recent.clear')),
      ),
    );
    m.show();
  }

  // ─────────────────────────── navigation ───────────────────────────

  private findAnchor(id: string): Element | null {
    if (!id) return null;
    // getElementById uses the document's id map (O(1)); scoped selectors would
    // scan the whole article for every heading of a large document.
    for (const candidate of [id, `user-content-${id}`]) {
      const el = document.getElementById(candidate);
      if (el && this.article.contains(el)) return el;
    }
    const esc = CSS.escape(id);
    return (
      this.article.querySelector(`#user-content-${esc}`) ??
      this.article.querySelector(`[name="${esc}"]`) ??
      this.article.querySelector(`[name="user-content-${esc}"]`)
    );
  }

  private scrollToElement(el: Element): void {
    const vp = this.viewport;
    vp.scrollTop += el.getBoundingClientRect().top - vp.getBoundingClientRect().top - 12;
  }

  private scrollToHeading(hd: Heading): void {
    if (this.sourceView) {
      const lh = parseFloat(getComputedStyle(this.sourceEl).lineHeight) || 20;
      this.viewport.scrollTop = hd.line * lh * this.zoom;
      return;
    }
    const el = this.findAnchor(hd.id);
    if (el) this.scrollToElement(el);
  }

  private scrollSpy(): void {
    if (!this.headingEls.length || this.sourceView) return;
    const top = this.viewport.getBoundingClientRect().top + 80;
    let lo = 0;
    let hi = this.headingEls.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const el = this.headingEls[mid];
      if (el && el.getBoundingClientRect().top <= top) {
        idx = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    this.sidebar.setActive(Math.max(0, idx));
  }

  private onDocClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const blocked = target.closest('.img-blocked');
    if (blocked) {
      e.preventDefault();
      this.allowRemoteThisWindow = true;
      this.removeBanner('remote');
      void this.renderDocument(true);
      return;
    }
    const a = target.closest('a[href]');
    if (!a) return;
    e.preventDefault();
    void this.followLink(a.getAttribute('href') ?? '');
  }

  private async followLink(href: string): Promise<void> {
    if (href.startsWith('#')) {
      let id = href.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        /* keep raw */
      }
      const el = this.findAnchor(id);
      if (el) this.scrollToElement(el);
      else toast(t('toast.anchorMissing', { id }));
      return;
    }
    try {
      const r = await this.backend.activateLink(href);
      switch (r.kind) {
        case 'external':
          break;
        case 'markdown':
          toast(t('toast.openedNewWindow'));
          break;
        case 'localFile':
          toast(t('toast.localFile'), { action: { label: t('menu.openLocation'), run: () => this.reveal(r.path) } });
          break;
        case 'missing':
          toast(t('toast.linkMissing', { path: r.path }), { kind: 'error' });
          break;
        case 'blocked':
          toast(t('toast.linkBlocked'), { kind: 'error' });
          break;
      }
    } catch (e) {
      toast(String(e), { kind: 'error' });
    }
  }

  private reveal(path: string): void {
    this.backend.revealInFolder(path).catch((e) => toast(String(e), { kind: 'error' }));
  }

  private async copy(text: string, done = t('toast.copied')): Promise<void> {
    if (await copyText(text)) toast(done);
    else toast(t('code.copyFailed'), { kind: 'error' });
  }

  // ─────────────────────────── menus ───────────────────────────

  private recentSubmenu = (): MenuEntry[] => {
    if (!this.settings.privacy.rememberRecent && !this.recent.length) return [{ label: t('sidebar.recentOff'), disabled: true }];
    if (!this.recent.length) return [{ label: t('sidebar.noRecent'), disabled: true }];
    const entries: MenuEntry[] = this.recent.slice(0, 15).map((it) => ({
      label: it.name,
      title: it.path,
      disabled: !it.exists,
      action: () => this.openRecent(it),
    }));
    entries.push('separator', { label: t('recent.clear'), action: () => this.clearRecent() });
    return entries;
  };

  private openMainMenu(): void {
    const hasDoc = !!this.doc;
    const s = this.settings;
    const m = meta.urls;
    const help: MenuEntry[] = [{ label: t('menu.shortcuts'), shortcut: 'F1', action: () => openShortcuts() }];
    if (releasesApi(m.repository)) help.push({ label: t('menu.checkUpdates'), action: () => void checkForUpdates(this.info.version, (u) => this.openUrl(u)) });
    if (m.repository) help.push({ label: t('menu.repository'), action: () => this.openUrl(m.repository) });
    if (m.issues) help.push({ label: t('menu.reportIssue'), action: () => this.openUrl(m.issues) });
    if (m.support) help.push({ label: `${t('menu.support')} ♥`, action: () => this.openUrl(m.support) });
    help.push('separator', { label: t('menu.logFolder'), action: () => void this.backend.openLogFolder().catch(() => {}) }, { label: t('menu.about', { product: meta.productName }), action: () => this.about() });

    const entries: MenuEntry[] = [
      { label: t('menu.open'), shortcut: 'Ctrl+O', action: () => void this.openDialog() },
      { label: t('menu.openRecent'), submenu: this.recentSubmenu },
      { label: t('menu.newWindow'), shortcut: 'Ctrl+N', action: () => void this.backend.openInNewWindow(null) },
      'separator',
      { label: t('menu.reload'), shortcut: 'F5', disabled: !hasDoc, action: () => void this.reload(true) },
      { label: t('menu.openLocation'), disabled: !hasDoc, action: () => this.doc && this.reveal(this.doc.path) },
      {
        label: t('menu.copy'),
        disabled: !hasDoc,
        submenu: (): MenuEntry[] => [
          { label: t('menu.copyPath'), action: () => this.doc && void this.copy(this.doc.path) },
          { label: t('menu.copySource'), action: () => this.doc && void this.copy(this.doc.text) },
          { label: t('menu.copyText'), disabled: this.sourceView, action: () => void this.copy(this.article.innerText) },
        ],
      },
      'separator',
      { label: t('menu.print'), shortcut: 'Ctrl+P', disabled: !hasDoc, action: () => void this.print() },
      { label: t('menu.savePdf'), shortcut: 'Ctrl+Shift+S', disabled: !hasDoc, action: () => void this.savePdf() },
      'separator',
      {
        label: t('menu.view'),
        submenu: (): MenuEntry[] => [
          { label: t('menu.sidebar'), shortcut: 'Ctrl+Shift+B', checked: s.ui.sidebarVisible, action: () => this.toggleSidebar() },
          { label: t('sidebar.outline'), action: () => this.showSidebarTab('outline') },
          { label: t('sidebar.recent'), action: () => this.showSidebarTab('recent') },
          'separator',
          { label: t('menu.source'), shortcut: 'Ctrl+U', checked: this.sourceView, disabled: !hasDoc, action: () => this.setSourceView(!this.sourceView) },
          { label: t('menu.pageView'), checked: s.page.view === 'page', action: () => this.update((x) => { x.page.view = x.page.view === 'page' ? 'continuous' : 'page'; }) },
          { label: t('menu.layout'), shortcut: 'Ctrl+Shift+L', action: () => this.layoutPanel.open(this.layoutBtn) },
          'separator',
          { label: t('menu.zoomIn'), shortcut: 'Ctrl++', action: () => this.stepZoom(1) },
          { label: t('menu.zoomOut'), shortcut: 'Ctrl+-', action: () => this.stepZoom(-1) },
          { label: t('menu.zoomReset', { pct: Math.round(this.zoom * 100) }), shortcut: 'Ctrl+0', action: () => this.setZoom(1) },
          'separator',
          { label: t('menu.fullscreen'), shortcut: 'F11', checked: this.fullscreen, action: () => void this.toggleFullscreen() },
          { label: t('menu.onTop'), checked: this.alwaysOnTop, action: () => void this.toggleOnTop() },
        ],
      },
      { label: t('menu.find'), shortcut: 'Ctrl+F', disabled: !hasDoc, action: () => this.openFind() },
      {
        label: t('menu.theme'),
        submenu: (): MenuEntry[] =>
          App.THEME_ORDER.map((th) => ({
            label: this.themeLabel(th),
            checked: s.appearance.theme === th,
            shortcut: th === 'system' ? 'Ctrl+Shift+T' : undefined,
            action: () => this.setTheme(th),
          })),
      },
      {
        label: t('menu.language'),
        submenu: (): MenuEntry[] => [
          {
            label: t('language.system', { lang: LANGUAGES.find((l) => l.id === systemLanguage())?.name ?? 'English' }),
            checked: s.appearance.language === 'system',
            action: () => this.setLanguageSetting('system'),
          },
          'separator',
          ...LANGUAGES.map((l) => ({ label: l.name, checked: s.appearance.language === l.id, action: () => this.setLanguageSetting(l.id) })),
        ],
      },
      { label: t('menu.settings'), shortcut: 'Ctrl+,', action: () => this.openSettings() },
      { label: t('menu.help'), submenu: () => help },
      'separator',
      { label: t('menu.close'), shortcut: 'Ctrl+W', action: () => void this.backend.closeWindow() },
    ];
    openMenu(entries, this.menuBtn);
  }

  private onContextMenu(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea')) return;
    e.preventDefault();
    const sel = window.getSelection()?.toString() ?? '';
    const entries: MenuEntry[] = [];
    const a = target.closest('a[href]');
    if (a) {
      const href = a.getAttribute('href') ?? '';
      entries.push(
        { label: t('ctx.openLink'), action: () => void this.followLink(href) },
        { label: t('ctx.copyLink'), action: () => void this.copy(href) },
        'separator',
      );
    }
    const img = target.closest('img') as HTMLImageElement | null;
    if (img) {
      const original = img.dataset.src ?? img.getAttribute('src') ?? '';
      if (/^https?:/i.test(original)) entries.push({ label: t('ctx.openImage'), action: () => this.openUrl(original) });
      entries.push({ label: t('ctx.copyImageAddress'), action: () => void this.copy(original) }, 'separator');
    }
    const code = target.closest('.code-frame')?.querySelector('pre code');
    if (code) entries.push({ label: t('ctx.copyCode'), action: () => void this.copy(code.textContent ?? '') }, 'separator');
    entries.push(
      { label: t('ctx.copy'), shortcut: 'Ctrl+C', disabled: !sel, action: () => void this.copy(sel) },
      { label: t('ctx.selectAll'), shortcut: 'Ctrl+A', action: () => this.selectAll() },
    );
    if (this.doc) {
      entries.push('separator', { label: this.sourceView ? t('ctx.showRendered') : t('ctx.showSource'), shortcut: 'Ctrl+U', action: () => this.setSourceView(!this.sourceView) });
    }
    openMenu(entries, { x: e.clientX, y: e.clientY });
  }

  private selectAll(): void {
    const target = this.sourceView ? this.sourceEl : this.article;
    const range = document.createRange();
    range.selectNodeContents(target);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(range);
  }

  private openUrl(url: string): void {
    this.backend.openExternal(url).catch((e) => toast(String(e), { kind: 'error' }));
  }

  private about(): void {
    openAbout(this.info.version, this.info.webviewVersion, (u) => this.openUrl(u), () =>
      void this.backend.openNotices().catch((e) => toast(String(e), { kind: 'error' })),
    );
  }

  // ─────────────────────────── view ───────────────────────────

  private toggleSidebar(): void {
    this.update((s) => { s.ui.sidebarVisible = !s.ui.sidebarVisible; });
  }

  private showSidebarTab(tab: 'outline' | 'recent'): void {
    this.update((s) => { s.ui.sidebarVisible = true; s.ui.sidebarTab = tab; });
  }

  private openFind(): void {
    if (!this.doc) return;
    this.layoutPanel.close();
    this.find.open();
  }

  private setZoom(z: number, announce = true): void {
    const anchor = this.captureScroll();
    this.zoom = Math.min(3, Math.max(0.5, z));
    document.documentElement.style.setProperty('--doc-zoom', String(this.zoom));
    this.restoreScroll(anchor);
    if (announce) toast(t('toast.zoom', { pct: Math.round(this.zoom * 100) }), { ms: 900 });
  }

  private stepZoom(dir: 1 | -1): void {
    const i = ZOOM_STEPS.findIndex((z) => z >= this.zoom - 0.001);
    const cur = i < 0 ? ZOOM_STEPS.length - 1 : i;
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, ZOOM_STEPS[cur] === this.zoom ? cur + dir : dir > 0 ? cur : cur - 1))];
    this.setZoom(next);
  }

  private async toggleFullscreen(force?: boolean): Promise<void> {
    const on = force ?? !this.fullscreen;
    try {
      await this.backend.setFullscreen(on);
      this.fullscreen = on;
      this.root.classList.toggle('fullscreen', on);
      this.root.classList.remove('reveal-toolbar');
    } catch (e) {
      this.backend.log('warn', `fullscreen failed: ${e}`);
    }
  }

  private async toggleOnTop(): Promise<void> {
    this.alwaysOnTop = !this.alwaysOnTop;
    await this.backend.setAlwaysOnTop(this.alwaysOnTop).catch(() => {});
    toast(this.alwaysOnTop ? t('toast.onTop') : t('toast.notOnTop'));
  }

  // ─────────────────────────── print / pdf ───────────────────────────

  /** Makes the whole document print-ready: highlighting and lazy images. */
  private async prepareForPrint(): Promise<void> {
    if (this.settings.code.syntaxHighlighting && !this.sourceView) highlightAll(this.article);
    const imgs = Array.from(this.article.querySelectorAll('img'));
    await Promise.all(
      imgs.map((img) => {
        img.loading = 'eager';
        if (img.complete) return Promise.resolve();
        return new Promise<void>((res) => {
          const done = () => res();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          window.setTimeout(done, 4000);
        });
      }),
    );
  }

  /**
   * In print/PDF output, relative links would resolve against the app origin.
   * Point them at the real files (file:///…) for the duration of the export.
   */
  private absolutizeLinks(): () => void {
    const dir = this.doc?.dir ?? '';
    const changed: [Element, string][] = [];
    this.article.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') ?? '';
      const abs = fileUrlFor(dir, href);
      if (abs) {
        changed.push([a, href]);
        a.setAttribute('href', abs);
      }
    });
    return () => changed.forEach(([a, href]) => a.setAttribute('href', href));
  }

  private async print(): Promise<void> {
    if (!this.doc) return;
    await this.prepareForPrint();
    const restore = this.absolutizeLinks();
    window.addEventListener('afterprint', restore, { once: true });
    window.print();
  }

  private async savePdf(): Promise<void> {
    if (!this.doc) return;
    await this.prepareForPrint();
    const restore = this.absolutizeLinks();
    try {
      const path = await this.backend.exportPdf(pdfOptions(this.settings, this.doc.name));
      if (path) toast(t('toast.pdfSaved'), { action: { label: t('menu.openLocation'), run: () => this.reveal(path) } });
    } catch (e) {
      this.backend.log('error', `pdf failed: ${e}`);
      toast(t('error.pdf', { error: String(e) }), { kind: 'error' });
    } finally {
      restore();
    }
  }

  // ─────────────────────────── banners ───────────────────────────

  private banner(id: string, kind: 'info' | 'warn', text: string, actions: { label: string; run: () => void }[], dismissible = true): void {
    this.removeBanner(id);
    const el = h(
      'div',
      { class: `banner ${kind}`, 'data-id': id, role: kind === 'warn' ? 'alert' : 'status' },
      icon(kind === 'warn' ? ICONS.warn : ICONS.info),
      h('span', { class: 'banner-text' }, text),
      ...actions.map((a) => h('button', { type: 'button', class: 'btn small', onclick: () => a.run() }, a.label)),
      dismissible ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('common.dismiss'), title: t('common.dismiss'), onclick: () => el.remove() }, icon(ICONS.close)) : null,
    );
    this.banners.append(el);
  }

  private removeBanner(id: string): void {
    this.banners.querySelector(`[data-id="${id}"]`)?.remove();
  }

  // ─────────────────────────── events ───────────────────────────

  private async bindBackendEvents(): Promise<void> {
    await this.backend.on('doc-changed', ({ exists }) => {
      if (!this.doc) return;
      if (!exists) {
        this.onDeleted();
        return;
      }
      this.removeBanner('deleted');
      if (this.settings.documents.autoReload) void this.reload(false);
      else if (!this.changedOnDisk) {
        this.changedOnDisk = true;
        this.banner('changed', 'info', t('banner.changed'), [{ label: t('menu.reload'), run: () => void this.reload(true) }]);
      }
    });
    await this.backend.on('settings-changed', () => void this.onExternalSettings());
    await this.backend.on('recent-changed', () => void this.refreshRecent());
    await this.backend.onFileDrop(
      (paths) => void this.onDrop(paths),
      (over) => {
        this.dropOverlay.hidden = !over;
        (this.dropOverlay.querySelector('.drop-text') as HTMLElement).textContent = this.doc ? t('drop.newWindow') : t('drop.here');
      },
    );
  }

  private async onDrop(paths: string[]): Promise<void> {
    const md = paths.filter((p) => /\.(md|markdown|mdown|mkd|mkdn|mdwn|mdtxt|txt)$/i.test(p));
    if (!md.length) {
      if (paths.length) toast(t('toast.dropNotMarkdown'), { kind: 'error' });
      return;
    }
    let first = true;
    for (const p of md) {
      if (first && !this.doc) await this.loadHere(p);
      else await this.backend.openInNewWindow(p).catch((e) => toast(String(e), { kind: 'error' }));
      first = false;
    }
  }

  private bindGlobalEvents(): void {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.settings.appearance.theme === 'system') document.documentElement.dataset.theme = this.resolvedTheme();
    });
    // Browser drag & drop (mock backend / fallback): never navigate to a dropped file.
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    let altAlone = false;
    document.addEventListener('keydown', (e) => {
      altAlone = e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey;
      this.onKey(e);
    });
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Alt' && altAlone && !isModalOpen() && !isMenuOpen()) {
        e.preventDefault();
        this.openMainMenu();
      }
      altAlone = false;
    });
    document.addEventListener('mousedown', () => (altAlone = false));
  }

  private onKey(e: KeyboardEvent): void {
    if (isModalOpen() || isMenuOpen()) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = shortcutKey(e);
    const inField = (e.target as HTMLElement).closest?.('input, textarea, select') !== null;
    const run = (fn: () => void) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    };

    if (ctrl && e.shiftKey) {
      switch (key) {
        case 'b': return run(() => this.toggleSidebar());
        case 's': return run(() => void this.savePdf());
        case 'l': return run(() => this.layoutPanel.toggle(this.layoutBtn));
        case 't': return run(() => this.cycleTheme());
      }
    }
    if (ctrl && !e.shiftKey && !e.altKey) {
      switch (key) {
        case 'o': return run(() => void this.openDialog());
        case 'n': return run(() => void this.backend.openInNewWindow(null));
        case 'w': return run(() => void this.backend.closeWindow());
        case 'p': return run(() => void this.print());
        case 'f': return run(() => this.openFind());
        case ',': return run(() => this.openSettings());
        case 'u': return run(() => this.setSourceView(!this.sourceView));
        case '=':
        case '+': return run(() => this.stepZoom(1));
        case '-': return run(() => this.stepZoom(-1));
        case '0': return run(() => this.setZoom(1));
        case 'a':
          if (!inField) run(() => this.selectAll());
          return;
        case 'r': return run(() => void this.reload(true));
      }
    }
    switch (e.key) {
      case 'F1': return run(() => openShortcuts());
      case 'F3': return run(() => this.find.next(e.shiftKey ? -1 : 1));
      case 'F5': return run(() => void this.reload(true));
      case 'F10': return run(() => this.openMainMenu());
      case 'F11': return run(() => void this.toggleFullscreen());
      case 'Escape':
        if (this.layoutPanel.isOpen) return run(() => this.layoutPanel.close());
        if (this.find.isOpen) return run(() => this.find.close());
        if (this.fullscreen) return run(() => void this.toggleFullscreen(false));
        return;
    }
    // Keyboard scrolling works even when focus is on the toolbar.
    if (!inField && !ctrl && ['PageDown', 'PageUp', 'Home', 'End', ' '].includes(e.key) && document.activeElement !== this.viewport) {
      if ((e.target as HTMLElement).closest('button, [role="menu"], .sidebar')) return;
      this.viewport.focus({ preventScroll: true });
    }
  }
}

export { closeAllMenus, closeModal };

/**
 * Layout-independent shortcut key: Ctrl+F must work with a Cyrillic (or any
 * non-Latin) keyboard layout, where `e.key` would be "а" instead of "f".
 */
export function shortcutKey(e: Pick<KeyboardEvent, 'key' | 'code'>): string {
  const m = /^Key([A-Z])$/.exec(e.code);
  if (m) return m[1].toLowerCase();
  const d = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
  if (d) return d[1];
  switch (e.code) {
    case 'Equal':
      return e.key === '+' ? '+' : '=';
    case 'NumpadAdd':
      return '+';
    case 'Minus':
    case 'NumpadSubtract':
      return '-';
    case 'Comma':
      return ',';
  }
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

/**
 * Resolves a relative/absolute local link against the document folder to a
 * file:/// URL. Web links, anchors and other schemes return null (unchanged).
 */
export function fileUrlFor(dir: string, href: string): string | null {
  const h = href.trim();
  const isDrive = /^[a-z]:[\\/]/i.test(h);
  if (!h || h.startsWith('#') || (/^[a-z][a-z0-9+.-]*:/i.test(h) && !isDrive)) return null;
  const [pathPart, ...rest] = h.split('#');
  const fragment = rest.length ? `#${rest.join('#')}` : '';
  let p = pathPart.split('?')[0];
  try {
    p = decodeURIComponent(p);
  } catch {
    /* keep as written */
  }
  p = p.replace(/\\/g, '/');
  const base = dir.replace(/\\/g, '/').replace(/\/+$/, '');
  const isAbs = /^[a-z]:\//i.test(p) || p.startsWith('/');
  const unc = (isAbs ? p : base).startsWith('//');
  const out: string[] = [];
  for (const seg of (isAbs ? p : `${base}/${p}`).split('/')) {
    if (seg === '..') {
      if (out.length > 1) out.pop();
    } else if (seg !== '.' && seg !== '') out.push(seg);
  }
  const encoded = encodeURI(out.join('/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
  return `${unc ? 'file://' : 'file:///'}${encoded}${fragment}`;
}

const RESTORE_KEY = 'mdvibe-restore';

interface RestoreState {
  path: string | null;
  scrollTop: number;
  zoom: number;
  sourceView: boolean;
  sidebarVisible: boolean;
}

/** Window state saved right before a language reload (read once). */
function takeRestoreState(): RestoreState | null {
  try {
    const raw = sessionStorage.getItem(RESTORE_KEY);
    sessionStorage.removeItem(RESTORE_KEY);
    return raw ? (JSON.parse(raw) as RestoreState) : null;
  } catch {
    return null;
  }
}
