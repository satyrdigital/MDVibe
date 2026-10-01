/**
 * Code block chrome (language label, Copy button, optional line numbers) and
 * lazy syntax highlighting. Highlighting only runs for blocks near the
 * viewport, so huge documents stay responsive. Code is never executed.
 */
import hljs from 'highlight.js/lib/common';
import { h, icon } from '../ui/dom';
import { ICONS } from '../ui/icons';
import { t } from '../i18n';

export interface CodeOptions {
  highlight: boolean;
  lineNumbers: boolean;
  wrap: boolean;
}

/** Above this size a block is shown without highlighting (keeps the UI fluid). */
const MAX_HIGHLIGHT_CHARS = 150_000;

const ALIASES: Record<string, string> = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  ps1: 'powershell',
  pwsh: 'powershell',
  yml: 'yaml',
  jsonc: 'json',
  json5: 'json',
  html: 'xml',
  svg: 'xml',
  vue: 'xml',
  toml: 'ini',
  dockerfile: 'dockerfile',
  'c#': 'csharp',
  cs: 'csharp',
  'f#': 'fsharp',
  tsx: 'typescript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  rs: 'rust',
  py: 'python',
  rb: 'ruby',
  kt: 'kotlin',
  md: 'markdown',
  text: 'plaintext',
  txt: 'plaintext',
  plain: 'plaintext',
};

export function resolveLanguage(lang: string): string | null {
  if (!lang) return null;
  const id = ALIASES[lang] ?? lang;
  return hljs.getLanguage(id) ? id : null;
}

export function languageLabel(lang: string): string {
  const id = resolveLanguage(lang);
  const name = id ? hljs.getLanguage(id)?.name : undefined;
  return name && id !== 'plaintext' ? name.split(',')[0] : lang;
}

function highlightBlock(code: HTMLElement): void {
  if (code.dataset.hl === 'done') return;
  code.dataset.hl = 'done';
  const pre = code.parentElement as HTMLElement;
  const lang = resolveLanguage(pre.dataset.lang ?? '');
  if (!lang || lang === 'plaintext') return;
  const text = code.textContent ?? '';
  if (text.length > MAX_HIGHLIGHT_CHARS) return;
  try {
    // hljs escapes the source; the result contains only its own <span> markup.
    code.innerHTML = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
    code.classList.add('hljs');
  } catch {
    /* unknown grammar edge case: keep plain text */
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { 'aria-hidden': 'true' });
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export { copyText };

function copyButton(code: HTMLElement): HTMLButtonElement {
  const label = h('span', { class: 'label' }, t('code.copy'));
  const btn = h('button', { type: 'button', class: 'code-copy', title: t('code.copyTitle') }, icon(ICONS.copy), label);
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    // textContent is exactly the source: line numbers live outside <code>.
    const ok = await copyText(code.textContent ?? '');
    label.textContent = ok ? t('code.copied') : t('code.copyFailed');
    btn.classList.toggle('done', ok);
    window.setTimeout(() => {
      label.textContent = t('code.copy');
      btn.classList.remove('done');
    }, 1600);
  });
  return btn;
}

let observer: IntersectionObserver | null = null;

export function decorateCodeBlocks(root: HTMLElement, opts: CodeOptions, scroller: HTMLElement): void {
  observer?.disconnect();
  observer = opts.highlight
    ? new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            observer?.unobserve(e.target);
            const code = (e.target as HTMLElement).querySelector('code');
            if (code) highlightBlock(code);
          }
        },
        { root: scroller, rootMargin: '1200px 0px' },
      )
    : null;

  root.querySelectorAll<HTMLElement>('pre.code-block').forEach((pre) => {
    const code = pre.querySelector('code');
    if (!code || pre.parentElement?.classList.contains('code-frame')) return;
    const lang = pre.dataset.lang ?? '';
    const frame = h('div', { class: 'code-frame', 'data-line': pre.dataset.line ?? null });
    const head = h(
      'div',
      { class: 'code-head' },
      h('span', { class: 'code-lang' }, lang ? languageLabel(lang) : ''),
      copyButton(code),
    );
    pre.replaceWith(frame);
    const body = h('div', { class: 'code-body' });
    if (opts.lineNumbers && !opts.wrap) {
      const lines = (code.textContent ?? '').split('\n').length;
      const nums = Array.from({ length: lines }, (_, i) => String(i + 1)).join('\n');
      body.append(h('div', { class: 'code-gutter', 'aria-hidden': 'true' }, nums));
    }
    body.append(pre);
    frame.append(head, body);
    if (opts.wrap) pre.classList.add('wrap');
    if (observer) observer.observe(frame);
  });
}

/** Highlights everything synchronously (before printing / PDF export). */
export function highlightAll(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('pre.code-block > code').forEach(highlightBlock);
}
