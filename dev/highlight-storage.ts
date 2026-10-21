import { isRecord, validateHighlights, validateIds } from '@/files/pdf/highlights/highlight-storage';
import { applyHighlightChanges } from '@/highlights';
import type {
  HighlightStorage,
  HighlightStorageDocument,
  HighlightStorageDocumentHighlights,
  HighlightStorageListeners,
  MarkerHighlight,
} from '@/index';
import { getStorageKey } from '@/lib/storage-key';

const KEY_PATTERN = /^klage-file-viewer\/([\w-]+)\/highlights(?:\/(.+))?$/;

const decoder = new TextDecoder();

/** A document's stored highlights, and the IDs that must never be added again. */
interface StoredDocument {
  highlights: MarkerHighlight[];
  removedIds: string[];
}

const subscribers = new Set<HighlightStorageListeners>();

/** Stores highlights in `localStorage`, applying changes the way a server would. */
export const createLocalStorageHighlightStorage = (): HighlightStorage => ({
  save: async (document, changes) => {
    const stored = parse(localStorage.getItem(getKey(document)));
    const applied = applyHighlightChanges(stored.highlights, stored.removedIds, changes);
    const value: StoredDocument = { highlights: applied.highlights, removedIds: applied.removedIds };
    localStorage.setItem(getKey(document), JSON.stringify(value));

    // Storage events only reach other tabs, so report to all viewers in this tab, including the writer.
    for (const listeners of subscribers) {
      listeners.added(document, applied.changes.added);
      listeners.removed(document, applied.changes.removedIds);
    }

    return applied.changes;
  },
  subscribe: (listeners) => {
    subscribers.add(listeners);
    listeners.snapshot(getSnapshot());

    // Changes in other tabs are reported as a new snapshot.
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === null || parseKey(event.key) !== null)) {
        listeners.snapshot(getSnapshot());
      }
    };

    window.addEventListener('storage', handleStorage);

    return () => {
      subscribers.delete(listeners);
      window.removeEventListener('storage', handleStorage);
    };
  },
});

const getSnapshot = (): HighlightStorageDocumentHighlights[] =>
  Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .map((key) => (key === null ? null : parseKey(key)))
    .filter((document) => document !== null)
    .map((document) => ({ ...document, highlights: parse(localStorage.getItem(getKey(document))).highlights }));

const parse = (raw: string | null): StoredDocument => {
  if (raw === null) {
    return { highlights: [], removedIds: [] };
  }

  try {
    const value: unknown = JSON.parse(raw);

    return isRecord(value)
      ? { highlights: validateHighlights(value.highlights), removedIds: validateIds(value.removedIds) }
      : { highlights: [], removedIds: [] };
  } catch {
    return { highlights: [], removedIds: [] };
  }
};

const getKey = ({ id, format }: HighlightStorageDocument): string => getStorageKey('highlights', id, format);

const parseKey = (key: string): HighlightStorageDocument | null => {
  const match = KEY_PATTERN.exec(key);
  const encodedId = match?.[1];

  if (match === null || encodedId === undefined) {
    return null;
  }

  try {
    const id = decoder.decode(Uint8Array.fromBase64(encodedId, { alphabet: 'base64url' }));

    return { id, format: match[2] };
  } catch {
    return null;
  }
};
