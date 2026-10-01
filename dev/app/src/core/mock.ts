/**
 * Browser-only backend used by `npm run dev` outside the native shell.
 * Lets the UI be developed and previewed without the Rust side.
 */
import type { Backend, RecentItem } from './backend';
import sample from '../../../samples/feature-tour.md?raw';

export function createMockBackend(): Backend {
  let recent: RecentItem[] = [
    { path: 'C:\\Docs\\feature-tour.md', name: 'feature-tour.md', dir: 'C:\\Docs', openedAt: Date.now() - 60_000, pinned: true, exists: true },
    { path: 'C:\\Docs\\CHANGELOG.md', name: 'CHANGELOG.md', dir: 'C:\\Docs', openedAt: Date.now() - 3_600_000, pinned: false, exists: true },
    { path: 'C:\\Old\\moved.md', name: 'moved.md', dir: 'C:\\Old', openedAt: Date.now() - 86_400_000 * 3, pinned: false, exists: false },
  ];
  let settings: unknown = {};
  try {
    settings = JSON.parse(localStorage.getItem('mdvibe-mock-settings') || '{}');
  } catch {
    settings = {};
  }
  const doc = () => ({
    path: 'C:\\Docs\\feature-tour.md',
    name: 'feature-tour.md',
    dir: 'C:\\Docs',
    text: sample,
    encoding: 'UTF-8',
    bytes: sample.length,
    modifiedMs: Date.now(),
    lineEnding: 'LF' as const,
  });
  const params = new URLSearchParams(location.search);
  return {
    native: false,
    startupInfo: async () => ({
      productName: 'MDVibe',
      version: '0.0.0-dev',
      platform: 'browser',
      debug: true,
      launchFile: params.has('empty') ? null : 'C:\\Docs\\feature-tour.md',
      settings,
      imageBase: '',
      webviewVersion: null,
      logDir: '',
    }),
    loadSettings: async () => settings,
    openNotices: async () => {},
    openDocument: async () => doc(),
    reloadDocument: async () => doc(),
    pickMarkdownFile: async () => 'C:\\Docs\\feature-tour.md',
    openInNewWindow: async (p) => void window.open(location.pathname + (p ? '' : '?empty'), '_blank'),
    activateLink: async (href) =>
      /^https?:/i.test(href) ? (window.open(href, '_blank'), { kind: 'external', url: href }) : { kind: 'missing', path: href },
    openExternal: async (url) => void window.open(url, '_blank'),
    revealInFolder: async () => {},
    saveSettings: async (s) => {
      settings = s;
      localStorage.setItem('mdvibe-mock-settings', JSON.stringify(s));
    },
    recentList: async () => recent.slice(),
    recentRemove: async (p) => void (recent = recent.filter((r) => r.path !== p)),
    recentSetPinned: async (p, pinned) => void recent.forEach((r) => r.path === p && (r.pinned = pinned)),
    recentClear: async () => void (recent = []),
    exportPdf: async () => {
      window.print();
      return null;
    },
    log: (level, message) => console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](message),
    openLogFolder: async () => {},
    ready: async () => {},
    on: async () => {},
    onFileDrop: async () => {},
    setFullscreen: async (on) => {
      if (on) await document.documentElement.requestFullscreen?.();
      else if (document.fullscreenElement) await document.exitFullscreen();
    },
    isFullscreen: async () => !!document.fullscreenElement,
    setAlwaysOnTop: async () => {},
    setTheme: async () => {},
    closeWindow: async () => window.close(),
  };
}
