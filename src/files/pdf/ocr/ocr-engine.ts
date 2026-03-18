import type { Worker } from 'tesseract.js';

declare const __TESSERACT_CDN_URL__: string;

/**
 * Production: full internal CDN URL (baked in at build time).
 * Dev: undefined — worker/core served from local dev server, lang data from jsdelivr.
 */
const TESSERACT_CDN = __TESSERACT_CDN_URL__.length === 0 ? undefined : __TESSERACT_CDN_URL__;

let workerPromise: Promise<Worker> | null = null;

/** Lazily create and return a shared Tesseract worker for OCR. */
export const getOcrWorker = (): Promise<Worker> => {
  if (workerPromise === null) {
    workerPromise = createOcrWorker();
  }

  return workerPromise;
};

const createOcrWorker = async (): Promise<Worker> => {
  const { createWorker } = await import('tesseract.js');

  const baseUrl = TESSERACT_CDN ?? `${window.location.origin}/tesseract`;

  return createWorker('nor+eng', undefined, {
    workerPath: `${baseUrl}/worker.min.js`,
    corePath: `${baseUrl}/`,
    langPath: `${baseUrl}/lang/`,
  });
};
