/**
 * Turns engine HTML into a DOM fragment that is safe to insert.
 *
 * Threat model: the Markdown file is untrusted. Defences, in order:
 *   1. markdown-it escapes text and rejects javascript:/vbscript:/data: links;
 *   2. raw HTML is sanitized by DOMPurify with a strict allow-list
 *      (no scripts, styles, forms, frames, embeds, SVG/MathML, event handlers);
 *   3. resources are rewritten before the nodes become live: local images go
 *      through the `mdimg` protocol, remote images are blocked unless allowed;
 *   4. the CSP forbids inline and remote scripts; the backend cancels any
 *      navigation away from the app.
 */
import DOMPurify from 'dompurify';
import { t } from '../i18n';

export interface ResourcePolicy {
  /** `http://mdimg.localhost/` (Windows) or `mdimg://localhost/`. Empty = no local images. */
  imageBase: string;
  remoteImages: boolean;
}

export interface FragmentInfo {
  blockedImages: number;
}

const FORBID_TAGS = [
  'script', 'style', 'link', 'meta', 'base', 'title', 'template', 'noscript',
  'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'portal',
  'form', 'input', 'button', 'textarea', 'select', 'option', 'optgroup', 'datalist', 'output',
  'svg', 'math', 'dialog', 'audio', 'video', 'track', 'source', 'canvas', 'slot',
];
const FORBID_ATTR = [
  'style', 'srcset', 'ping', 'formaction', 'action', 'background', 'poster',
  'target', 'autofocus', 'contenteditable', 'popover', 'tabindex', 'accesskey',
];

const SAFE_DATA_IMAGE = /^data:image\/(gif|png|jpeg|webp);/i;

function isRemote(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

function hasScheme(src: string): boolean {
  // `C:\x.png` is a path, `file:` is handled by the backend, anything else is a scheme.
  return /^[a-z][a-z0-9+.-]+:/i.test(src) && !/^file:/i.test(src);
}

function placeholder(doc: Document, img: Element, src: string): HTMLElement {
  const span = doc.createElement('span');
  span.className = 'img-blocked';
  span.setAttribute('data-remote-src', src);
  span.setAttribute('title', src);
  span.textContent = img.getAttribute('alt') || t('image.placeholder');
  return span;
}

function rewriteImage(img: Element, policy: ResourcePolicy, info: FragmentInfo): void {
  const src = (img.getAttribute('src') || '').trim();
  img.removeAttribute('srcset');
  img.setAttribute('referrerpolicy', 'no-referrer');
  if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
  if (!src) {
    img.remove();
    return;
  }
  if (SAFE_DATA_IMAGE.test(src)) return;
  if (isRemote(src)) {
    if (!policy.remoteImages) {
      // Never let the request start; the element is swapped for a placeholder
      // after sanitization (replacing nodes inside the sanitizer walk is unsafe).
      info.blockedImages++;
      img.removeAttribute('src');
      img.setAttribute('data-blocked-src', src);
    }
    return;
  }
  if (hasScheme(src) || !policy.imageBase) {
    img.removeAttribute('src');
    return;
  }
  img.setAttribute('data-src', src);
  img.setAttribute('src', policy.imageBase + encodeURIComponent(src));
}

function rewriteLink(a: Element): void {
  const href = a.getAttribute('href');
  if (href === null) return;
  a.removeAttribute('target');
  a.setAttribute('rel', 'noopener noreferrer');
  if (/^(https?:|mailto:)/i.test(href.trim())) a.classList.add('ext');
  if (!a.getAttribute('title') && !href.startsWith('#')) a.setAttribute('title', href);
}

function rewriteAll(root: ParentNode, policy: ResourcePolicy, info: FragmentInfo): void {
  root.querySelectorAll('img').forEach((img) => rewriteImage(img, policy, info));
  root.querySelectorAll('a[href]').forEach(rewriteLink);
}

function swapBlocked(root: ParentNode): void {
  root.querySelectorAll('img[data-blocked-src]').forEach((img) => {
    img.replaceWith(placeholder(img.ownerDocument, img, img.getAttribute('data-blocked-src') || ''));
  });
}

let hooksFor: { policy: ResourcePolicy; info: FragmentInfo } | null = null;
let hooksInstalled = false;

function installHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  // Runs inside DOMPurify's inert document, before nodes can load anything.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!hooksFor) return;
    if (node.nodeName === 'IMG') rewriteImage(node as Element, hooksFor.policy, hooksFor.info);
    else if (node.nodeName === 'A') rewriteLink(node as Element);
  });
}

export function sanitizeRawHtml(html: string): DocumentFragment {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS,
    FORBID_ATTR,
    ALLOW_DATA_ATTR: true,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    SANITIZE_NAMED_PROPS: true,
    KEEP_CONTENT: true,
    RETURN_DOM_FRAGMENT: true,
  }) as unknown as DocumentFragment;
}

/**
 * Builds the inert fragment for insertion. `hasRawHtml === false` means the
 * HTML came entirely from markdown-it's escaping renderer, so the (expensive)
 * sanitizer pass can be skipped; resource rewriting always runs.
 */
export function buildFragment(html: string, hasRawHtml: boolean, policy: ResourcePolicy): { fragment: DocumentFragment; info: FragmentInfo } {
  const info: FragmentInfo = { blockedImages: 0 };
  if (hasRawHtml) {
    installHooks();
    hooksFor = { policy, info };
    try {
      const fragment = sanitizeRawHtml(html);
      swapBlocked(fragment);
      return { fragment, info };
    } finally {
      hooksFor = null;
    }
  }
  const tpl = document.createElement('template');
  tpl.innerHTML = html; // template content is inert: nothing loads or runs here
  rewriteAll(tpl.content, policy, info);
  swapBlocked(tpl.content);
  return { fragment: tpl.content, info };
}
