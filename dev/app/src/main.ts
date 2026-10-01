import './styles/tokens.css';
import './styles/app.css';
import './styles/markdown.css';
import './styles/code.css';
import './styles/print.css';
import { createBackend } from './core/backend';
import { App } from './ui/app';
import { toast } from './ui/toast';
import { resolveLanguage, setLanguage, t } from './i18n';
import { normalize } from './core/settings';

async function main(): Promise<void> {
  const backend = await createBackend();

  // Unexpected errors: keep running, tell the user briefly, keep details in the local log.
  const report = (what: string) => {
    backend.log('error', what);
    toast(t('error.unexpected'), {
      kind: 'error',
      action: backend.native ? { label: t('menu.logFolder'), run: () => void backend.openLogFolder() } : undefined,
    });
  };
  window.addEventListener('error', (e) => report(`${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => report(`unhandled rejection: ${String(e.reason)}`));

  const info = await backend.startupInfo();
  // Language before any UI is built: saved choice, or the Windows display language (English fallback).
  setLanguage(resolveLanguage(normalize(info.settings).appearance.language));
  // Theme before first paint to avoid a flash.
  const pref = (info.settings as { appearance?: { theme?: string } } | null)?.appearance?.theme;
  const dark = pref === 'dark' || (pref !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.platform = info.platform;

  await new App(backend, info).start();
}

main().catch((e) => {
  document.body.textContent = `MDVibe failed to start: ${String(e)}`;
  console.error(e);
});
