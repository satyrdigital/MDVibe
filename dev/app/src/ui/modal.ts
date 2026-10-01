/** Accessible modal dialog: focus trap, Esc to close, focus restored on close. */
import { h, icon } from './dom';
import { ICONS } from './icons';
import { t } from '../i18n';

let current: Modal | null = null;

export function isModalOpen(): boolean {
  return current !== null;
}

export function closeModal(): void {
  current?.close();
}

export class Modal {
  readonly root: HTMLDivElement;
  readonly body: HTMLDivElement;
  private returnFocus: HTMLElement | null;

  constructor(title: string, opts: { wide?: boolean; onClose?: () => void } = {}) {
    current?.close();
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.body = h('div', { class: 'modal-body' });
    const titleId = `modal-title-${Math.random().toString(36).slice(2)}`;
    const dialog = h(
      'div',
      { class: `modal${opts.wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h(
        'div',
        { class: 'modal-head' },
        h('h2', { id: titleId }, title),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.close'), title: t('common.close'), onclick: () => this.close() }, icon(ICONS.close)),
      ),
      this.body,
    );
    this.root = h('div', { class: 'modal-backdrop' }, dialog);
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close();
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      } else if (e.key === 'Tab') {
        this.trap(e);
      }
    });
    this.onClose = opts.onClose;
    current = this;
  }

  private onClose?: () => void;

  show(): this {
    document.body.append(this.root);
    const first = this.root.querySelector<HTMLElement>('.modal-body button, .modal-body input, .modal-body select, .modal-body a[href], .modal-body [tabindex="0"]');
    (first ?? this.root.querySelector<HTMLElement>('.modal-head button'))?.focus();
    return this;
  }

  private trap(e: KeyboardEvent): void {
    const focusables = Array.from(
      this.root.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]'),
    ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  close(): void {
    if (current !== this) return;
    current = null;
    this.root.remove();
    this.onClose?.();
    this.returnFocus?.focus?.();
  }
}
