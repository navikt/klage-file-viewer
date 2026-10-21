import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { sortHighlightsByPosition } from '@/files/pdf/highlights/highlight-list';
import { useHighlightingEnabled, useHighlightStore } from '@/files/pdf/highlights/highlight-store';
import type { StoredHighlight } from '@/files/pdf/highlights/types';

interface DocumentHighlights {
  sectionIndex: number;
  title: string;
  /** Sorted in reading order. */
  highlights: StoredHighlight[];
  /** Remove one of the document's highlights. */
  removeHighlight: (id: string) => void;
  /** Remove all of the document's highlights. */
  clearHighlights: () => void;
}

/**
 * Register an accessible PDF document, even before its PDF renders.
 * Pass `null` for other types. Documents without a highlights ID are left out.
 */
export const useRegisterHighlightDocument = (
  sectionIndex: number,
  title: string,
  pdf: { id: string | undefined; format: string | undefined; hasAccess: boolean } | null,
) => {
  const store = useHighlightStore();
  const enabled = useHighlightingEnabled();
  const id = enabled && pdf?.hasAccess === true ? pdf.id : undefined;
  const format = pdf?.format;

  useEffect(() => {
    if (id === undefined) {
      return;
    }

    return store.registerDocument({ sectionIndex, title, id, format });
  }, [store, sectionIndex, title, id, format]);
};

/** Highlights of all PDF documents in the viewer, leaving out documents without highlights. */
export const useHighlightDocuments = (): DocumentHighlights[] => {
  const store = useHighlightStore();
  const version = useSyncExternalStore(store.subscribe, store.getVersion);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` changes whenever the documents or their highlights change
  return useMemo(
    () =>
      store
        .getDocuments()
        .map(({ sectionIndex, title, key }) => ({
          sectionIndex,
          title,
          highlights: sortHighlightsByPosition(store.getHighlights(key)),
          removeHighlight: (id: string) => store.remove(key, id),
          clearHighlights: () => store.clear([key]),
        }))
        .filter(({ highlights }) => highlights.length > 0),
    [store, version],
  );
};

/** Load status of the highlights of the registered, accessible document variants, and whether any changes are unsaved or rejected. */
export const useHighlightStatus = () => {
  const store = useHighlightStore();
  const hasDocuments = useSyncExternalStore(store.subscribe, () => store.getDocuments().length > 0);
  const status = useSyncExternalStore(store.subscribe, store.getLoadStatus);
  const isLoading = hasDocuments && status === 'loading';
  const isReady = hasDocuments && status === 'loaded';

  const hasUnsavedChanges = useSyncExternalStore(store.subscribe, store.hasUnsavedChanges);
  const hasRejectedChanges = useSyncExternalStore(store.subscribe, store.hasRejectedChanges);

  return { isLoading, isReady, hasUnsavedChanges, hasRejectedChanges };
};
