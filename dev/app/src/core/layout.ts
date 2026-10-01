/**
 * Reading & page layout: presets, page sizes and the mapping to CSS variables.
 * Screen and print are separate: the screen uses the reading values; print/PDF
 * uses the page size, orientation and margins (with the same typography).
 */
import type { FontChoice, PageSize, ReadingPreset, Settings } from './settings';

export interface ReadingValues {
  font: FontChoice;
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  margin: number;
}

export const READING_PRESETS: Record<Exclude<ReadingPreset, 'custom'>, ReadingValues> = {
  comfortable: { font: 'sans', fontSize: 16, lineHeight: 1.65, contentWidth: 760, margin: 48 },
  compact: { font: 'sans', fontSize: 14, lineHeight: 1.5, contentWidth: 1040, margin: 24 },
  wide: { font: 'sans', fontSize: 15, lineHeight: 1.6, contentWidth: 0, margin: 40 },
  book: { font: 'serif', fontSize: 18, lineHeight: 1.75, contentWidth: 700, margin: 64 },
};

/** Portrait sheet sizes in millimetres. */
export const PAGE_SIZES: Record<Exclude<PageSize, 'custom'>, [number, number]> = {
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};

export const FONT_STACKS: Record<FontChoice, string> = {
  sans: "'Manrope Variable', Manrope, 'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, sans-serif",
  serif: "Charter, 'Iowan Old Style', Cambria, Georgia, 'Noto Serif', 'Times New Roman', serif",
  mono: "'JetBrains Mono Variable', 'JetBrains Mono', 'Cascadia Mono', Consolas, 'SF Mono', Menlo, monospace",
};

export function presetMatching(r: ReadingValues): ReadingPreset {
  for (const [name, p] of Object.entries(READING_PRESETS)) {
    if (
      p.font === r.font &&
      p.fontSize === r.fontSize &&
      p.lineHeight === r.lineHeight &&
      p.contentWidth === r.contentWidth &&
      p.margin === r.margin
    ) {
      return name as ReadingPreset;
    }
  }
  return 'custom';
}

/** Portrait width/height in mm for the selected page size. */
export function pageSizeMm(s: Settings): [number, number] {
  return s.page.size === 'custom' ? [s.page.customWidthMm, s.page.customHeightMm] : PAGE_SIZES[s.page.size];
}

/** Oriented sheet size in mm. */
export function sheetMm(s: Settings): [number, number] {
  const [w, h] = pageSizeMm(s);
  return s.page.orientation === 'landscape' ? [h, w] : [w, h];
}

/** CSS variables for the document area. */
export function layoutVars(s: Settings, zoom: number): Record<string, string> {
  const r = s.reading;
  const [w, h] = sheetMm(s);
  return {
    '--doc-font': FONT_STACKS[r.font],
    '--doc-size': `${r.fontSize}px`,
    '--doc-line': String(r.lineHeight),
    '--doc-width': r.contentWidth === 0 ? 'none' : `${r.contentWidth}px`,
    '--doc-margin': `${r.margin}px`,
    '--doc-zoom': String(zoom),
    '--page-w': `${w}mm`,
    '--page-h': `${h}mm`,
    '--page-margin': `${s.page.marginMm}mm`,
  };
}

/** `@page` rule for print and PDF (CSSOM, allowed by the CSP). */
export function pageRule(s: Settings): string {
  const [w, h] = sheetMm(s);
  return `@page { size: ${w}mm ${h}mm; margin: ${s.page.marginMm}mm; }`;
}

/** Options for the backend PDF exporter (portrait size + orientation flag). */
export function pdfOptions(s: Settings, title: string) {
  const [w, h] = pageSizeMm(s);
  return {
    pageWidthMm: w,
    pageHeightMm: h,
    marginMm: s.page.marginMm,
    landscape: s.page.orientation === 'landscape',
    backgrounds: s.page.printBackgrounds,
    headerFooter: s.page.headerFooter,
    title,
  };
}
