import { describe, expect, it } from 'vitest';
import { DEFAULTS, normalize } from '../src/core/settings';
import { layoutVars, pageRule, pdfOptions, presetMatching, sheetMm } from '../src/core/layout';
import { isNewer, releasesApi } from '../src/ui/dialogs';

describe('settings schema', () => {
  it('fills defaults for empty or corrupt input', () => {
    for (const bad of [null, undefined, 42, 'x', [], { appearance: 'nope' }]) {
      expect(normalize(bad)).toEqual(DEFAULTS);
    }
  });

  it('keeps valid values and clamps invalid ones', () => {
    const s = normalize({
      version: 1,
      appearance: { theme: 'dark', style: 'neutral', headingAccent: false },
      reading: { fontSize: 999, lineHeight: 0.1, contentWidth: 0, margin: 'wide' },
      page: { size: 'Letter', orientation: 'landscape', marginMm: -5 },
      privacy: { rememberRecent: false },
    });
    expect(s.appearance).toEqual({ theme: 'dark', style: 'neutral', headingAccent: false, language: 'system' });
    expect(s.reading.fontSize).toBe(32);
    expect(s.reading.lineHeight).toBe(1.2);
    expect(s.reading.contentWidth).toBe(0);
    expect(s.reading.margin).toBe(DEFAULTS.reading.margin);
    expect(s.page.marginMm).toBe(0);
    expect(s.privacy.rememberRecent).toBe(false);
  });

  it('ignores unknown enum values and keys', () => {
    const s = normalize({ appearance: { theme: 'neon' }, extra: { a: 1 } });
    expect(s.appearance.theme).toBe('system');
    expect('extra' in s).toBe(false);
  });

  it('migrates older versions without losing data', () => {
    const s = normalize({ version: 0, code: { lineNumbers: true } });
    expect(s.version).toBe(1);
    expect(s.code.lineNumbers).toBe(true);
  });
});

describe('layout', () => {
  it('detects presets and custom', () => {
    expect(presetMatching(DEFAULTS.reading)).toBe('comfortable');
    expect(presetMatching({ ...DEFAULTS.reading, fontSize: 17 })).toBe('custom');
  });

  it('computes oriented sheets, @page and PDF options', () => {
    const s = normalize({ page: { size: 'A4', orientation: 'landscape', marginMm: 12 } });
    expect(sheetMm(s)).toEqual([297, 210]);
    expect(pageRule(s)).toBe('@page { size: 297mm 210mm; margin: 12mm; }');
    const o = pdfOptions(s, 'README.md');
    expect([o.pageWidthMm, o.pageHeightMm, o.landscape, o.marginMm]).toEqual([210, 297, true, 12]);
    expect(layoutVars(s, 1.25)['--doc-zoom']).toBe('1.25');
    expect(layoutVars(normalize({ reading: { contentWidth: 0 } }), 1)['--doc-width']).toBe('none');
  });
});

describe('update check helpers', () => {
  it('compares versions', () => {
    expect(isNewer('v1.2.0', '1.1.9')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.9.9', '1.0.0')).toBe(false);
    expect(isNewer('1.10.0', '1.9.0')).toBe(true);
  });

  it('derives the releases API only from GitHub repository URLs', () => {
    expect(releasesApi('https://github.com/owner/mdvibe')).toBe('https://api.github.com/repos/owner/mdvibe/releases/latest');
    expect(releasesApi('https://github.com/owner/mdvibe.git')).toBe('https://api.github.com/repos/owner/mdvibe/releases/latest');
    expect(releasesApi('')).toBeNull();
    expect(releasesApi('https://evil.example/owner/repo')).toBeNull();
  });
});
