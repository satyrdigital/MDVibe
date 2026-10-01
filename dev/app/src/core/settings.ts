/**
 * Settings schema — the single definition of defaults, ranges and migrations.
 * Stored by the backend as JSON in the user's app-data folder (never in the
 * project folder). Unknown or invalid values fall back to defaults, so a
 * damaged file can never break startup.
 */

export const SETTINGS_VERSION = 1;

export type Theme = 'system' | 'light' | 'dark';
export type MarkdownStyle = 'enhanced' | 'neutral';
export type FontChoice = 'sans' | 'serif' | 'mono';
export type ReadingPreset = 'comfortable' | 'compact' | 'wide' | 'book' | 'custom';
export type ViewMode = 'continuous' | 'page';
export type PageSize = 'A4' | 'A5' | 'Letter' | 'Legal' | 'custom';
export type Orientation = 'portrait' | 'landscape';

export interface Settings {
  version: number;
  appearance: {
    theme: Theme;
    style: MarkdownStyle;
    headingAccent: boolean;
    /** 'system' = Windows display language, English fallback. */
    language: 'system' | 'en' | 'uk' | 'ru';
  };
  reading: {
    preset: ReadingPreset;
    font: FontChoice;
    fontSize: number; // px
    lineHeight: number;
    contentWidth: number; // px, 0 = full width
    margin: number; // px, horizontal padding around the text
  };
  code: {
    syntaxHighlighting: boolean;
    lineNumbers: boolean;
    background: boolean;
    wrap: boolean;
  };
  page: {
    view: ViewMode;
    size: PageSize;
    customWidthMm: number;
    customHeightMm: number;
    orientation: Orientation;
    marginMm: number;
    /** Print/PDF always light unless the user explicitly wants screen colors. */
    printTheme: 'light' | 'screen';
    printBackgrounds: boolean;
    headerFooter: boolean;
  };
  documents: {
    autoReload: boolean;
    rawHtml: boolean;
    remoteImages: boolean;
  };
  privacy: {
    rememberRecent: boolean;
  };
  ui: {
    sidebarVisible: boolean;
    sidebarTab: 'outline' | 'recent';
  };
}

export const DEFAULTS: Settings = {
  version: SETTINGS_VERSION,
  appearance: { theme: 'system', style: 'enhanced', headingAccent: true, language: 'system' },
  reading: { preset: 'comfortable', font: 'sans', fontSize: 16, lineHeight: 1.65, contentWidth: 760, margin: 48 },
  code: { syntaxHighlighting: true, lineNumbers: false, background: true, wrap: false },
  page: {
    view: 'continuous',
    size: 'A4',
    customWidthMm: 210,
    customHeightMm: 297,
    orientation: 'portrait',
    marginMm: 18,
    printTheme: 'light',
    printBackgrounds: true,
    headerFooter: false,
  },
  documents: { autoReload: true, rawHtml: true, remoteImages: false },
  privacy: { rememberRecent: true },
  ui: { sidebarVisible: true, sidebarTab: 'outline' },
};

export const LIMITS = {
  fontSize: [11, 32],
  lineHeight: [1.2, 2.4],
  contentWidth: [480, 1600],
  margin: [8, 160],
  pageMm: [50, 1000],
  marginMm: [0, 50],
} as const;

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], def: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : def;
}

function pickBool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def;
}

function pickNum(v: unknown, [min, max]: readonly [number, number], def: number, allowZero = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return def;
  if (allowZero && v === 0) return 0;
  return Math.min(max, Math.max(min, v));
}

/** Migrates older versions in place. Version 1 is the first public schema. */
function migrate(raw: Json): Json {
  const version = typeof raw.version === 'number' ? raw.version : 1;
  // Future: if (version < 2) { …transform…; }
  return { ...raw, version: Math.max(version, SETTINGS_VERSION) };
}

/** Validates any JSON value into a complete Settings object. */
export function normalize(input: unknown): Settings {
  const raw = migrate(isObj(input) ? input : {});
  const g = (k: string): Json => (isObj(raw[k]) ? (raw[k] as Json) : {});
  const a = g('appearance');
  const r = g('reading');
  const c = g('code');
  const p = g('page');
  const d = g('documents');
  const pr = g('privacy');
  const u = g('ui');
  const D = DEFAULTS;
  return {
    version: SETTINGS_VERSION,
    appearance: {
      theme: pickEnum(a.theme, ['system', 'light', 'dark'], D.appearance.theme),
      style: pickEnum(a.style, ['enhanced', 'neutral'], D.appearance.style),
      headingAccent: pickBool(a.headingAccent, D.appearance.headingAccent),
      language: pickEnum(a.language, ['system', 'en', 'uk', 'ru'], D.appearance.language),
    },
    reading: {
      preset: pickEnum(r.preset, ['comfortable', 'compact', 'wide', 'book', 'custom'], D.reading.preset),
      font: pickEnum(r.font, ['sans', 'serif', 'mono'], D.reading.font),
      fontSize: pickNum(r.fontSize, LIMITS.fontSize, D.reading.fontSize),
      lineHeight: pickNum(r.lineHeight, LIMITS.lineHeight, D.reading.lineHeight),
      contentWidth: pickNum(r.contentWidth, LIMITS.contentWidth, D.reading.contentWidth, true),
      margin: pickNum(r.margin, LIMITS.margin, D.reading.margin),
    },
    code: {
      syntaxHighlighting: pickBool(c.syntaxHighlighting, D.code.syntaxHighlighting),
      lineNumbers: pickBool(c.lineNumbers, D.code.lineNumbers),
      background: pickBool(c.background, D.code.background),
      wrap: pickBool(c.wrap, D.code.wrap),
    },
    page: {
      view: pickEnum(p.view, ['continuous', 'page'], D.page.view),
      size: pickEnum(p.size, ['A4', 'A5', 'Letter', 'Legal', 'custom'], D.page.size),
      customWidthMm: pickNum(p.customWidthMm, LIMITS.pageMm, D.page.customWidthMm),
      customHeightMm: pickNum(p.customHeightMm, LIMITS.pageMm, D.page.customHeightMm),
      orientation: pickEnum(p.orientation, ['portrait', 'landscape'], D.page.orientation),
      marginMm: pickNum(p.marginMm, LIMITS.marginMm, D.page.marginMm),
      printTheme: pickEnum(p.printTheme, ['light', 'screen'], D.page.printTheme),
      printBackgrounds: pickBool(p.printBackgrounds, D.page.printBackgrounds),
      headerFooter: pickBool(p.headerFooter, D.page.headerFooter),
    },
    documents: {
      autoReload: pickBool(d.autoReload, D.documents.autoReload),
      rawHtml: pickBool(d.rawHtml, D.documents.rawHtml),
      remoteImages: pickBool(d.remoteImages, D.documents.remoteImages),
    },
    privacy: { rememberRecent: pickBool(pr.rememberRecent, D.privacy.rememberRecent) },
    ui: {
      sidebarVisible: pickBool(u.sidebarVisible, D.ui.sidebarVisible),
      sidebarTab: pickEnum(u.sidebarTab, ['outline', 'recent'], D.ui.sidebarTab),
    },
  };
}

export function clone(s: Settings): Settings {
  return JSON.parse(JSON.stringify(s)) as Settings;
}
