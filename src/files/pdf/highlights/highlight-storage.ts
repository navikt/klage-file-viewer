import { mergeHighlights } from '@/files/pdf/highlights/highlight-list';
import type { HighlightChanges, HighlightStorageDocument } from '@/files/pdf/highlights/storage-contract';
import type { HighlightSource, NormalizedRect, StoredHighlight } from '@/files/pdf/highlights/types';
import type { ReflowBlock, ReflowSpan } from '@/files/pdf/selection/copy/reflow';

/** The result of {@link applyHighlightChanges}. */
export interface AppliedHighlightChanges {
  /** The document's highlights after applying the changes. */
  highlights: StoredHighlight[];
  /** Every removed ID after applying the changes. Store these and pass them to the next call. */
  removedIds: string[];
  /** The changes that took effect. Resolve `save` with these, and report them to subscribers. */
  changes: HighlightChanges;
}

/**
 * Apply changes to a document's stored highlights, the way the viewer expects storage to.
 * Apply changes to the same document one at a time.
 *
 * Every argument is validated, so stored data and request bodies can be passed as parsed.
 * Invalid input is left out, and removed IDs are never added again. Added highlights that another
 * highlight covers are rejected, and highlights that an added highlight covers are removed.
 * Rejected and covered IDs are reported as removed, so every viewer drops them.
 */
export const applyHighlightChanges = (
  storedHighlights: unknown,
  storedRemovedIds: unknown,
  changes: unknown,
): AppliedHighlightChanges => {
  const stored = validateHighlights(storedHighlights);
  const { added, removedIds: requestedIds } = validateHighlightChanges(changes);
  const removed = new Set([...validateIds(storedRemovedIds), ...requestedIds]);
  const storedIds = new Set(stored.map(({ id }) => id));
  const kept = stored.filter(({ id }) => !removed.has(id));
  const candidates = uniqueById(added).filter(({ id }) => !removed.has(id) && !storedIds.has(id));
  const highlights = mergeHighlights(kept, candidates);
  const ids = new Set(highlights.map(({ id }) => id));
  const newlyRemovedIds = new Set([
    ...requestedIds,
    ...[...kept, ...added].map(({ id }) => id).filter((id) => !ids.has(id)),
  ]);

  return {
    highlights,
    removedIds: removed.union(newlyRemovedIds).values().toArray(),
    changes: { added: candidates.filter(({ id }) => ids.has(id)), removedIds: newlyRemovedIds.values().toArray() },
  };
};

/**
 * Identifies a document variant's highlights. Keyed by highlights ID *and* variant format —
 * variants share the ID but can have different content (e.g. redacted vs. full version).
 */
export const getHighlightsKey = ({ id, format }: HighlightStorageDocument): string =>
  JSON.stringify([id, format ?? null]);

/** Keeps the valid highlights, e.g. from parsed JSON. Returns an empty list when the value is not a list. */
export const validateHighlights = (value: unknown): StoredHighlight[] =>
  Array.isArray(value) ? value.filter(isStoredHighlight) : [];

/** Keeps the valid parts of changes, e.g. from parsed JSON. */
export const validateHighlightChanges = (value: unknown): HighlightChanges =>
  isRecord(value)
    ? {
        added: validateHighlights(value.added),
        removedIds: validateIds(value.removedIds),
      }
    : { added: [], removedIds: [] };

/** Keeps the strings of a list from storage. Returns an empty list when the value is not a list. */
export const validateIds = (value: unknown): string[] => (Array.isArray(value) ? value.filter(isString) : []);

export const hasHighlightChanges = ({ added, removedIds }: HighlightChanges): boolean =>
  added.length > 0 || removedIds.length > 0;

export const getHighlightChanges = (before: StoredHighlight[], after: StoredHighlight[]): HighlightChanges => {
  const beforeIds = new Set(before.map(({ id }) => id));
  const afterIds = new Set(after.map(({ id }) => id));

  return {
    added: after.filter(({ id }) => !beforeIds.has(id)),
    removedIds: before.filter(({ id }) => !afterIds.has(id)).map(({ id }) => id),
  };
};

/**
 * Mirror changes that storage applied, without rules of its own: drop all removed IDs and add the added highlights.
 * Added IDs that are already present or removed are ignored. Returns the same list when nothing changes.
 */
export const mirrorAppliedHighlightChanges = (
  highlights: StoredHighlight[],
  added: StoredHighlight[],
  removedIds: ReadonlySet<string>,
): StoredHighlight[] => {
  const ids = new Set(highlights.map(({ id }) => id));
  const kept = highlights.filter(({ id }) => !removedIds.has(id));
  const newHighlights = uniqueById(added).filter(({ id }) => !removedIds.has(id) && !ids.has(id));

  return kept.length === highlights.length && newHighlights.length === 0 ? highlights : [...kept, ...newHighlights];
};

const uniqueById = (highlights: StoredHighlight[]): StoredHighlight[] =>
  new Map(highlights.map((highlight) => [highlight.id, highlight])).values().toArray();

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isHighlightSource = (value: unknown): value is HighlightSource => value === 'pdf' || value === 'ocr';

const isNormalizedRect = (value: unknown): value is NormalizedRect =>
  isRecord(value) &&
  isFiniteNumber(value.x) &&
  isFiniteNumber(value.y) &&
  isFiniteNumber(value.width) &&
  isFiniteNumber(value.height) &&
  value.width > 0 &&
  value.height > 0;

const isStoredHighlight = (value: unknown): value is StoredHighlight =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  isFiniteNumber(value.pageIndex) &&
  Number.isInteger(value.pageIndex) &&
  value.pageIndex >= 0 &&
  isHighlightSource(value.source) &&
  Array.isArray(value.rects) &&
  value.rects.length > 0 &&
  value.rects.every(isNormalizedRect) &&
  typeof value.text === 'string' &&
  (value.blocks === undefined || (Array.isArray(value.blocks) && value.blocks.every(isReflowBlock))) &&
  isFiniteNumber(value.createdAt);

const isReflowBlock = (value: unknown): value is ReflowBlock =>
  isRecord(value) &&
  (value.kind === 'paragraph' || value.kind === 'listItem' || value.kind === 'heading') &&
  Array.isArray(value.spans) &&
  value.spans.every(isReflowSpan) &&
  isFiniteNumber(value.level) &&
  isFiniteNumber(value.headingLevel) &&
  typeof value.gapBefore === 'boolean';

const isReflowSpan = (value: unknown): value is ReflowSpan =>
  isRecord(value) &&
  typeof value.text === 'string' &&
  typeof value.bold === 'boolean' &&
  typeof value.italic === 'boolean';
