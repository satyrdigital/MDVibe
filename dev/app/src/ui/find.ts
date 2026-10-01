/**
 * In-document search (Ctrl+F) over the rendered text. Uses the CSS Custom
 * Highlight API, so the document DOM is never modified by searching.
 */
import { h, icon } from './dom';
import { ICONS } from './icons';
import { t } from '../i18n';

const MAX_MATCHES = 10_000;
const BLOCKS = 'p,li,h1,h2,h3,h4,h5,h6,td,th,pre,blockquote,dt,dd,summary,figcaption,div,section';
const SKIP = '.code-head,.code-gutter,.img-blocked';

interface Indexed {
  text: string;
  nodes: Text[];
  starts: number[];
}

function indexText(root: HTMLElement): Indexed {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || p.closest(SKIP)) return NodeFilter.FILTER_REJECT;
      return n.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = '';
  let lastBlock: Element | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const block = n.parentElement!.closest(BLOCKS);
    // A separator that no query can match keeps matches inside one block.
    if (lastBlock && block !== lastBlock) text += '\u0000';
    lastBlock = block;
    nodes.push(n as Text);
    starts.push(text.length);
    text += n.nodeValue;
  }
  return { text, nodes, starts };
}

function nodeAt(idx: Indexed, offset: number): number {
  let lo = 0;
  let hi = idx.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (idx.starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class FindBar {
  readonly el: HTMLDivElement;
  private input: HTMLInputElement;
  private count: HTMLSpanElement;
  private caseBtn: HTMLButtonElement;
  private ranges: Range[] = [];
  private current = -1;
  private matchCase = false;
  private timer = 0;
  private readonly supported = typeof CSS !== 'undefined' && 'highlights' in CSS;

  constructor(
    private getRoot: () => HTMLElement | null,
    private scroller: HTMLElement,
  ) {
    this.input = h('input', {
      type: 'search',
      class: 'find-input',
      placeholder: t('find.placeholder'),
      'aria-label': t('find.placeholder'),
      spellcheck: 'false',
      autocomplete: 'off',
    });
    this.count = h('span', { class: 'find-count', 'aria-live': 'polite' });
    this.caseBtn = h('button', { type: 'button', class: 'icon-btn find-case', title: t('find.matchCase'), 'aria-pressed': 'false' }, 'Aa');
    this.caseBtn.addEventListener('click', () => {
      this.matchCase = !this.matchCase;
      this.caseBtn.setAttribute('aria-pressed', String(this.matchCase));
      this.search();
    });
    this.el = h(
      'div',
      { class: 'find-bar', role: 'search', hidden: true },
      this.input,
      this.count,
      this.caseBtn,
      h('button', { type: 'button', class: 'icon-btn', title: t('find.prev'), 'aria-label': t('find.prev'), onclick: () => this.step(-1) }, icon(ICONS.up)),
      h('button', { type: 'button', class: 'icon-btn', title: t('find.next'), 'aria-label': t('find.next'), onclick: () => this.step(1) }, icon(ICONS.down)),
      h('button', { type: 'button', class: 'icon-btn', title: t('find.close'), 'aria-label': t('find.close'), onclick: () => this.close() }, icon(ICONS.close)),
    );
    this.input.addEventListener('input', () => {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.search(), 90);
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        window.clearTimeout(this.timer);
        if (!this.ranges.length) this.search();
        this.step(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.el.hidden = false;
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length < 200 && !sel.includes('\n')) this.input.value = sel;
    this.input.focus();
    this.input.select();
    if (this.input.value) this.search();
  }

  close(): void {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.clearHighlights();
    this.ranges = [];
    this.count.textContent = '';
    this.scroller.focus({ preventScroll: true });
  }

  /** Re-runs the query after the document was re-rendered. */
  refresh(): void {
    if (this.isOpen && this.input.value) this.search(false);
  }

  next(dir: 1 | -1): void {
    if (!this.isOpen) {
      this.open();
      return;
    }
    if (!this.ranges.length) this.search();
    this.step(dir);
  }

  private clearHighlights(): void {
    if (!this.supported) return;
    CSS.highlights.delete('mdv-find');
    CSS.highlights.delete('mdv-find-current');
  }

  private search(jump = true): void {
    const q = this.input.value;
    const root = this.getRoot();
    this.ranges = [];
    this.current = -1;
    this.clearHighlights();
    if (!q || !root) {
      this.count.textContent = '';
      this.el.classList.remove('no-match');
      return;
    }
    const idx = indexText(root);
    const re = new RegExp(escapeRe(q), this.matchCase ? 'gu' : 'giu');
    let m: RegExpExecArray | null;
    let capped = false;
    while ((m = re.exec(idx.text))) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const s = m.index;
      const e = s + m[0].length;
      const a = nodeAt(idx, s);
      const b = nodeAt(idx, e - 1);
      const r = document.createRange();
      r.setStart(idx.nodes[a], s - idx.starts[a]);
      r.setEnd(idx.nodes[b], e - idx.starts[b]);
      this.ranges.push(r);
      if (this.ranges.length >= MAX_MATCHES) {
        capped = true;
        break;
      }
    }
    this.el.classList.toggle('no-match', this.ranges.length === 0);
    if (this.supported && this.ranges.length) CSS.highlights.set('mdv-find', new Highlight(...this.ranges));
    if (!this.ranges.length) {
      this.count.textContent = t('find.none');
      return;
    }
    // Start from the first match below the current scroll position.
    const top = this.scroller.getBoundingClientRect().top;
    let first = this.ranges.findIndex((r) => r.getBoundingClientRect().top >= top);
    if (first < 0) first = 0;
    this.current = first - 1;
    this.capped = capped;
    if (jump) this.step(1);
    else this.updateCount();
  }

  private capped = false;

  private updateCount(): void {
    const total = `${this.ranges.length}${this.capped ? '+' : ''}`;
    this.count.textContent = this.current >= 0 ? t('find.count', { n: this.current + 1, total }) : total;
  }

  private step(dir: number): void {
    if (!this.ranges.length) return;
    this.current = (this.current + dir + this.ranges.length) % this.ranges.length;
    const r = this.ranges[this.current];
    if (this.supported) CSS.highlights.set('mdv-find-current', new Highlight(r));
    this.updateCount();
    const rect = r.getBoundingClientRect();
    const box = this.scroller.getBoundingClientRect();
    if (rect.top < box.top + 60 || rect.bottom > box.bottom - 40) {
      this.scroller.scrollTop += rect.top - box.top - box.height / 3;
    }
    // Make matches inside collapsed <details> visible.
    const det = (r.startContainer.parentElement as HTMLElement | null)?.closest('details');
    if (det && !det.open) det.open = true;
  }
}
