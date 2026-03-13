import type { Worker } from 'tesseract.js';

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

  return createWorker('nor+eng');
};
