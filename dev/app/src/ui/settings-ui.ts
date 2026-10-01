/** Settings dialog and the quick Reading/Page layout panel. Changes apply live. */
import { clear, h } from './dom';
import { Modal } from './modal';
import { numberInput, section, segmented, select, slider, toggle } from './controls';
import { LANGUAGES, systemLanguage, t } from '../i18n';
import { READING_PRESETS, presetMatching } from '../core/layout';
import type { PageSize, ReadingPreset, Settings } from '../core/settings';

export type Update = (mutate: (s: Settings) => void) => void;
export type SettingsTab = 'appearance' | 'reading' | 'page' | 'code' | 'documents' | 'privacy';

const px = (v: number) => `${v}px`;

function applyPreset(s: Settings, p: ReadingPreset): void {
  s.reading.preset = p;
  if (p !== 'custom') Object.assign(s.reading, READING_PRESETS[p]);
}

/** Marks the reading preset as "custom" when the values no longer match one. */
function touchReading(s: Settings): void {
  s.reading.preset = presetMatching(s.reading);
}

function presetPicker(get: () => Settings, update: Update, rerender: () => void): HTMLElement {
  const names: Exclude<ReadingPreset, 'custom'>[] = ['comfortable', 'compact', 'wide', 'book'];
  const wrap = h('div', { class: 'presets', role: 'radiogroup', 'aria-label': t('layout.presets') });
  for (const n of names) {
    const on = get().reading.preset === n;
    const b = h(
      'button',
      { type: 'button', role: 'radio', class: `preset preset-${n}`, 'aria-checked': String(on) },
      h('span', { class: 'preset-sample', 'aria-hidden': 'true' }, 'Aa'),
      h('span', { class: 'preset-name' }, t(`preset.${n}` as 'preset.comfortable')),
    );
    b.addEventListener('click', () => {
      update((s) => applyPreset(s, n));
      rerender();
    });
    wrap.append(b);
  }
  return wrap;
}

function readingControls(s: Settings, update: Update, rerender: () => void): HTMLElement[] {
  return [
    segmented(t('reading.font'), [
      { value: 'sans', label: t('reading.font.sans') },
      { value: 'serif', label: t('reading.font.serif') },
      { value: 'mono', label: t('reading.font.mono') },
    ], s.reading.font, (v) => update((x) => { x.reading.font = v; touchReading(x); })),
    slider(t('reading.fontSize'), { min: 11, max: 28, step: 1, value: s.reading.fontSize, format: px }, (v) =>
      update((x) => { x.reading.fontSize = v; touchReading(x); })),
    slider(t('reading.lineHeight'), { min: 1.2, max: 2.2, step: 0.05, value: s.reading.lineHeight, format: (v) => v.toFixed(2) }, (v) =>
      update((x) => { x.reading.lineHeight = Math.round(v * 100) / 100; touchReading(x); })),
    toggle(t('reading.fullWidth'), s.reading.contentWidth === 0, (on) => {
      update((x) => { x.reading.contentWidth = on ? 0 : 760; touchReading(x); });
      rerender();
    }),
    s.reading.contentWidth === 0
      ? h('span')
      : slider(t('reading.width'), { min: 480, max: 1600, step: 20, value: s.reading.contentWidth, format: px }, (v) =>
          update((x) => { x.reading.contentWidth = v; touchReading(x); })),
    slider(t('reading.margins'), { min: 8, max: 160, step: 4, value: s.reading.margin, format: px }, (v) =>
      update((x) => { x.reading.margin = v; touchReading(x); })),
  ];
}

function pageControls(s: Settings, update: Update, rerender: () => void, full: boolean): HTMLElement[] {
  const out: HTMLElement[] = [
    segmented(t('page.view'), [
      { value: 'continuous', label: t('page.view.continuous') },
      { value: 'page', label: t('page.view.page') },
    ], s.page.view, (v) => update((x) => { x.page.view = v; })),
    select<PageSize>(t('page.size'), [
      { value: 'A4', label: 'A4 (210 × 297 mm)' },
      { value: 'A5', label: 'A5 (148 × 210 mm)' },
      { value: 'Letter', label: 'Letter (8.5 × 11 in)' },
      { value: 'Legal', label: 'Legal (8.5 × 14 in)' },
      { value: 'custom', label: t('page.size.custom') },
    ], s.page.size, (v) => { update((x) => { x.page.size = v; }); rerender(); }),
  ];
  if (s.page.size === 'custom') {
    out.push(
      numberInput(t('page.width'), { min: 50, max: 1000, step: 1, value: s.page.customWidthMm, unit: 'mm' }, (v) => update((x) => { x.page.customWidthMm = v; })),
      numberInput(t('page.height'), { min: 50, max: 1000, step: 1, value: s.page.customHeightMm, unit: 'mm' }, (v) => update((x) => { x.page.customHeightMm = v; })),
    );
  }
  out.push(
    segmented(t('page.orientation'), [
      { value: 'portrait', label: t('page.portrait') },
      { value: 'landscape', label: t('page.landscape') },
    ], s.page.orientation, (v) => update((x) => { x.page.orientation = v; })),
    slider(t('page.margins'), { min: 0, max: 40, step: 1, value: s.page.marginMm, format: (v) => `${v} mm` }, (v) => update((x) => { x.page.marginMm = v; })),
  );
  if (full) {
    out.push(
      segmented(t('page.printColors'), [
        { value: 'light', label: t('page.printColors.light') },
        { value: 'screen', label: t('page.printColors.screen') },
      ], s.page.printTheme, (v) => update((x) => { x.page.printTheme = v; })),
      toggle(t('page.backgrounds'), s.page.printBackgrounds, (v) => update((x) => { x.page.printBackgrounds = v; }), t('page.backgrounds.hint')),
      toggle(t('page.headerFooter'), s.page.headerFooter, (v) => update((x) => { x.page.headerFooter = v; }), t('page.headerFooter.hint')),
    );
  }
  return out;
}

export function openSettings(
  get: () => Settings,
  update: Update,
  actions: { clearRecent: () => void },
  initial: SettingsTab = 'appearance',
): void {
  const modal = new Modal(t('settings.title'), { wide: true });
  const nav = h('div', { class: 'settings-nav', role: 'tablist', 'aria-orientation': 'vertical' });
  const panel = h('div', { class: 'settings-panel', role: 'tabpanel', tabindex: '-1' });
  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'appearance', label: t('settings.appearance') },
    { id: 'reading', label: t('settings.reading') },
    { id: 'page', label: t('settings.page') },
    { id: 'code', label: t('settings.code') },
    { id: 'documents', label: t('settings.documents') },
    { id: 'privacy', label: t('settings.privacy') },
  ];
  let active = initial;
  const render = () => {
    clear(nav);
    for (const tb of tabs) {
      const b = h('button', { type: 'button', role: 'tab', class: 'settings-tab', 'aria-selected': String(tb.id === active) }, tb.label);
      b.addEventListener('click', () => {
        active = tb.id;
        render();
        (nav.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus();
      });
      nav.append(b);
    }
    clear(panel);
    const s = get();
    switch (active) {
      case 'appearance':
        panel.append(
          section(
            t('settings.appearance'),
            segmented(t('appearance.theme'), [
              { value: 'system', label: t('appearance.theme.system') },
              { value: 'light', label: t('appearance.theme.light') },
              { value: 'dark', label: t('appearance.theme.dark') },
            ], s.appearance.theme, (v) => update((x) => { x.appearance.theme = v; })),
            segmented(t('appearance.style'), [
              { value: 'enhanced', label: t('appearance.style.enhanced') },
              { value: 'neutral', label: t('appearance.style.neutral') },
            ], s.appearance.style, (v) => update((x) => { x.appearance.style = v; })),
            toggle(t('appearance.headingAccent'), s.appearance.headingAccent, (v) => update((x) => { x.appearance.headingAccent = v; })),
            select<Settings['appearance']['language']>(
              t('appearance.language'),
              [
                { value: 'system', label: t('language.system', { lang: LANGUAGES.find((l) => l.id === systemLanguage())?.name ?? 'English' }) },
                ...LANGUAGES.map((l) => ({ value: l.id, label: l.name })),
              ],
              s.appearance.language,
              (v) => update((x) => { x.appearance.language = v; }),
            ),
            h('p', { class: 'field-hint' }, t('language.hint')),
          ),
        );
        break;
      case 'reading':
        panel.append(section(t('settings.reading'), presetPicker(get, update, render), ...readingControls(s, update, render)));
        break;
      case 'page':
        panel.append(section(t('settings.page'), ...pageControls(s, update, render, true)));
        break;
      case 'code':
        panel.append(
          section(
            t('settings.code'),
            toggle(t('code.highlighting'), s.code.syntaxHighlighting, (v) => update((x) => { x.code.syntaxHighlighting = v; })),
            toggle(t('code.lineNumbers'), s.code.lineNumbers, (v) => update((x) => { x.code.lineNumbers = v; })),
            toggle(t('code.background'), s.code.background, (v) => update((x) => { x.code.background = v; })),
            toggle(t('code.wrap'), s.code.wrap, (v) => update((x) => { x.code.wrap = v; }), t('code.wrap.hint')),
          ),
        );
        break;
      case 'documents':
        panel.append(
          section(
            t('settings.documents'),
            toggle(t('documents.autoReload'), s.documents.autoReload, (v) => update((x) => { x.documents.autoReload = v; }), t('documents.autoReload.hint')),
            toggle(t('documents.rawHtml'), s.documents.rawHtml, (v) => update((x) => { x.documents.rawHtml = v; }), t('documents.rawHtml.hint')),
            toggle(t('documents.remoteImages'), s.documents.remoteImages, (v) => update((x) => { x.documents.remoteImages = v; }), t('documents.remoteImages.hint')),
          ),
        );
        break;
      case 'privacy':
        panel.append(
          section(
            t('settings.privacy'),
            h('p', { class: 'field-hint lead' }, t('privacy.statement')),
            toggle(t('privacy.rememberRecent'), s.privacy.rememberRecent, (v) => update((x) => { x.privacy.rememberRecent = v; }), t('privacy.rememberRecent.hint')),
            h('div', { class: 'field' }, h('button', { type: 'button', class: 'btn', onclick: () => actions.clearRecent() }, t('recent.clear'))),
          ),
        );
        break;
    }
  };
  render();
  modal.body.append(h('div', { class: 'settings' }, nav, panel));
  modal.show();
}

/** Quick layout popover (the "Aa" button). */
export class LayoutPanel {
  readonly el: HTMLDivElement;
  private anchor: HTMLElement | null = null;

  constructor(
    private get: () => Settings,
    private update: Update,
    private openFull: (tab: SettingsTab) => void,
  ) {
    this.el = h('div', { class: 'popover layout-panel', role: 'dialog', 'aria-label': t('layout.title'), hidden: true });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    });
    document.addEventListener('mousedown', (e) => {
      if (this.el.hidden) return;
      const target = e.target as Node;
      if (this.el.contains(target) || this.anchor?.contains(target)) return;
      this.close();
    }, true);
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  toggle(anchor: HTMLElement): void {
    if (this.isOpen) this.close();
    else this.open(anchor);
  }

  open(anchor: HTMLElement): void {
    this.anchor = anchor;
    this.render();
    this.el.hidden = false;
    anchor.setAttribute('aria-expanded', 'true');
    (this.el.querySelector('button, input, select') as HTMLElement | null)?.focus();
  }

  close(): void {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.anchor?.setAttribute('aria-expanded', 'false');
    this.anchor?.focus();
  }

  private render = (): void => {
    clear(this.el);
    const s = this.get();
    const r = () => {
      const focusedIdx = Array.from(this.el.querySelectorAll('button,input,select')).indexOf(document.activeElement as Element);
      this.render();
      (this.el.querySelectorAll('button,input,select')[focusedIdx] as HTMLElement | undefined)?.focus();
    };
    this.el.append(
      h('div', { class: 'popover-head' }, h('h2', {}, t('layout.title'))),
      presetPicker(this.get, this.update, r),
      ...readingControls(s, this.update, r),
      h('hr', {}),
      ...pageControls(s, this.update, r, false),
      h('div', { class: 'popover-foot' }, h('button', { type: 'button', class: 'link-btn', onclick: () => { this.close(); this.openFull('page'); } }, t('layout.more'))),
    );
  };
}
