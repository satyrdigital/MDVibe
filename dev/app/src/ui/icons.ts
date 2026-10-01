/** Inline 20×20 stroke icons (own drawings, currentColor). */
const svg = (body: string) =>
  `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  sidebar: svg('<rect x="2.5" y="3.5" width="15" height="13" rx="2"/><path d="M7.5 3.5v13"/>'),
  search: svg('<circle cx="8.5" cy="8.5" r="5"/><path d="m12.5 12.5 4 4"/>'),
  more: svg('<circle cx="4.5" cy="10" r=".9" fill="currentColor"/><circle cx="10" cy="10" r=".9" fill="currentColor"/><circle cx="15.5" cy="10" r=".9" fill="currentColor"/>'),
  type: svg('<path d="M3 15.5 7 4.5l4 11M4.4 12h5.2"/><path d="M13 9.5a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8zm2.4 0v6"/>'),
  close: svg('<path d="m5 5 10 10M15 5 5 15"/>'),
  up: svg('<path d="m5 12.5 5-5 5 5"/>'),
  down: svg('<path d="m5 7.5 5 5 5-5"/>'),
  chevron: svg('<path d="m8 5 5 5-5 5"/>'),
  copy: svg('<rect x="7" y="7" width="9.5" height="9.5" rx="1.8"/><path d="M13 7V5.3A1.8 1.8 0 0 0 11.2 3.5H5.3A1.8 1.8 0 0 0 3.5 5.3v5.9A1.8 1.8 0 0 0 5.3 13H7"/>'),
  check: svg('<path d="m4.5 10.5 3.5 3.5 7.5-8"/>'),
  pin: svg('<path d="M12.5 3.5 16.5 7.5l-3 1.5-3 3 .5 3.5-1.5 1.5-3-3-3.5 3.5M6.5 11l-2-2 1.5-1.5 3.5.5 3-3z"/>'),
  folder: svg('<path d="M2.5 6.2A1.7 1.7 0 0 1 4.2 4.5h3.3l1.8 1.8h6.5a1.7 1.7 0 0 1 1.7 1.7v6.8a1.7 1.7 0 0 1-1.7 1.7H4.2a1.7 1.7 0 0 1-1.7-1.7z"/>'),
  file: svg('<path d="M5.5 2.5h6l3 3v11a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z"/><path d="M11.5 2.5v3h3"/>'),
  refresh: svg('<path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3.5h-3.5"/>'),
  outline: svg('<path d="M4 5h12M7 10h9M10 15h6"/>'),
  clock: svg('<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2"/>'),
  warn: svg('<path d="M10 3 2.5 16.5h15z"/><path d="M10 8v4M10 14.2v.3"/>'),
  info: svg('<circle cx="10" cy="10" r="7"/><path d="M10 9v5M10 6.3v.3"/>'),
  image: svg('<rect x="3" y="4" width="14" height="12" rx="1.8"/><circle cx="7.5" cy="8.5" r="1.3"/><path d="m3.5 14 4-4 3 3 2-2 4 4"/>'),
  heart: svg('<path d="M10 16.5s-6.5-3.9-6.5-8.3A3.6 3.6 0 0 1 10 6a3.6 3.6 0 0 1 6.5 2.2c0 4.4-6.5 8.3-6.5 8.3z"/>'),
  sun: svg('<circle cx="10" cy="10" r="3.4"/><path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3"/>'),
  moon: svg('<path d="M15.8 12.6A6.5 6.5 0 0 1 7.4 4.2a6.5 6.5 0 1 0 8.4 8.4z"/>'),
  monitor: svg('<rect x="2.5" y="3.5" width="15" height="10" rx="1.6"/><path d="M7 16.5h6M10 13.5v3"/>'),
  globe: svg('<circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c2 2 3 4.4 3 7s-1 5-3 7c-2-2-3-4.4-3-7s1-5 3-7z"/>'),
  external: svg('<path d="M11.5 3.5h5v5M16.5 3.5 9.5 10.5M14.5 12v3.3a1.2 1.2 0 0 1-1.2 1.2H4.7a1.2 1.2 0 0 1-1.2-1.2V6.7a1.2 1.2 0 0 1 1.2-1.2H8"/>'),
  // Brand mark "Page Fold" (dev/assets/brand/svg/mdvibe-icon.svg).
  logo: `<svg viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="15" fill="#3B5BDB"/><path d="M18 10H36L48 22V54H18Z" fill="#fff"/><path d="M36 10L48 22H36Z" fill="#FFB84D"/><rect x="23" y="29" width="20" height="4" rx="2" fill="#3B5BDB"/><rect x="23" y="37" width="20" height="4" rx="2" fill="#3B5BDB"/><rect x="23" y="45" width="12" height="4" rx="2" fill="#3B5BDB"/></svg>`,
} as const;
