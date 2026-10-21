import { describe, expect, it, spyOn } from 'bun:test';
import { createLocalStorageHighlightStorage } from '@dev/highlight-storage';
import { JSDOM } from 'jsdom';
import type {
  HighlightChanges,
  HighlightStorage,
  HighlightStorageDocument,
  HighlightStorageListeners,
  MarkerHighlight,
} from '@/index';
import { getStorageKey } from '@/lib/storage-key';

const DOCUMENT: HighlightStorageDocument = { id: '/document.pdf', format: 'ARKIV' };
const KEY = getStorageKey('highlights', DOCUMENT.id, DOCUMENT.format);
const highlight = (id: string, x: number): MarkerHighlight => ({
  id,
  pageIndex: 0,
  source: 'pdf',
  rects: [{ x, y: 0.2, width: 0.1, height: 0.02 }],
  text: id,
  createdAt: 0,
});
const EXISTING = highlight('existing', 0.1);
const KEPT = highlight('kept', 0.3);
const ADDED = highlight('added', 0.5);

describe('createLocalStorageHighlightStorage', () => {
  it('applies a batch in one write, returns the applied changes and ignores retries', async () => {
    await withStorage(async (dom, storage) => {
      setStored(dom, [EXISTING, KEPT], []);
      const setItem = spyOn(dom.window.Storage.prototype, 'setItem');
      const changes: HighlightChanges = { added: [ADDED], removedIds: ['existing'] };

      try {
        expect(await storage.save(DOCUMENT, changes)).toEqual(changes);
        expect(getStored(dom)).toEqual({ highlights: [KEPT, ADDED], removedIds: ['existing'] });
        expect(setItem).toHaveBeenCalledTimes(1);

        expect(await storage.save(DOCUMENT, changes)).toEqual({ added: [], removedIds: ['existing'] });
        expect(getStored(dom)).toEqual({ highlights: [KEPT, ADDED], removedIds: ['existing'] });
      } finally {
        setItem.mockRestore();
      }
    });
  });

  it('leaves the entire batch unapplied and reports no changes when the write fails', async () => {
    await withStorage(async (dom, storage) => {
      setStored(dom, [EXISTING], []);
      const { events, listeners } = record();
      const unsubscribe = storage.subscribe(listeners);
      const setItem = spyOn(dom.window.Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Quota exceeded');
      });

      try {
        await expect(storage.save(DOCUMENT, { added: [ADDED], removedIds: ['existing'] })).rejects.toThrow(
          'Quota exceeded',
        );
        expect(getStored(dom)).toEqual({ highlights: [EXISTING], removedIds: [] });
        expect(events).toHaveLength(1);
      } finally {
        setItem.mockRestore();
        unsubscribe();
      }
    });
  });

  it('reports a snapshot on subscribe and on changes from other tabs, and unsubscribes', async () => {
    await withStorage(async (dom, storage) => {
      setStored(dom, [EXISTING, KEPT], ['old']);
      const { events, listeners } = record();
      const unsubscribe = storage.subscribe(listeners);
      const event = () => new dom.window.StorageEvent('storage', { key: KEY, storageArea: dom.window.localStorage });

      setStored(dom, [KEPT, ADDED], ['old', 'existing']);
      dom.window.dispatchEvent(event());

      expect(events).toEqual([
        ['snapshot', [{ ...DOCUMENT, highlights: [EXISTING, KEPT] }]],
        ['snapshot', [{ ...DOCUMENT, highlights: [KEPT, ADDED] }]],
      ]);

      unsubscribe();
      dom.window.dispatchEvent(event());
      expect(events).toHaveLength(2);
    });
  });

  it('reports saves to every same-tab subscriber, including the writer', async () => {
    await withStorage(async (_dom, storage) => {
      const peer = createLocalStorageHighlightStorage();
      const own = record();
      const received = record();
      const unsubscribeOwn = storage.subscribe(own.listeners);
      const unsubscribePeer = peer.subscribe(received.listeners);

      try {
        await storage.save(DOCUMENT, { added: [EXISTING], removedIds: [] });
        const changed = [
          ['added', DOCUMENT, [EXISTING]],
          ['removed', DOCUMENT, []],
        ];
        expect(own.events.slice(1)).toEqual(changed);
        expect(received.events.slice(1)).toEqual(changed);

        unsubscribePeer();
        await storage.save(DOCUMENT, { added: [], removedIds: ['existing'] });
        expect(own.events).toHaveLength(5);
        expect(received.events).toHaveLength(3);
      } finally {
        unsubscribeOwn();
        unsubscribePeer();
      }
    });
  });
});

/** Records each event as `[name, ...arguments]`. */
const record = () => {
  const events: unknown[][] = [];
  const listeners: HighlightStorageListeners = {
    snapshot: (...args) => events.push(['snapshot', ...args]),
    added: (...args) => events.push(['added', ...args]),
    removed: (...args) => events.push(['removed', ...args]),
    closed: () => events.push(['closed']),
  };

  return { events, listeners };
};

const setStored = (dom: JSDOM, highlights: MarkerHighlight[], removedIds: string[]) => {
  dom.window.localStorage.setItem(KEY, JSON.stringify({ highlights, removedIds }));
};

const getStored = (dom: JSDOM): unknown => JSON.parse(dom.window.localStorage.getItem(KEY) ?? 'null');

const withStorage = async (run: (dom: JSDOM, storage: HighlightStorage) => Promise<void>) => {
  const dom = new JSDOM('', { url: 'http://localhost' });
  const previous = Object.entries({ window: dom.window, localStorage: dom.window.localStorage }).map(([key, value]) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });

    return { key, descriptor };
  });

  try {
    await run(dom, createLocalStorageHighlightStorage());
  } finally {
    for (const { key, descriptor } of previous) {
      if (descriptor === undefined) {
        Reflect.deleteProperty(globalThis, key);
      } else {
        Object.defineProperty(globalThis, key, descriptor);
      }
    }

    dom.window.close();
  }
};
