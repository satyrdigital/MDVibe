import { describe, expect, it } from 'vitest';
import { fileUrlFor, shortcutKey } from '../src/ui/app';

describe('shortcutKey', () => {
  it('uses the physical key for letters (Cyrillic layout)', () => {
    expect(shortcutKey({ key: 'а', code: 'KeyF' })).toBe('f');
    expect(shortcutKey({ key: 'щ', code: 'KeyO' })).toBe('o');
    expect(shortcutKey({ key: 'F', code: 'KeyF' })).toBe('f');
  });

  it('maps zoom and settings keys', () => {
    expect(shortcutKey({ key: '=', code: 'Equal' })).toBe('=');
    expect(shortcutKey({ key: '+', code: 'NumpadAdd' })).toBe('+');
    expect(shortcutKey({ key: '-', code: 'Minus' })).toBe('-');
    expect(shortcutKey({ key: 'б', code: 'Comma' })).toBe(',');
    expect(shortcutKey({ key: '0', code: 'Digit0' })).toBe('0');
  });

  it('passes named keys through', () => {
    expect(shortcutKey({ key: 'F11', code: 'F11' })).toBe('F11');
    expect(shortcutKey({ key: 'Escape', code: 'Escape' })).toBe('Escape');
  });
});

describe('fileUrlFor (print/PDF links)', () => {
  it('resolves relative links against the document folder', () => {
    expect(fileUrlFor('C:\\Docs\\тест папка', 'CHANGELOG.md#v1')).toBe(
      'file:///C:/Docs/%D1%82%D0%B5%D1%81%D1%82%20%D0%BF%D0%B0%D0%BF%D0%BA%D0%B0/CHANGELOG.md#v1',
    );
    expect(fileUrlFor('C:\\Docs\\a', '../b/x%20y.md')).toBe('file:///C:/Docs/b/x%20y.md');
    expect(fileUrlFor('C:\\Docs', 'D:\\Other\\r.md')).toBe('file:///D:/Other/r.md');
  });

  it('keeps web links, anchors and schemes unchanged', () => {
    expect(fileUrlFor('C:\\Docs', 'https://example.com')).toBeNull();
    expect(fileUrlFor('C:\\Docs', '#section')).toBeNull();
    expect(fileUrlFor('C:\\Docs', 'mailto:a@b.c')).toBeNull();
  });

  it('handles network folders', () => {
    expect(fileUrlFor('\\\\srv\\share\\docs', 'a.md')).toBe('file://srv/share/docs/a.md');
  });
});
