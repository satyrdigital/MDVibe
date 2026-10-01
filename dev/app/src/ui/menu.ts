/**
 * Popup menus (app menu, submenus, context menus) with keyboard navigation:
 * ↑/↓ move, → / Enter open submenu, ← / Esc close, Enter activates.
 */
import { h, icon } from './dom';
import { ICONS } from './icons';

export interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  submenu?: () => MenuEntry[];
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  title?: string;
}
export type MenuEntry = MenuItem | 'separator';

let openMenus: Menu[] = [];

export function closeAllMenus(): void {
  for (const m of openMenus.slice().reverse()) m.close(false);
  openMenus = [];
}

export function isMenuOpen(): boolean {
  return openMenus.length > 0;
}

class Menu {
  readonly el: HTMLDivElement;
  private items: { el: HTMLElement; item: MenuItem }[] = [];
  private child: Menu | null = null;
  private returnFocus: HTMLElement | null;

  constructor(
    entries: MenuEntry[],
    private parent: Menu | null,
    private onClose?: () => void,
  ) {
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.el = h('div', { class: 'menu', role: 'menu', tabindex: '-1' });
    for (const entry of entries) {
      if (entry === 'separator') {
        this.el.append(h('div', { class: 'menu-sep', role: 'separator' }));
        continue;
      }
      const it = entry;
      const role = it.checked === undefined ? 'menuitem' : 'menuitemcheckbox';
      const row = h(
        'div',
        {
          class: `menu-item${it.disabled ? ' disabled' : ''}${it.danger ? ' danger' : ''}`,
          role,
          tabindex: '-1',
          'aria-disabled': it.disabled ? 'true' : null,
          'aria-checked': it.checked === undefined ? null : String(it.checked),
          'aria-haspopup': it.submenu ? 'menu' : null,
          title: it.title ?? null,
        },
        h('span', { class: 'menu-check' }, it.checked ? icon(ICONS.check) : ''),
        h('span', { class: 'menu-label' }, it.label),
        it.shortcut ? h('span', { class: 'menu-shortcut' }, it.shortcut) : null,
        it.submenu ? icon(ICONS.chevron, 'icon menu-sub') : null,
      );
      row.addEventListener('mouseenter', () => {
        this.focusItem(this.items.findIndex((x) => x.el === row));
        if (it.submenu && !it.disabled) this.openSub(it, row);
        else this.closeChild();
      });
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        this.activate(it, row);
      });
      this.items.push({ el: row, item: it });
      this.el.append(row);
    }
    this.el.addEventListener('keydown', (e) => this.onKey(e));
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    openMenus.push(this);
  }

  private activate(it: MenuItem, row: HTMLElement): void {
    if (it.disabled) return;
    if (it.submenu) {
      this.openSub(it, row, true);
      return;
    }
    closeAllMenus();
    it.action?.();
  }

  private openSub(it: MenuItem, row: HTMLElement, focusFirst = false): void {
    if (this.child && this.child.anchorRow === row) {
      if (focusFirst) this.child.focusItem(0);
      return;
    }
    this.closeChild();
    const sub = new Menu(it.submenu!(), this);
    sub.anchorRow = row;
    this.child = sub;
    document.body.append(sub.el);
    const r = row.getBoundingClientRect();
    positionMenu(sub.el, r.right - 4, r.top - 6, r.left + 4);
    if (focusFirst) sub.focusItem(0);
  }

  anchorRow: HTMLElement | null = null;

  private closeChild(): void {
    this.child?.close(false);
    this.child = null;
  }

  focusItem(i: number): void {
    const enabled = this.items.filter((x) => !x.item.disabled);
    if (!enabled.length) {
      this.el.focus();
      return;
    }
    const target = this.items[i] && !this.items[i].item.disabled ? this.items[i] : enabled[0];
    this.items.forEach((x) => x.el.classList.toggle('active', x === target));
    target.el.focus();
  }

  private move(delta: number): void {
    const enabled = this.items.filter((x) => !x.item.disabled);
    if (!enabled.length) return;
    const cur = enabled.findIndex((x) => x.el === document.activeElement);
    const next = enabled[(cur + delta + enabled.length) % enabled.length];
    this.focusItem(this.items.indexOf(next));
  }

  private onKey(e: KeyboardEvent): void {
    const cur = this.items.find((x) => x.el === document.activeElement);
    switch (e.key) {
      case 'ArrowDown':
        this.move(1);
        break;
      case 'ArrowUp':
        this.move(-1);
        break;
      case 'Home':
        this.move(-this.items.length);
        break;
      case 'ArrowRight':
        if (cur?.item.submenu) this.openSub(cur.item, cur.el, true);
        break;
      case 'ArrowLeft':
        if (this.parent) {
          const p = this.parent;
          this.close(false);
          p.child = null;
          p.focusItem(p.items.findIndex((x) => x.el === this.anchorRow));
        }
        break;
      case 'Enter':
      case ' ':
        if (cur) this.activate(cur.item, cur.el);
        break;
      case 'Escape':
        closeAllMenus();
        break;
      case 'Tab':
        closeAllMenus();
        break;
      default:
        // Type-ahead by first letter.
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const k = e.key.toLowerCase();
          const hit = this.items.find((x) => !x.item.disabled && x.item.label.toLowerCase().startsWith(k));
          if (hit) this.focusItem(this.items.indexOf(hit));
        }
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  close(restoreFocus = true): void {
    this.closeChild();
    this.el.remove();
    openMenus = openMenus.filter((m) => m !== this);
    if (!this.parent) {
      this.onClose?.();
      if (restoreFocus) this.returnFocus?.focus?.();
    }
  }
}

function positionMenu(el: HTMLElement, x: number, y: number, altRight?: number): void {
  el.style.left = '0px';
  el.style.top = '0px';
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x;
  if (left + r.width > vw - 4) left = altRight !== undefined ? altRight - r.width : vw - r.width - 4;
  left = Math.max(4, left);
  let top = y;
  if (top + r.height > vh - 4) top = Math.max(4, vh - r.height - 4);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

/** Opens a menu at a point (context menu) or under an anchor element. */
export function openMenu(entries: MenuEntry[], at: { x: number; y: number } | HTMLElement, onClose?: () => void): void {
  closeAllMenus();
  const menu = new Menu(entries, null, onClose);
  document.body.append(menu.el);
  if (at instanceof HTMLElement) {
    const r = at.getBoundingClientRect();
    positionMenu(menu.el, r.right - menu.el.getBoundingClientRect().width, r.bottom + 4);
    at.setAttribute('aria-expanded', 'true');
    const prev = onClose;
    menu['onClose'] = () => {
      at.setAttribute('aria-expanded', 'false');
      prev?.();
    };
  } else {
    positionMenu(menu.el, at.x, at.y);
  }
  menu.focusItem(0);
}

document.addEventListener(
  'mousedown',
  (e) => {
    if (!openMenus.length) return;
    if (openMenus.some((m) => m.el.contains(e.target as Node))) return;
    closeAllMenus();
  },
  true,
);
window.addEventListener('blur', () => closeAllMenus());
window.addEventListener('resize', () => closeAllMenus());
