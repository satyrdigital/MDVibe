/** Small form controls shared by Settings and the Layout panel. */
import { h } from './dom';

let uid = 0;
const nextId = (p: string) => `${p}-${++uid}`;

export function field(label: string, control: HTMLElement, hint?: string, labelFor?: string): HTMLElement {
  return h(
    'div',
    { class: 'field' },
    h('label', { class: 'field-label', for: labelFor ?? null }, label),
    h('div', { class: 'field-control' }, control),
    hint ? h('p', { class: 'field-hint' }, hint) : null,
  );
}

export function segmented<T extends string>(
  label: string,
  options: { value: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
): HTMLElement {
  const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
  const buttons = options.map((o) => {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(o.value === value), tabindex: o.value === value ? '0' : '-1' }, o.label);
    b.addEventListener('click', () => select(o.value));
    return b;
  });
  const select = (v: T) => {
    buttons.forEach((b, i) => {
      const on = options[i].value === v;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    onChange(v);
  };
  group.addEventListener('keydown', (e) => {
    const i = buttons.findIndex((b) => b === document.activeElement);
    if (i < 0) return;
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + buttons.length) % buttons.length;
    buttons[n].focus();
    select(options[n].value);
  });
  group.append(...buttons);
  return field(label, group);
}

export function toggle(label: string, value: boolean, onChange: (v: boolean) => void, hint?: string): HTMLElement {
  const id = nextId('tg');
  const input = h('input', { type: 'checkbox', role: 'switch', id, class: 'switch' });
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  return h(
    'div',
    { class: 'field toggle-field' },
    h('label', { class: 'field-label', for: id }, label),
    input,
    hint ? h('p', { class: 'field-hint' }, hint) : null,
  );
}

export function slider(
  label: string,
  o: { min: number; max: number; step: number; value: number; format: (v: number) => string },
  onChange: (v: number) => void,
): HTMLElement {
  const id = nextId('sl');
  const out = h('output', { class: 'slider-value', for: id }, o.format(o.value));
  const input = h('input', { type: 'range', id, min: o.min, max: o.max, step: o.step });
  input.value = String(o.value);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = o.format(v);
    onChange(v);
  });
  return field(label, h('div', { class: 'slider' }, input, out), undefined, id);
}

export function select<T extends string>(
  label: string,
  options: { value: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
): HTMLElement {
  const id = nextId('se');
  const sel = h('select', { id });
  for (const o of options) {
    const opt = h('option', { value: o.value }, o.label);
    if (o.value === value) opt.selected = true;
    sel.append(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value as T));
  return field(label, sel, undefined, id);
}

export function numberInput(label: string, o: { min: number; max: number; step: number; value: number; unit: string }, onChange: (v: number) => void): HTMLElement {
  const id = nextId('nu');
  const input = h('input', { type: 'number', id, min: o.min, max: o.max, step: o.step, class: 'num' });
  input.value = String(o.value);
  input.addEventListener('change', () => {
    const v = Math.min(o.max, Math.max(o.min, Number(input.value) || o.value));
    input.value = String(v);
    onChange(v);
  });
  return field(label, h('div', { class: 'num-wrap' }, input, h('span', { class: 'unit' }, o.unit)), undefined, id);
}

export function section(title: string, ...children: HTMLElement[]): HTMLElement {
  return h('section', { class: 'form-section' }, h('h3', {}, title), ...children);
}
