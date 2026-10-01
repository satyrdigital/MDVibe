import { describe, expect, it } from 'vitest';
import { fenceLanguage, render, slugify } from '../src/markdown/engine';

const md = (s: string, rawHtml = true) => render(s, { rawHtml });

describe('GFM rendering', () => {
  it('renders core blocks', () => {
    const r = md('# Title\n\nPara **bold** *it* ~~del~~ `code`\n\n> quote\n\n---\n\n1. a\n2. b\n\n- x\n  - y\n');
    expect(r.html).toContain('<h1 id="title"');
    expect(r.html).toContain('<strong>bold</strong>');
    expect(r.html).toContain('<em>it</em>');
    expect(r.html).toContain('<s>del</s>');
    expect(r.html).toContain('<code>code</code>');
    expect(r.html).toContain('<blockquote');
    expect(r.html).toContain('<hr');
    expect(r.html).toContain('<ol');
    expect(r.html).toMatch(/<ul[^>]*>\s*<li[^>]*>x\s*<ul/);
  });

  it('renders tables with alignment inside a scroll wrapper', () => {
    const r = md('| a | b |\n|:--|--:|\n| 1 | 2 |\n');
    expect(r.html).toContain('<div class="table-wrap"><table');
    expect(r.html).toContain('style="text-align:right"');
  });

  it('renders task lists as read-only boxes', () => {
    const r = md('- [ ] todo\n- [x] done\n- [X] also done\n- not a task\n');
    expect(r.html).toContain('contains-task-list');
    expect((r.html.match(/task-box checked/g) ?? []).length).toBe(2);
    expect((r.html.match(/class="task-box"/g) ?? []).length).toBe(1);
    expect(r.html).not.toContain('[ ]');
    expect(r.html).not.toContain('<input');
  });

  it('renders GitHub alerts', () => {
    const r = md('> [!WARNING]\n> Be careful.\n');
    expect(r.html).toContain('markdown-alert-warning');
    expect(r.html).toContain('<p class="markdown-alert-title">Warning</p>');
    expect(r.html).not.toContain('[!WARNING]');
  });

  it('renders fenced code as escaped text with language', () => {
    const r = md('```js {1}\nconst a = "<b>";\n```\n');
    expect(r.html).toContain('<pre class="code-block" data-lang="js"');
    expect(r.html).toContain('&lt;b&gt;');
    expect(r.codeBlocks).toBe(1);
    expect(fenceLanguage('  TypeScript  extra')).toBe('typescript');
  });

  it('keeps tabs and spaces in code', () => {
    const r = md('```\n\tindented\n    four\n```\n');
    expect(r.html).toContain('\tindented\n    four');
  });

  it('autolinks URLs and renders footnotes', () => {
    const r = md('See https://example.com and note[^1].\n\n[^1]: The note.\n');
    expect(r.html).toContain('<a href="https://example.com">');
    expect(r.html).toContain('footnotes');
  });

  it('handles escaping', () => {
    const r = md('\\*not italic\\* and \\# not heading\n');
    expect(r.html).toContain('*not italic*');
    expect(r.html).not.toContain('<em>');
  });

  it('collects headings with GitHub slugs and source lines', () => {
    const r = md('# Привіт світ\n\n## API: v2.0!\n\n## API: v2.0!\n\ntext\n\n### `code` heading\n');
    expect(r.headings.map((h) => h.id)).toEqual(['привіт-світ', 'api-v20', 'api-v20-1', 'code-heading']);
    expect(r.headings.map((h) => h.level)).toEqual([1, 2, 2, 3]);
    expect(r.headings[1].line).toBe(2);
    expect(r.html).toContain('data-line="0"');
  });

  it('slugify de-duplicates like GitHub', () => {
    const used = new Map<string, number>();
    expect(slugify('Intro', used)).toBe('intro');
    expect(slugify('Intro', used)).toBe('intro-1');
    expect(slugify('Intro', used)).toBe('intro-2');
    expect(slugify('Intro 1', used)).toBe('intro-1-1');
  });

  it('does not throw on malformed or adversarial input', () => {
    const nasty = ['['.repeat(5000), '>'.repeat(3000) + ' x', '*'.repeat(10000), '| a |\n|-|\n'.repeat(500), '```\nunclosed', '\u0000￿\uD800'];
    for (const s of nasty) expect(() => md(s)).not.toThrow();
  });
});

describe('raw HTML detection', () => {
  it('flags raw HTML only when present', () => {
    expect(md('plain *text*').hasRawHtml).toBe(false);
    expect(md('<div align="center">x</div>').hasRawHtml).toBe(true);
    expect(md('inline <kbd>Ctrl</kbd>').hasRawHtml).toBe(true);
  });

  it('escapes raw HTML entirely when disabled', () => {
    const r = md('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>', false);
    expect(r.hasRawHtml).toBe(false);
    expect(r.html).not.toContain('<script');
    expect(r.html).not.toContain('<img');
    expect(r.html).toContain('&lt;script&gt;');
  });

  it('never emits dangerous link protocols from Markdown syntax', () => {
    const r = md('[a](javascript:alert(1)) [b](vbscript:x) [c](data:text/html,x) ![d](data:image/png;base64,AAAA)', false);
    expect(r.html).not.toMatch(/href="(javascript|vbscript|data):/i);
    expect(r.html).toContain('src="data:image/png;base64,AAAA"');
  });
});
