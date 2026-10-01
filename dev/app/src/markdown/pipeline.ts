/**
 * Source → render result, on the main thread for typical documents and in a
 * Web Worker for large ones (keeps the window responsive while parsing).
 */
import { render, type RenderOptions, type RenderResult } from './engine';

/** Documents above this size are parsed off the UI thread. */
const WORKER_THRESHOLD = 256 * 1024;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: RenderResult) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; result?: RenderResult; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.result) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error ?? 'render failed'));
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'worker error'));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

export async function renderMarkdown(source: string, options: RenderOptions): Promise<RenderResult> {
  if (source.length < WORKER_THRESHOLD) return render(source, options);
  try {
    const w = getWorker();
    const id = ++seq;
    return await new Promise<RenderResult>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ id, source, options });
    });
  } catch {
    // Worker unavailable: fall back to the main thread.
    return render(source, options);
  }
}
