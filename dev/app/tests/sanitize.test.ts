import { describe, expect, it } from 'vitest';
import { render } from '../src/markdown/engine';
import { buildFragment } from '../src/markdown/sanitize';

const policy = { imageBase: 'http://mdimg.localhost/', remoteImages: false };

function html(source: string, remoteImages = false): { out: string; blocked: number } {
  const r = render(source, { rawHtml: true });
  const { fragment, info } = buildFragment(r.html, r.hasRawHtml, { ...policy, remoteImages });
  const div = document.createElement('div');
  div.append(fragment);
  return { out: div.innerHTML, blocked: info.blockedImages };
}

describe('sanitizer: script execution vectors', () => {
  const vectors = [
    '<script>alert(1)</script>',
    '<img src=x onerror="alert(1)">',
    '<svg onload=alert(1)><circle/></svg>',
    '<iframe src="https://evil.example"></iframe>',
    '<object data="x.swf"></object><embed src="x">',
    '<a href="javascript:alert(1)">x</a>',
    '<a href="JaVaScRiPt:alert(1)">x</a>',
    '<a href="&#106;avascript:alert(1)">x</a>',
    '<form action="https://evil"><input name=q><button>go</button></form>',
    '<style>body{display:none}</style>',
    '<div style="background:url(https://evil/track.png)">x</div>',
    '<meta http-equiv="refresh" content="0;url=https://evil">',
    '<base href="https://evil/">',
    '<link rel="stylesheet" href="https://evil/x.css">',
    '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
    '<details open ontoggle=alert(1)>x</details>',
    '<video poster="https://evil/p.png"><source src="x.mp4"></video>',
    '<img srcset="https://evil/a.png 1x">',
    '<a href="https://ok.example" target="_blank" ping="https://evil/ping">ok</a>',
    '<template><script>alert(1)</script></template>',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  ];

  for (const v of vectors) {
    it(`neutralizes ${v.slice(0, 40)}`, () => {
      const { out } = html(v);
      expect(out).not.toMatch(/<script|<iframe|<object|<embed|<form|<input|<style|<meta|<base|<link|<svg|<math|<video|<template/i);
      expect(out).not.toMatch(/\son[a-z]+\s*=/i);
      expect(out).not.toMatch(/javascript:/i);
      expect(out).not.toMatch(/style=|srcset=|ping=|target=|poster=/i);
      expect(out).not.toMatch(/https:\/\/evil\/(track|p|a|x)\./);
    });
  }

  it('keeps safe GitHub-style HTML', () => {
    const { out } = html('<p align="center"><b>Bold</b> <kbd>Ctrl</kbd> <sub>2</sub></p>\n\n<details><summary>More</summary>\n\nHidden *md*\n\n</details>');
    expect(out).toContain('align="center"');
    expect(out).toContain('<kbd>Ctrl</kbd>');
    expect(out).toContain('<summary>More</summary>');
  });

  it('prefixes ids from raw HTML (DOM clobbering)', () => {
    const { out } = html('<a id="location" name="cookie">x</a>');
    expect(out).toContain('user-content-');
  });
});

describe('resource policy', () => {
  it('routes local images through the mdimg protocol', () => {
    const { out } = html('![logo](images/logo%201.png)');
    expect(out).toContain('src="http://mdimg.localhost/images%2Flogo%25201.png"');
    expect(out).toContain('data-src="images/logo%201.png"');
  });

  it('blocks remote images by default and counts them', () => {
    const { out, blocked } = html('![badge](https://img.shields.io/x.svg) <img src="http://tracker.example/p.gif">');
    expect(blocked).toBe(2);
    expect(out).not.toMatch(/<img[^>]+src="https?:/);
    expect(out).toContain('class="img-blocked"');
    expect(out).toContain('data-remote-src="https://img.shields.io/x.svg"');
  });

  it('allows remote images when enabled, without referrer', () => {
    const { out, blocked } = html('![badge](https://img.shields.io/x.svg)', true);
    expect(blocked).toBe(0);
    expect(out).toContain('src="https://img.shields.io/x.svg"');
    expect(out).toContain('referrerpolicy="no-referrer"');
  });

  it('keeps safe data images and drops other schemes', () => {
    const { out } = html('![a](data:image/png;base64,AAAA)\n\n<img src="ms-appx:///x.png">');
    expect(out).toContain('src="data:image/png;base64,AAAA"');
    expect(out).not.toContain('ms-appx');
  });

  it('marks links and never keeps target', () => {
    const { out } = html('[web](https://example.com) [doc](other.md) [sec](#a)');
    expect(out).toMatch(/<a href="https:\/\/example.com" rel="noopener noreferrer" class="ext" title="https:\/\/example.com">/);
    expect(out).toContain('href="other.md"');
    expect(out).not.toContain('target=');
  });
});
