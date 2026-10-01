/** Short, non-blocking notifications (announced to screen readers). */
import { h } from './dom';

let host: HTMLElement | null = null;

export interface ToastAction {
  label: string;
  run: () => void;
}

export function toast(message: string, opts: { kind?: 'info' | 'error'; action?: ToastAction; ms?: number } = {}): void {
  if (!host) {
    host = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const el = h('div', { class: `toast ${opts.kind ?? 'info'}` }, h('span', {}, message));
  if (opts.action) {
    const a = opts.action;
    el.append(
      h('button', { type: 'button', class: 'link-btn', onclick: () => { a.run(); el.remove(); } }, a.label),
    );
  }
  host.append(el);
  while (host.childElementCount > 3) host.firstElementChild?.remove();
  window.setTimeout(() => el.remove(), opts.ms ?? (opts.action ? 6000 : 3200));
}
