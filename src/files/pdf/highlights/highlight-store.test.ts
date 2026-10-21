import { describe, expect, it, mock, spyOn } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyHighlightChanges, getHighlightsKey } from '@/files/pdf/highlights/highlight-storage';
import { createHighlightStore, type HighlightStore, useHighlightStore } from '@/files/pdf/highlights/highlight-store';
import {
  type HighlightChanges,
  type HighlightStorageDocument,
  HighlightStorageError,
} from '@/files/pdf/highlights/storage-contract';
import type { StoredHighlight } from '@/files/pdf/highlights/types';

/** Every ID gets its own line, so highlights only cover each other when a test uses {@link overlapping} or {@link covering}. */
const lines = new Map<string, number>();

const lineOf = (id: string): number => lines.get(id) ?? lines.set(id, lines.size).size - 1;

const highlight = (
  id: string,
  rect = { x: 0.1, y: 0.01 + lineOf(id) * 0.03, width: 0.1, height: 0.02 },
): StoredHighlight => ({
  id,
  pageIndex: 0,
  source: 'pdf',
  rects: [rect],
  text: id,
  createdAt: 0,
});

const SHARED_RECT = { x: 0.5, y: 0.5, width: 0.1, height: 0.02 };

/** Highlights of the same text, which cover each other. */
const overlapping = (id: string): StoredHighlight => highlight(id, SHARED_RECT);

/** A highlight that covers {@link overlapping} highlights. */
const covering = (id: string): StoredHighlight => highlight(id, { ...SHARED_RECT, x: 0.4, width: 0.3 });

const ids = (highlights: StoredHighlight[]): string[] => highlights.map(({ id }) => id);

const changes = (added: string[] = [], removedIds: string[] = []): HighlightChanges => ({
  added: added.map((id) => highlight(id)),
  removedIds,
});

/** Applies changes as they are. */
const echo = async (_document: HighlightStorageDocument, changes: HighlightChanges) => changes;

/** Applies changes as they are once the gate opens. */
const echoAfter =
  (gate: PromiseWithResolvers<void>) => async (_document: HighlightStorageDocument, changes: HighlightChanges) => {
    await gate.promise;

    return changes;
  };

const doc = (id: string): HighlightStorageDocument => ({ id, format: undefined });

const registeredDoc = (id: string, sectionIndex = 0) => ({ ...doc(id), sectionIndex, title: id });

/** Highlights key of the test document with the given URL. */
const key = (id: string): string => getHighlightsKey(doc(id));

const snapshot = (store: HighlightStore, documents: Record<string, StoredHighlight[]> = {}) =>
  store.storageListeners.snapshot(Object.entries(documents).map(([id, highlights]) => ({ ...doc(id), highlights })));

const added = (store: HighlightStore, id: string, highlights: StoredHighlight[]) =>
  store.storageListeners.added(doc(id), highlights);

const removed = (store: HighlightStore, id: string, highlightIds: string[]) =>
  store.storageListeners.removed(doc(id), highlightIds);

/** Lets all pending saves finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

interface TestStoreOptions {
  save?: Parameters<typeof createHighlightStore>[0]['save'];
  /** The first snapshot. `null` to leave the store loading. */
  stored?: Record<string, StoredHighlight[]> | null;
}

/** A store with the given documents registered, and the snapshot received. */
const createTestStore = ({ save = echo, stored = {} }: TestStoreOptions = {}, ids: string[] = ['a', 'b', 'c']) => {
  const store = createHighlightStore({ save });

  for (const [sectionIndex, id] of ids.entries()) {
    store.registerDocument(registeredDoc(id, sectionIndex));
  }

  if (stored !== null) {
    snapshot(store, stored);
  }

  return store;
};

/** Storage shared by several viewers, which applies changes and reports them to every viewer, like a server. */
const createServer = (initial: StoredHighlight[] = []) => {
  const state: { highlights: StoredHighlight[]; removedIds: string[] } = { highlights: initial, removedIds: [] };
  const stores: HighlightStore[] = [];
  const gates: PromiseWithResolvers<void>[] = [];
  const options = { gated: false };

  const save = mock(async (document: HighlightStorageDocument, change: HighlightChanges) => {
    if (options.gated) {
      const gate = Promise.withResolvers<void>();
      gates.push(gate);
      await gate.promise;
    }

    const applied = applyHighlightChanges(state.highlights, state.removedIds, change);
    state.highlights = applied.highlights;
    state.removedIds = applied.removedIds;

    for (const store of stores) {
      added(store, document.id, applied.changes.added);
      removed(store, document.id, applied.changes.removedIds);
    }

    return applied.changes;
  });

  const connect = (): HighlightStore => {
    const store = createTestStore({ save, stored: { a: state.highlights } });
    stores.push(store);

    return store;
  };

  return { state, gates, options, save, connect };
};

const Consumer = () => {
  const store = useHighlightStore();

  return createElement('span', null, store.getVersion());
};

describe('createHighlightStore', () => {
  it('clears the requested documents in one batch each and notifies for each changed one', async () => {
    const save = mock(echo);
    const store = createTestStore(
      {
        save,
        stored: {
          a: [highlight('a'), highlight('a2')],
          b: [highlight('b'), highlight('b2')],
          other: [highlight('other'), highlight('other2')],
        },
      },
      ['a', 'b', 'c', 'other'],
    );
    const version = store.getVersion();
    const empty = store.getHighlights(key('c'));

    store.clear([key('a'), key('b'), key('c')]);

    expect(store.getVersion()).toBe(version + 2);
    expect(ids(store.getHighlights(key('a')))).toEqual([]);
    expect(ids(store.getHighlights(key('b')))).toEqual([]);
    expect(store.getHighlights(key('c'))).toBe(empty);
    expect(ids(store.getHighlights(key('other')))).toEqual(['other', 'other2']);
    await settle();
    expect(save.mock.calls).toEqual([
      [doc('a'), changes([], ['a', 'a2'])],
      [doc('b'), changes([], ['b', 'b2'])],
    ]);
  });

  it('ignores covered additions and unknown removals', async () => {
    const save = mock(echo);
    const store = createTestStore({ save, stored: { a: [highlight('1')] } });
    const version = store.getVersion();

    store.add(key('a'), [highlight('1'), { ...highlight('1'), id: '2' }]);
    store.remove(key('a'), 'unknown');
    await settle();

    expect(store.getVersion()).toBe(version);
    expect(ids(store.getHighlights(key('a')))).toEqual(['1']);
    expect(save).not.toHaveBeenCalled();
  });

  it('ignores changes until the snapshot is received', async () => {
    const save = mock(echo);
    const store = createTestStore({ save, stored: null }, ['a']);

    store.add(key('a'), [highlight('1')]);
    store.clear([key('a')]);
    expect(store.getLoadStatus()).toBe('loading');
    expect(store.getHighlights(key('a'))).toEqual([]);

    snapshot(store, { a: [highlight('stored')] });
    await settle();

    expect(store.getLoadStatus()).toBe('loaded');
    expect(ids(store.getHighlights(key('a')))).toEqual(['stored']);
    expect(save).not.toHaveBeenCalled();
  });

  it('notifies subscribers about every received event', () => {
    const store = createTestStore({ stored: null }, ['a']);
    const statuses: ReturnType<typeof store.getLoadStatus>[] = [];
    store.subscribe(() => statuses.push(store.getLoadStatus()));

    snapshot(store);
    added(store, 'a', [highlight('1')]);
    store.storageListeners.closed();

    expect(statuses).toEqual(['loaded', 'loaded', 'closed']);
  });

  it('keeps highlights of documents that are registered after the snapshot', () => {
    const store = createTestStore({ stored: { a: [highlight('1')] } }, []);

    added(store, 'a', [highlight('2')]);
    store.registerDocument(registeredDoc('a'));

    expect(ids(store.getHighlights(key('a')))).toEqual(['1', '2']);
  });

  it('replaces stored highlights with a new snapshot, and keeps removed IDs hidden', () => {
    const store = createTestStore({ stored: { a: [highlight('1'), highlight('2')], b: [highlight('3')] } });

    removed(store, 'a', ['1']);
    snapshot(store, { a: [highlight('1'), highlight('4')] });

    expect(ids(store.getHighlights(key('a')))).toEqual(['4']);
    expect(store.getHighlights(key('b'))).toEqual([]);
  });

  it('applies added and removed highlights, and ignores additions of removed IDs', () => {
    const store = createTestStore({ stored: { a: [highlight('1')] } });

    added(store, 'a', [highlight('2'), highlight('3')]);
    removed(store, 'a', ['1', '2']);
    added(store, 'a', [highlight('2')]);

    expect(ids(store.getHighlights(key('a')))).toEqual(['3']);
  });

  it('keeps pending local highlights when another viewer adds an overlapping highlight', async () => {
    const gate = Promise.withResolvers<void>();
    const store = createTestStore({ save: echoAfter(gate) });

    store.add(key('a'), [overlapping('1')]);
    added(store, 'a', [overlapping('2')]);

    expect(ids(store.getHighlights(key('a')))).toEqual(['2', '1']);
    gate.resolve();
    await settle();
    expect(ids(store.getHighlights(key('a')))).toEqual(['2', '1']);
  });

  it('converges on what a common API applies and reports', async () => {
    const server = createServer();
    server.options.gated = true;
    const first = server.connect();
    const second = server.connect();

    // Both highlights cover the same text, so the server rejects the second one.
    first.add(key('a'), [overlapping('first')]);
    second.add(key('a'), [overlapping('second')]);
    server.gates[0]?.resolve();
    await settle();
    server.gates[1]?.resolve();
    await settle();

    expect(ids(first.getHighlights(key('a')))).toEqual(['first']);
    expect(ids(second.getHighlights(key('a')))).toEqual(['first']);
    expect(ids(server.state.highlights)).toEqual(['first']);

    first.remove(key('a'), 'first');
    server.gates[2]?.resolve();
    await settle();

    expect(ids(first.getHighlights(key('a')))).toEqual([]);
    expect(ids(second.getHighlights(key('a')))).toEqual([]);
    expect(server.state.highlights).toEqual([]);
    expect(server.save).toHaveBeenCalledTimes(3);
  });

  it('removes an existing highlight in every viewer when another viewer covers it', async () => {
    const server = createServer([overlapping('old')]);
    const first = server.connect();
    const second = server.connect();

    second.add(key('a'), [covering('new')]);
    await settle();

    expect(ids(server.state.highlights)).toEqual(['new']);
    expect(ids(first.getHighlights(key('a')))).toEqual(['new']);
    expect(ids(second.getHighlights(key('a')))).toEqual(['new']);
  });

  it('keeps registered documents sorted and replaces documents in the same section', () => {
    const store = createTestStore({}, []);

    store.registerDocument({ ...doc('b'), sectionIndex: 1, title: 'B' });
    const unregisterA = store.registerDocument({ ...doc('a'), sectionIndex: 0, title: 'A' });
    const unregisterOld = store.registerDocument({ ...doc('c'), sectionIndex: 2, title: 'C' });
    store.registerDocument({ ...doc('c-variant'), sectionIndex: 2, title: 'C' });

    expect(store.getDocuments()).toEqual([
      { sectionIndex: 0, title: 'A', key: key('a') },
      { sectionIndex: 1, title: 'B', key: key('b') },
      { sectionIndex: 2, title: 'C', key: key('c-variant') },
    ]);

    unregisterOld();
    unregisterA();

    expect(store.getDocuments().map((document) => document.key)).toEqual([key('b'), key('c-variant')]);
  });

  describe('saving', () => {
    it('saves an addition and the highlights it covers in one batch', async () => {
      const save = mock(echo);
      const store = createTestStore({ save, stored: { a: [highlight('kept'), overlapping('old')] } });

      store.add(key('a'), [covering('new')]);
      await settle();

      expect(save.mock.calls).toEqual([[doc('a'), { added: [covering('new')], removedIds: ['old'] }]]);
      expect(ids(store.getHighlights(key('a')))).toEqual(['kept', 'new']);
    });

    it('saves every change right away, also while another save is pending', async () => {
      const gate = Promise.withResolvers<void>();
      const save = mock(echoAfter(gate));
      const store = createTestStore({ save });

      store.add(key('a'), [highlight('1')]);
      store.add(key('a'), [highlight('2')]);
      store.add(key('b'), [highlight('3')]);

      expect(save.mock.calls).toEqual([
        [doc('a'), changes(['1'])],
        [doc('a'), changes(['2'])],
        [doc('b'), changes(['3'])],
      ]);
      gate.resolve();
      await settle();
      expect(ids(store.getHighlights(key('a')))).toEqual(['1', '2']);
    });

    it('keeps pending changes on top of a snapshot received during the save', async () => {
      const gate = Promise.withResolvers<void>();
      const store = createTestStore({ save: echoAfter(gate) });

      store.add(key('a'), [highlight('1')]);
      store.add(key('a'), [highlight('2')]);
      snapshot(store, { a: [highlight('external')] });
      expect(ids(store.getHighlights(key('a')))).toEqual(['external', '1', '2']);

      gate.resolve();
      await settle();

      expect(ids(store.getHighlights(key('a')))).toEqual(['external', '1', '2']);
    });

    it('removes additions the save response rejects', async () => {
      const save = mock(async (_document: HighlightStorageDocument, _changes: HighlightChanges) =>
        changes(['1'], ['2']),
      );
      const store = createTestStore({ save });
      const listener = mock(() => undefined);
      store.subscribe(listener);

      store.add(key('a'), [highlight('1'), highlight('2')]);
      await settle();

      expect(ids(store.getHighlights(key('a')))).toEqual(['1']);
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('save errors', () => {
    const createFailingStore = () => {
      const storage = { failing: true };
      const save = mock(async (document: HighlightStorageDocument, changes: HighlightChanges) => {
        if (storage.failing) {
          throw new Error('QuotaExceededError');
        }

        return echo(document, changes);
      });
      const store = createTestStore({ save });

      return { storage, store, save };
    };

    it('clears the unsaved state once applied changes settle every failed change', async () => {
      const { storage, store } = createFailingStore();
      const warn = spyOn(console, 'warn').mockImplementation(() => undefined);

      store.add(key('a'), [highlight('1')]);
      store.add(key('b'), [highlight('2')]);
      await settle();
      storage.failing = false;

      store.remove(key('a'), '1');
      await settle();
      expect(store.hasUnsavedChanges()).toBe(true);

      store.clear([key('b')]);
      await settle();
      expect(store.hasUnsavedChanges()).toBe(false);
      warn.mockRestore();
    });

    it('keeps failed changes visible and unsaved across snapshots', async () => {
      const { store } = createFailingStore();
      const warn = spyOn(console, 'warn').mockImplementation(() => undefined);

      store.add(key('a'), [highlight('1')]);
      await settle();
      snapshot(store);

      expect(store.hasUnsavedChanges()).toBe(true);
      expect(ids(store.getHighlights(key('a')))).toEqual(['1']);
      warn.mockRestore();
    });

    it('warns about a failed save, keeps showing the change and leaves retrying to the storage', async () => {
      const { storage, store, save } = createFailingStore();
      const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
      const listener = mock(() => undefined);
      store.subscribe(listener);

      store.add(key('a'), [highlight('1')]);
      await settle();
      expect(warn).toHaveBeenCalledWith('Could not save highlights', new Error('QuotaExceededError'));
      expect(listener).toHaveBeenCalledTimes(2);
      storage.failing = false;
      store.add(key('a'), [highlight('2')]);
      await settle();

      expect(save.mock.calls).toEqual([
        [doc('a'), changes(['1'])],
        [doc('a'), changes(['2'])],
      ]);
      expect(store.hasUnsavedChanges()).toBe(true);
      expect(ids(store.getHighlights(key('a')))).toEqual(['2', '1']);
      warn.mockRestore();
    });

    it('saves every failed change again on retry', async () => {
      const { storage, store, save } = createFailingStore();
      const warn = spyOn(console, 'warn').mockImplementation(() => undefined);

      store.add(key('a'), [highlight('1'), highlight('2')]);
      store.remove(key('a'), '2');
      store.add(key('b'), [highlight('3')]);
      await settle();
      storage.failing = false;
      save.mockClear();
      await store.retryFailedSaves();

      expect(save.mock.calls).toEqual([
        [doc('a'), changes(['1'], ['2'])],
        [doc('b'), changes(['3'])],
      ]);
      expect(store.hasUnsavedChanges()).toBe(false);
      expect(ids(store.getHighlights(key('a')))).toEqual(['1']);
      warn.mockRestore();
    });

    it('keeps the changes unsaved when a retry fails', async () => {
      const { store, save } = createFailingStore();
      const warn = spyOn(console, 'warn').mockImplementation(() => undefined);

      store.add(key('a'), [highlight('1')]);
      await settle();
      await store.retryFailedSaves();

      expect(save).toHaveBeenCalledTimes(2);
      expect(store.hasUnsavedChanges()).toBe(true);
      expect(ids(store.getHighlights(key('a')))).toEqual(['1']);
      warn.mockRestore();
    });

    it('does not save anything on retry without unsaved changes', async () => {
      const save = mock(echo);
      const store = createTestStore({ save });

      store.add(key('a'), [highlight('1')]);
      await settle();
      await store.retryFailedSaves();

      expect(save).toHaveBeenCalledTimes(1);
    });

    it('settles a retried change that storage already applied before losing the response', async () => {
      const stored: { highlights: StoredHighlight[]; removedIds: string[] } = { highlights: [], removedIds: [] };
      const apply = async (_document: HighlightStorageDocument, changes: HighlightChanges) => {
        const result = applyHighlightChanges(stored.highlights, stored.removedIds, changes);
        stored.highlights = result.highlights;
        stored.removedIds = result.removedIds;

        return result.changes;
      };
      const save = mock(apply);
      save.mockImplementationOnce(async (document, changes) => {
        await apply(document, changes);
        throw new Error('Timeout');
      });
      const store = createTestStore({ save });
      const warn = spyOn(console, 'warn').mockImplementation(() => undefined);

      store.add(key('a'), [highlight('1')]);
      await settle();
      expect(store.hasUnsavedChanges()).toBe(true);
      await store.retryFailedSaves();

      expect(await save.mock.results[1]?.value).toEqual(changes());
      expect(store.hasUnsavedChanges()).toBe(false);
      expect(ids(store.getHighlights(key('a')))).toEqual(['1']);
      warn.mockRestore();
    });

    it('keeps an unsaved removal when an earlier addition of the same ID is saved', async () => {
      const gate = Promise.withResolvers<void>();
      const save = mock(echo);
      save.mockImplementationOnce(echoAfter(gate));
      save.mockImplementationOnce(async () => {
        throw new Error('Offline');
      });
      const store = createTestStore({ save });
      const warn = spyOn(console, 'warn').mockImplementation(() => undefined);

      store.add(key('a'), [highlight('1')]);
      store.remove(key('a'), '1');
      await settle();
      gate.resolve();
      await settle();

      expect(store.hasUnsavedChanges()).toBe(true);
      expect(store.getHighlights(key('a'))).toEqual([]);
      warn.mockRestore();
    });

    it('does not mark an addition unsaved when its removal was saved', async () => {
      const gate = Promise.withResolvers<void>();
      const save = mock(echo);
      save.mockImplementationOnce(echoAfter(gate));
      const store = createTestStore({ save });
      const warn = spyOn(console, 'warn').mockImplementation(() => undefined);

      store.add(key('a'), [highlight('1')]);
      store.remove(key('a'), '1');
      await settle();
      gate.reject(new Error('Offline'));
      await settle();

      expect(warn).toHaveBeenCalledTimes(1);
      expect(store.hasUnsavedChanges()).toBe(false);
      expect(store.getHighlights(key('a'))).toEqual([]);
      warn.mockRestore();
    });
  });
});

describe('closed and rejected changes', () => {
  it('shows no highlights when closed and ignores changes and later events', async () => {
    const save = mock(echo);
    const store = createTestStore({ save, stored: null }, ['a']);

    store.storageListeners.closed();
    snapshot(store, { a: [highlight('stored')] });
    store.add(key('a'), [highlight('1')]);
    await settle();

    expect(store.getLoadStatus()).toBe('closed');
    expect(store.getHighlights(key('a'))).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });

  it('drops pending and unsaved changes when closed, and ignores late saves', async () => {
    const gate = Promise.withResolvers<void>();
    const save = mock(echoAfter(gate));
    save.mockImplementationOnce(async () => {
      throw new Error('Offline');
    });
    const store = createTestStore({ save, stored: { a: [highlight('stored')] } }, ['a']);
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);

    store.add(key('a'), [highlight('1')]);
    await settle();
    store.add(key('a'), [highlight('2')]);
    store.storageListeners.closed();
    gate.resolve();
    await settle();

    expect(store.getHighlights(key('a'))).toEqual([]);
    expect(store.hasUnsavedChanges()).toBe(false);
    warn.mockRestore();
  });

  it('closes the store when storage refuses a save because it is closed', async () => {
    const save = mock(async () => {
      throw new HighlightStorageError('closed', 'Closed');
    });
    const store = createTestStore({ save }, ['a']);

    store.add(key('a'), [highlight('1')]);
    await settle();

    expect(store.getLoadStatus()).toBe('closed');
    expect(store.getHighlights(key('a'))).toEqual([]);
    expect(store.hasUnsavedChanges()).toBe(false);
  });

  it('undoes changes that are too large to save until the next edit', async () => {
    const storage = { tooLarge: true };
    const save = mock(async (document: HighlightStorageDocument, change: HighlightChanges) => {
      if (storage.tooLarge) {
        throw new HighlightStorageError('too-large', 'Too large');
      }

      return echo(document, change);
    });
    const store = createTestStore({ save, stored: { a: [highlight('stored')] } }, ['a']);
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);

    store.add(key('a'), [highlight('1')]);
    store.remove(key('a'), 'stored');
    await settle();

    expect(ids(store.getHighlights(key('a')))).toEqual(['stored']);
    expect(store.hasRejectedChanges()).toBe(true);
    expect(store.hasUnsavedChanges()).toBe(false);

    storage.tooLarge = false;
    store.add(key('a'), [highlight('2')]);
    expect(store.hasRejectedChanges()).toBe(false);
    await settle();
    expect(ids(store.getHighlights(key('a')))).toEqual(['stored', '2']);
    warn.mockRestore();
  });

  it('keeps unsaved changes of unregistered documents', async () => {
    const save = mock(async () => {
      throw new Error('Offline');
    });
    const store = createTestStore({ save }, []);
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
    const unregister = store.registerDocument(registeredDoc('a'));

    store.add(key('a'), [highlight('1')]);
    await settle();
    unregister();

    expect(store.hasUnsavedChanges()).toBe(true);
    expect(ids(store.getHighlights(key('a')))).toEqual(['1']);
    warn.mockRestore();
  });
});

describe('useHighlightStore', () => {
  it('throws when rendered without a provider', () => {
    expect(() => renderToStaticMarkup(createElement(Consumer))).toThrow(
      'useHighlightStore must be used within a HighlightStoreProvider',
    );
  });
});
