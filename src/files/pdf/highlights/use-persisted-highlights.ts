import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { groupHighlightsByPage } from '@/files/pdf/highlights/highlight-list';
import { getHighlightsKey } from '@/files/pdf/highlights/highlight-storage';
import { NO_HIGHLIGHTS, useHighlightStore } from '@/files/pdf/highlights/highlight-store';
import type { NewHighlight, StoredHighlight } from '@/files/pdf/highlights/types';

interface UsePersistedHighlightsResult {
  highlightsByPage: Map<number, StoredHighlight[]>;
  addHighlights: (highlights: NewHighlight[]) => void;
  removeHighlight: (id: string) => void;
}

/**
 * Read and edit a registered document variant's highlights, persisted to the consumer's storage.
 * Documents without a highlights ID have no highlights and ignore changes.
 */
export const usePersistedHighlights = (
  id: string | undefined,
  format: string | undefined,
): UsePersistedHighlightsResult => {
  const key = useMemo(() => (id === undefined ? null : getHighlightsKey({ id, format })), [id, format]);
  const store = useHighlightStore();
  const highlights = useSyncExternalStore(store.subscribe, () =>
    key === null ? NO_HIGHLIGHTS : store.getHighlights(key),
  );

  const addHighlights = useCallback(
    (newHighlights: NewHighlight[]) => {
      if (key === null) {
        return;
      }

      const createdAt = Date.now();
      const stored = newHighlights.map((highlight) => ({ ...highlight, id: crypto.randomUUID(), createdAt }));

      store.add(key, stored);
    },
    [store, key],
  );

  const removeHighlight = useCallback(
    (highlightId: string) => {
      if (key === null) {
        return;
      }

      store.remove(key, highlightId);
    },
    [store, key],
  );

  const highlightsByPage = useMemo(() => groupHighlightsByPage(highlights), [highlights]);

  return { highlightsByPage, addHighlights, removeHighlight };
};
