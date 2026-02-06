import { JSDOM } from 'jsdom'; // happy-dom does not support parsing XML from Excel files.

const { DOMParser } = new JSDOM('').window;

globalThis.DOMParser = DOMParser as unknown as typeof globalThis.DOMParser;
