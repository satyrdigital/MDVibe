import { describe, expect, it } from 'vitest';
import { CATALOGS, detectLanguage, setLanguage, t } from '../src/i18n';

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');

describe('catalogs', () => {
  const en = CATALOGS.en;
  for (const lang of ['uk', 'ru'] as const) {
    it(`${lang} translates every English key with the same placeholders`, () => {
      const cat = CATALOGS[lang];
      expect(Object.keys(cat).sort()).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en)) {
        expect(placeholders(cat[key]), `${lang}:${key}`).toBe(placeholders(en[key]));
        expect(cat[key].trim().length, `${lang}:${key}`).toBeGreaterThan(0);
      }
    });
  }
});

describe('language detection', () => {
  it('maps system languages with English fallback', () => {
    expect(detectLanguage(['uk-UA'])).toBe('uk');
    expect(detectLanguage(['ru-RU', 'en-US'])).toBe('ru');
    expect(detectLanguage(['en-GB'])).toBe('en');
    expect(detectLanguage(['de-DE', 'fr-FR'])).toBe('en');
    expect(detectLanguage(['de-DE', 'uk'])).toBe('uk');
    expect(detectLanguage([])).toBe('en');
  });

  it('switches catalogs and interpolates', () => {
    setLanguage('uk');
    expect(t('find.count', { n: 2, total: 5 })).toBe('2 з 5');
    setLanguage('ru');
    expect(t('menu.settings')).toBe('Настройки…');
    setLanguage('en');
    expect(t('menu.settings')).toBe('Settings…');
  });
});
