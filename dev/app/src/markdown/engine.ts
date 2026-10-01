/**
 * Markdown → HTML engine (GitHub Flavored Markdown oriented).
 *
 * Pure and DOM-free: runs on the main thread for small documents and in a
 * Web Worker for large ones. Output safety:
 *   - markdown-it escapes all text and validates link schemes;
 *   - raw HTML (if enabled) is the only untrusted markup and is sanitized with
 *     DOMPurify on the main thread (see sanitize.ts) — `hasRawHtml` tells it when;
 *   - the app CSP forbids inline/remote scripts as a second line of defence.
 */
import MarkdownIt from 'markdown-it';
import type { MarkdownIt as MarkdownItInstance, MarkdownItOptions, Token, StateCore } from 'markdown-it';
import footnote from 'markdown-it-footnote';

export interface RenderOptions {
  /** Render raw HTML blocks/inline tags (sanitized later) or show them as text. */
  rawHtml: boolean;
}

export interface Heading {
  level: number;
  text: string;
  id: string;
  line: number;
}

export interface RenderResult {
  html: string;
  headings: Heading[];
  hasRawHtml: boolean;
  codeBlocks: number;
}

interface Env {
  [key: string]: unknown;
  headings: Heading[];
  slugs: Map<string, number>;
  hasRawHtml: boolean;
  codeBlocks: number;
}

/** GitHub-compatible heading slug (github-slugger algorithm). */
export function slugify(text: string, used: Map<string, number>): string {
  const base =
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
      .replace(/ /g, '-') || 'section';
  const n = used.get(base);
  if (n === undefined) {
    used.set(base, 0);
    return base;
  }
  let next = n + 1;
  while (used.has(`${base}-${next}`)) next++;
  used.set(base, next);
  used.set(`${base}-${next}`, 0);
  return `${base}-${next}`;
}

const SAFE_DATA_IMAGE = /^data:image\/(gif|png|jpeg|webp);/i;
const BAD_PROTOCOL = /^(vbscript|javascript|data):/i;

/** markdown-it's default validator, but `file:` links/images are allowed (resolved by the backend policy). */
function validateLink(url: string): boolean {
  const s = url.trim().toLowerCase();
  if (BAD_PROTOCOL.test(s)) return SAFE_DATA_IMAGE.test(s);
  return true;
}

function inlineText(tokens: Token[] | null): string {
  if (!tokens) return '';
  let out = '';
  for (const t of tokens) {
    if (t.type === 'text' || t.type === 'code_inline') out += t.content;
    else if (t.type === 'image') out += inlineText(t.children);
    else if (t.children) out += inlineText(t.children);
  }
  return out;
}

/** Adds data-line to block tokens (scroll restore, outline sync). */
function sourceLines(state: StateCore): void {
  for (const t of state.tokens) {
    if (t.map && t.nesting === 1) t.attrSet('data-line', String(t.map[0]));
  }
}

function headingIds(state: StateCore): void {
  const env = state.env as unknown as Env;
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'heading_open') continue;
    const text = inlineText(tokens[i + 1]?.children ?? null);
    const id = slugify(text, env.slugs);
    t.attrSet('id', id);
    env.headings.push({ level: Number(t.tag.slice(1)), text, id, line: t.map ? t.map[0] : 0 });
  }
}

const TASK_RE = /^\[([ xX])\][  ]/;

/** GFM task list items: `- [ ] todo`, `- [x] done`. */
function taskLists(state: StateCore): void {
  const tokens = state.tokens;
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i];
    if (inline.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open') continue;
    const first = inline.children?.[0];
    if (!first || first.type !== 'text') continue;
    const m = TASK_RE.exec(first.content);
    if (!m) continue;
    first.content = first.content.slice(m[0].length);
    const box = new state.Token('task_checkbox', '', 0);
    box.meta = { checked: m[1] !== ' ' };
    inline.children!.unshift(box);
    tokens[i - 2].attrJoin('class', 'task-list-item');
    // Mark the enclosing list.
    for (let j = i - 3; j >= 0; j--) {
      const t = tokens[j];
      if ((t.type === 'bullet_list_open' || t.type === 'ordered_list_open') && t.level === tokens[i - 2].level - 1) {
        if (!String(t.attrGet('class') ?? '').includes('contains-task-list')) t.attrJoin('class', 'contains-task-list');
        break;
      }
    }
  }
}

const ALERTS: Record<string, string> = {
  NOTE: 'Note',
  TIP: 'Tip',
  IMPORTANT: 'Important',
  WARNING: 'Warning',
  CAUTION: 'Caution',
};
const ALERT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i;

/** GitHub alerts: `> [!NOTE]` as the first line of a blockquote. */
function alerts(state: StateCore): void {
  const tokens = state.tokens;
  const stack: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'blockquote_open') {
      stack.push(t);
      const p = tokens[i + 1];
      const inline = tokens[i + 2];
      if (p?.type !== 'paragraph_open' || inline?.type !== 'inline' || !inline.children?.length) continue;
      const first = inline.children[0];
      if (first.type !== 'text') continue;
      const m = ALERT_RE.exec(first.content);
      if (!m) continue;
      const kind = m[1].toUpperCase();
      // Drop the marker and the line break after it.
      inline.children.shift();
      if (inline.children[0]?.type === 'softbreak' || inline.children[0]?.type === 'hardbreak') inline.children.shift();
      if (!inline.children.length) {
        p.hidden = true;
        tokens[i + 3].hidden = true;
      }
      t.meta = { alert: kind };
    } else if (t.type === 'blockquote_close') {
      const open = stack.pop();
      if (open?.meta?.alert) t.meta = { alert: open.meta.alert };
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Normalizes the fence info string to a language id: "js {1,3}" → "js". */
export function fenceLanguage(info: string): string {
  const lang = info.trim().split(/[\s{]/)[0] ?? '';
  return lang.replace(/^language-/, '').toLowerCase().slice(0, 40);
}

function lineOf(t: Token): string | null {
  const v = t.attrGet('data-line');
  return v === null ? null : String(v);
}

function createParser(opts: RenderOptions): MarkdownItInstance {
  const options: MarkdownItOptions = {
    html: opts.rawHtml,
    linkify: true,
    typographer: false,
    breaks: false,
    xhtmlOut: false,
    maxNesting: 50,
  };
  const md = new MarkdownIt('default', options);
  md.validateLink = validateLink;
  md.use(footnote);
  md.linkify.set({ fuzzyEmail: false, fuzzyLink: true });

  md.core.ruler.after('inline', 'mdv_tasks', taskLists);
  md.core.ruler.after('mdv_tasks', 'mdv_alerts', alerts);
  md.core.ruler.after('mdv_alerts', 'mdv_heading_ids', headingIds);
  md.core.ruler.push('mdv_lines', sourceLines);
  md.core.ruler.push('mdv_raw_html', (state) => {
    const env = state.env as unknown as Env;
    if (!opts.rawHtml || env.hasRawHtml) return;
    for (const t of state.tokens) {
      if (t.type === 'html_block' || (t.type === 'inline' && t.children?.some((c) => c.type === 'html_inline'))) {
        env.hasRawHtml = true;
        return;
      }
    }
  });

  const rules = md.renderer.rules;

  rules.task_checkbox = (tokens, idx) => {
    const checked = !!tokens[idx].meta?.checked;
    return `<span class="task-box${checked ? ' checked' : ''}" role="checkbox" aria-checked="${checked}" aria-disabled="true"></span>`;
  };

  rules.blockquote_open = (tokens, idx, options, _env, self) => {
    const kind = tokens[idx].meta?.alert as string | undefined;
    if (!kind) return self.renderToken(tokens, idx, options);
    const line = tokens[idx].attrGet('data-line');
    const lineAttr = line ? ` data-line="${line}"` : '';
    return `<div class="markdown-alert markdown-alert-${kind.toLowerCase()}"${lineAttr}><p class="markdown-alert-title">${ALERTS[kind]}</p>\n`;
  };
  rules.blockquote_close = (tokens, idx, options, _env, self) =>
    tokens[idx].meta?.alert ? '</div>\n' : self.renderToken(tokens, idx, options);

  // Code blocks: plain escaped code; the main thread adds the header, Copy
  // button, line numbers and (lazy) syntax highlighting.
  const renderCode = (code: string, lang: string, line: string | null, env: Env) => {
    env.codeBlocks++;
    const text = code.endsWith('\n') ? code.slice(0, -1) : code;
    const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
    const lineAttr = line ? ` data-line="${line}"` : '';
    return `<pre class="code-block"${langAttr}${lineAttr}><code>${escapeHtml(text)}</code></pre>\n`;
  };
  rules.fence = (tokens, idx, _o, env) => {
    const t = tokens[idx];
    return renderCode(t.content, fenceLanguage(t.info), lineOf(t), env as unknown as Env);
  };
  rules.code_block = (tokens, idx, _o, env) => {
    const t = tokens[idx];
    return renderCode(t.content, '', lineOf(t), env as unknown as Env);
  };

  // Tables can be wider than the page: wrap them for horizontal scrolling.
  rules.table_open = (tokens, idx, options, _env, self) =>
    `<div class="table-wrap">${self.renderToken(tokens, idx, options)}`;
  rules.table_close = (tokens, idx, options, _env, self) => `${self.renderToken(tokens, idx, options)}</div>\n`;

  const defaultImage = rules.image!;
  rules.image = (tokens, idx, options, env, self) => {
    tokens[idx].attrSet('loading', 'lazy');
    tokens[idx].attrSet('decoding', 'async');
    return defaultImage(tokens, idx, options, env, self);
  };

  return md;
}

const parsers = new Map<string, MarkdownItInstance>();

export function render(source: string, opts: RenderOptions): RenderResult {
  const key = JSON.stringify(opts);
  let md = parsers.get(key);
  if (!md) {
    md = createParser(opts);
    parsers.set(key, md);
  }
  const env: Env = { headings: [], slugs: new Map(), hasRawHtml: false, codeBlocks: 0 };
  const html = md.render(source, env as unknown as Record<string, unknown>);
  return { html, headings: env.headings, hasRawHtml: env.hasRawHtml, codeBlocks: env.codeBlocks };
}
