import type { Span } from '@opentelemetry/api';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFileViewerConfig } from '@/context';
import { mergeHighlights } from '@/files/pdf/highlights/highlight-list';
import {
  getHighlightChanges,
  getHighlightsKey,
  hasHighlightChanges,
  mirrorAppliedHighlightChanges,
  validateHighlightChanges,
  validateHighlights,
} from '@/files/pdf/highlights/highlight-storage';
import {
  type HighlightChanges,
  type HighlightStorage,
  type HighlightStorageDocument,
  type HighlightStorageDocumentHighlights,
  HighlightStorageError,
  type HighlightStorageListeners,
} from '@/files/pdf/highlights/storage-contract';
import type { StoredHighlight } from '@/files/pdf/highlights/types';
import { setSpanError, startActionSpan } from '@/telemetry';

/** Shared empty list, so results without highlights stay the same between renders. */
export const NO_HIGHLIGHTS: StoredHighlight[] = [];

/** A PDF document in the viewer that can have highlights. */
interface HighlightDocument {
  sectionIndex: number;
  title: string;
  /** Highlights key of the currently shown variant. See {@link getHighlightsKey}. */
  key: string;
}

/**
 * - `loading`: Storage has not reported the highlights yet. Read-only.
 * - `loaded`: Editable. Updated when storage reports changes.
 * - `closed`: Deleted in storage, and can no longer change. Shown without highlights.
 */
type LoadStatus = 'loading' | 'loaded' | 'closed';

interface DocumentEntry {
  document: HighlightStorageDocument;
  /** The highlights as last reported or saved. */
  stored: StoredHighlight[];
  /** Local additions that storage has not confirmed yet. */
  pendingAdded: Map<string, StoredHighlight>;
  /** Local removals that storage has not confirmed yet. */
  pendingRemovedIds: Set<string>;
  /** Confirmed removals. Removal is permanent, so these are never shown again, even if storage reports them. */
  removedIds: Set<string>;
  /** Pending additions and removals whose save failed. */
  unsavedIds: Set<string>;
  /** What is shown: the stored highlights with the pending changes on top. */
  highlights: StoredHighlight[];
}

export interface HighlightStore {
  getLoadStatus: () => LoadStatus;
  /** Current highlights for a document. Returns the same array until it changes. Empty until loaded. */
  getHighlights: (key: string) => StoredHighlight[];
  /** Add and save highlights, dropping covered ones. Ignored until loaded. */
  add: (key: string, highlights: StoredHighlight[]) => void;
  /** Remove and save a highlight. Ignored until loaded. */
  remove: (key: string, id: string) => void;
  /** Clear several documents' highlights. Ignored until loaded. */
  clear: (keys: string[]) => void;
  /** Apply what storage reports. */
  storageListeners: HighlightStorageListeners;
  /** Register a document shown in the viewer. Returns an unregister function. */
  registerDocument: (
    document: HighlightStorageDocument & Pick<HighlightDocument, 'sectionIndex' | 'title'>,
  ) => () => void;
  /** Registered documents, sorted by section index. Returns the same array until it changes. */
  getDocuments: () => HighlightDocument[];
  /** Increases on every change. Lets consumers that read many documents re-render. */
  getVersion: () => number;
  /** `true` while any document has changes that could not be saved. */
  hasUnsavedChanges: () => boolean;
  /** `true` when changes were undone because they were too large to save, until the next edit. */
  hasRejectedChanges: () => boolean;
  /** Save the changes that could not be saved again, once. */
  retryFailedSaves: () => Promise<void>;
  /** Get notified about any change. */
  subscribe: (listener: () => void) => () => void;
}

type HighlightStoreOptions = Pick<HighlightStorage, 'save'>;

/**
 * Marker highlights for all documents in storage, saved as incremental changes.
 *
 * @param getTraceName - Returns the `component.instance` attribute for the spans of the store's actions.
 */
export const createHighlightStore = (
  { save }: HighlightStoreOptions,
  getTraceName: () => string | undefined = () => undefined,
): HighlightStore => {
  // Kept for every reported document, including ones that are not shown yet.
  const entries = new Map<string, DocumentEntry>();
  const listeners = new Set<() => void>();
  const state: { status: LoadStatus; documents: HighlightDocument[]; version: number; rejectedChanges: boolean } = {
    status: 'loading',
    documents: [],
    version: 0,
    rejectedChanges: false,
  };

  const notify = () => {
    state.version += 1;

    for (const listener of listeners) {
      listener();
    }
  };

  /** Run an action in a span, so the spans and requests it starts are part of the same trace. */
  const trace = <T,>(name: string, fn: (span?: Span) => Promise<T>): Promise<T> =>
    startActionSpan(`KlageFileViewer.${name}`, getTraceName(), fn);

  const getEntry = ({ id, format }: HighlightStorageDocument): DocumentEntry => {
    const document = { id, format };
    const key = getHighlightsKey(document);
    const existing = entries.get(key);

    if (existing !== undefined) {
      return existing;
    }

    const entry = createEntry(document);
    entries.set(key, entry);

    return entry;
  };

  const getLoadedEntry = (key: string): DocumentEntry | undefined =>
    state.status === 'loaded' ? entries.get(key) : undefined;

  const applyAdded = (document: HighlightStorageDocument, highlights: StoredHighlight[]) => {
    const entry = getEntry(document);
    entry.stored = mirrorAppliedHighlightChanges(entry.stored, validateHighlights(highlights), entry.removedIds);
    updateShown(entry);
  };

  const applyRemoved = (document: HighlightStorageDocument, highlightIds: string[]) => {
    const entry = getEntry(document);
    removeIds(entry, highlightIds);
    updateShown(entry);
  };

  /** Pending changes stay on top. Removed IDs stay hidden, since the snapshot may be older than a removal. */
  const applySnapshot = (documents: HighlightStorageDocumentHighlights[]) => {
    const snapshot = new Map(documents.map((d) => [getHighlightsKey(getEntry(d).document), d.highlights]));

    for (const [key, entry] of entries) {
      entry.stored = validateHighlights(snapshot.get(key) ?? NO_HIGHLIGHTS);
      updateShown(entry);
    }

    state.status = 'loaded';
  };

  const close = () => {
    state.status = 'closed';
    entries.clear();
  };

  /** Wraps a storage listener. Events after `closed` are ignored. */
  const receive =
    <A extends unknown[]>(name: keyof HighlightStorageListeners, apply: (...args: A) => void) =>
    (...args: A): void => {
      if (state.status === 'closed') {
        return;
      }

      void trace('receiveHighlightEvent', async (span) => {
        span?.setAttribute('highlights.event', name);
        apply(...args);
        notify();
      });
    };

  /** Removal is permanent, so removed IDs are never shown or saved again. */
  const removeIds = (entry: DocumentEntry, ids: string[]) => {
    for (const id of ids) {
      entry.removedIds.add(id);
      entry.pendingAdded.delete(id);
      entry.pendingRemovedIds.delete(id);
      entry.unsavedIds.delete(id);
    }

    entry.stored = mirrorAppliedHighlightChanges(entry.stored, [], entry.removedIds);
  };

  /** Show and save local changes right away. Resolves when the save settles. */
  const edit = (entry: DocumentEntry, highlights: StoredHighlight[]): Promise<void> => {
    const changes = getHighlightChanges(entry.highlights, highlights);

    if (!hasHighlightChanges(changes)) {
      return Promise.resolve();
    }

    for (const highlight of changes.added) {
      entry.pendingAdded.set(highlight.id, highlight);
    }

    // A pending addition may already be stored, so its removal is always saved.
    for (const id of changes.removedIds) {
      entry.pendingAdded.delete(id);
      entry.pendingRemovedIds.add(id);
      entry.unsavedIds.delete(id);
    }

    state.rejectedChanges = false;
    updateShown(entry);
    notify();

    return saveChanges(entry, changes);
  };

  const saveChanges = (entry: DocumentEntry, changes: HighlightChanges): Promise<void> =>
    trace('saveHighlights', (span) => {
      setDocumentAttributes(span, entry.document);
      span?.setAttribute('highlights.added', changes.added.length);
      span?.setAttribute('highlights.removed', changes.removedIds.length);

      return saveChangesInSpan(entry, changes, span);
    });

  /** Retrying is up to the storage, so failed changes are only kept visible and marked as unsaved. */
  const saveChangesInSpan = async (
    entry: DocumentEntry,
    changes: HighlightChanges,
    span: Span | undefined,
  ): Promise<void> => {
    try {
      const applied = validateHighlightChanges(await save(entry.document, changes));
      span?.setAttribute('highlights.applied.added', applied.added.length);
      span?.setAttribute('highlights.applied.removed', applied.removedIds.length);

      if (state.status === 'closed') {
        return;
      }

      // Storage reports additions it already had as not applied, so everything sent and not removed is stored.
      const confirmed = settle(entry, changes);
      removeIds(entry, applied.removedIds);
      entry.stored = mirrorAppliedHighlightChanges(entry.stored, [...confirmed, ...applied.added], entry.removedIds);
    } catch (error) {
      setSpanError(span, error);

      if (state.status === 'closed') {
        return;
      }

      handleSaveError(entry, changes, error);
    }

    updateShown(entry);
    notify();
  };

  const handleSaveError = (entry: DocumentEntry, changes: HighlightChanges, error: unknown) => {
    if (error instanceof HighlightStorageError && error.reason === 'closed') {
      close();

      return;
    }

    if (error instanceof HighlightStorageError && error.reason === 'too-large') {
      console.warn('Highlight changes are too large to save', error);
      settle(entry, changes);
      state.rejectedChanges = true;

      return;
    }

    console.warn('Could not save highlights', error);

    for (const id of getPendingIds(entry, changes)) {
      entry.unsavedIds.add(id);
    }
  };

  /** Drop the sent changes from the pending ones, and return the additions that were still pending. */
  const settle = (entry: DocumentEntry, changes: HighlightChanges): StoredHighlight[] => {
    const settled = changes.added.filter(({ id }) => entry.pendingAdded.get(id) !== undefined);

    for (const { id } of settled) {
      entry.pendingAdded.delete(id);
      entry.unsavedIds.delete(id);
    }

    for (const id of changes.removedIds) {
      if (entry.pendingRemovedIds.delete(id)) {
        entry.unsavedIds.delete(id);
      }
    }

    return settled;
  };

  return {
    getLoadStatus: () => state.status,
    getHighlights: (key) => entries.get(key)?.highlights ?? NO_HIGHLIGHTS,
    add: (key, highlights) => {
      const entry = getLoadedEntry(key);

      if (entry === undefined) {
        return;
      }

      void trace('addHighlights', (span) => {
        setDocumentAttributes(span, entry.document);
        span?.setAttribute('highlights.count', highlights.length);

        return edit(entry, mergeHighlights(entry.highlights, highlights));
      });
    },
    remove: (key, id) => {
      const entry = getLoadedEntry(key);

      if (entry === undefined) {
        return;
      }

      void trace('removeHighlight', (span) => {
        setDocumentAttributes(span, entry.document);

        return edit(
          entry,
          entry.highlights.filter((highlight) => highlight.id !== id),
        );
      });
    },
    clear: (keys) => {
      const loaded = new Set(keys)
        .values()
        .map(getLoadedEntry)
        .filter((entry) => entry !== undefined)
        .toArray();

      void trace('clearHighlights', async (span) => {
        span?.setAttribute('highlights.documents', loaded.length);

        await Promise.all(loaded.map((entry) => edit(entry, [])));
      });
    },
    storageListeners: {
      snapshot: receive('snapshot', applySnapshot),
      added: receive('added', applyAdded),
      removed: receive('removed', applyRemoved),
      closed: receive('closed', close),
    },
    registerDocument: ({ id, format, ...section }) => {
      const document = { id, format };

      if (state.status !== 'closed') {
        getEntry(document);
      }

      const registered = { ...section, key: getHighlightsKey(document) };
      state.documents = [...state.documents.filter((d) => d.sectionIndex !== registered.sectionIndex), registered].sort(
        (a, b) => a.sectionIndex - b.sectionIndex,
      );
      notify();

      return () => {
        if (!state.documents.includes(registered)) {
          return;
        }

        state.documents = state.documents.filter((d) => d !== registered);
        notify();
      };
    },
    getDocuments: () => state.documents,
    getVersion: () => state.version,
    hasUnsavedChanges: () => entries.values().some((entry) => entry.unsavedIds.size > 0),
    hasRejectedChanges: () => state.rejectedChanges,
    retryFailedSaves: () =>
      trace('retryHighlightSaves', async (span) => {
        const unsaved = entries
          .values()
          .filter((entry) => entry.unsavedIds.size > 0)
          .toArray();
        span?.setAttribute('highlights.documents', unsaved.length);

        await Promise.all(unsaved.map((entry) => saveChanges(entry, getUnsavedChanges(entry))));
      }),
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
};

const HighlightStoreContext = createContext<HighlightStore | null>(null);

export const useHighlightStore = (): HighlightStore => {
  const store = useContext(HighlightStoreContext);

  if (store === null) {
    throw new Error('useHighlightStore must be used within a HighlightStoreProvider');
  }

  return store;
};

const HighlightingEnabledContext = createContext(false);

/**
 * Marker highlighting is only available with storage for the highlights, and for files with a highlights ID.
 * Unavailable once the highlights are closed, e.g. because the case is finished.
 */
export const useHighlightingEnabled = (): boolean => useContext(HighlightingEnabledContext);

interface HighlightStoreProviderProps {
  /** `true` when any of the files has a highlights ID. */
  highlightable: boolean;
  children: ReactNode;
}

export const HighlightStoreProvider = ({ highlightable, children }: HighlightStoreProviderProps) => {
  const { highlightStorage, traceName } = useFileViewerConfig();
  const traceNameRef = useRef(traceName);

  useEffect(() => {
    traceNameRef.current = traceName;
  }, [traceName]);

  // Children register their documents again with the new store.
  const store = useMemo(
    () => createHighlightStore(highlightStorage ?? NO_STORAGE, () => traceNameRef.current),
    [highlightStorage],
  );
  const isClosed = useSyncExternalStore(store.subscribe, () => store.getLoadStatus() === 'closed');
  const enabled = highlightStorage !== undefined && highlightable && !isClosed;

  useEffect(() => {
    if (!highlightable || highlightStorage === undefined) {
      return;
    }

    return highlightStorage.subscribe(store.storageListeners);
  }, [store, highlightStorage, highlightable]);

  return (
    <HighlightStoreContext.Provider value={store}>
      <HighlightingEnabledContext.Provider value={enabled}>{children}</HighlightingEnabledContext.Provider>
    </HighlightStoreContext.Provider>
  );
};

const setDocumentAttributes = (span: Span | undefined, { id, format }: HighlightStorageDocument) => {
  span?.setAttribute('highlights.document.id', id);
  span?.setAttribute('highlights.document.format', format);
};

const createEntry = (document: HighlightStorageDocument): DocumentEntry => ({
  document,
  stored: NO_HIGHLIGHTS,
  pendingAdded: new Map(),
  pendingRemovedIds: new Set(),
  removedIds: new Set(),
  unsavedIds: new Set(),
  highlights: NO_HIGHLIGHTS,
});

/** Show the stored highlights with the pending changes on top. Keeps the same list when nothing changes. */
const updateShown = (entry: DocumentEntry) => {
  const hidden = entry.removedIds.union(entry.pendingRemovedIds);
  const byId = new Map([...entry.stored, ...entry.pendingAdded.values()].map((h) => [h.id, h]));
  const shown = byId
    .values()
    .filter(({ id }) => !hidden.has(id))
    .toArray();
  const unchanged = shown.length === entry.highlights.length && shown.every((h, i) => h === entry.highlights[i]);

  if (!unchanged) {
    entry.highlights = shown.length === 0 ? NO_HIGHLIGHTS : shown;
  }
};

/** The sent changes that are still pending. */
const getPendingIds = (entry: DocumentEntry, changes: HighlightChanges): string[] => [
  ...changes.added.filter(({ id }) => entry.pendingAdded.has(id)).map(({ id }) => id),
  ...changes.removedIds.filter((id) => entry.pendingRemovedIds.has(id)),
];

const getUnsavedChanges = ({ pendingAdded, pendingRemovedIds, unsavedIds }: DocumentEntry): HighlightChanges => ({
  added: pendingAdded
    .values()
    .filter(({ id }) => unsavedIds.has(id))
    .toArray(),
  removedIds: pendingRemovedIds
    .values()
    .filter((id) => unsavedIds.has(id))
    .toArray(),
});

const unavailable = () => Promise.reject(new Error('No highlight storage provided'));

const NO_STORAGE: HighlightStoreOptions = { save: unavailable };
