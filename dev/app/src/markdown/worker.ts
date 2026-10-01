/// <reference lib="webworker" />
// Parses large documents off the UI thread.
import { render, type RenderOptions } from './engine';

self.onmessage = (e: MessageEvent<{ id: number; source: string; options: RenderOptions }>) => {
  const { id, source, options } = e.data;
  try {
    const result = render(source, options);
    (self as unknown as Worker).postMessage({ id, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
