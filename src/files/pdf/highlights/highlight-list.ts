import type { NormalizedRect, StoredHighlight } from '@/files/pdf/highlights/types';

/** Tolerance (fraction of the page) when checking whether one rect covers another. */
const CONTAINMENT_EPSILON = 0.002;

/** Decimals kept when normalizing rects — sub-pixel precision even on large pages. */
const PRECISION = 100_000;

export const normalizeRect = (
  rect: { x: number; y: number; width: number; height: number },
  pageWidth: number,
  pageHeight: number,
): NormalizedRect =>
  roundRect({
    x: rect.x / pageWidth,
    y: rect.y / pageHeight,
    width: rect.width / pageWidth,
    height: rect.height / pageHeight,
  });

export const roundRect = (rect: NormalizedRect): NormalizedRect => ({
  x: round(rect.x),
  y: round(rect.y),
  width: round(rect.width),
  height: round(rect.height),
});

/**
 * Add new highlights to a list, one at a time.
 *
 * Highlights that are fully covered by a new one are dropped (e.g. the word
 * highlight a triple-click leaves behind before the line highlight), and new
 * highlights that are already fully covered are ignored.
 * Returns the same list when nothing is added.
 */
export const mergeHighlights = (existing: StoredHighlight[], incoming: StoredHighlight[]): StoredHighlight[] =>
  incoming.reduce(addHighlight, existing);

/** Find the top-most (most recently added) highlight containing the given normalized point. */
export const findHighlightAt = (highlights: StoredHighlight[], x: number, y: number): StoredHighlight | undefined =>
  highlights.findLast((highlight) => highlight.rects.some((rect) => containsPoint(rect, x, y)));

export const groupHighlightsByPage = (highlights: StoredHighlight[]): Map<number, StoredHighlight[]> => {
  const byPage = new Map<number, StoredHighlight[]>();

  for (const highlight of highlights) {
    const list = byPage.get(highlight.pageIndex);

    if (list === undefined) {
      byPage.set(highlight.pageIndex, [highlight]);
    } else {
      list.push(highlight);
    }
  }

  return byPage;
};

/** Sort highlights in reading order: by page, then top to bottom, then left to right. */
export const sortHighlightsByPosition = (highlights: StoredHighlight[]): StoredHighlight[] =>
  highlights.toSorted((a, b) => {
    if (a.pageIndex !== b.pageIndex) {
      return a.pageIndex - b.pageIndex;
    }

    const aStart = getStart(a);
    const bStart = getStart(b);

    return aStart.y === bStart.y ? aStart.x - bStart.x : aStart.y - bStart.y;
  });

const round = (value: number): number => Math.round(value * PRECISION) / PRECISION;

const addHighlight = (highlights: StoredHighlight[], highlight: StoredHighlight): StoredHighlight[] =>
  highlights.some((existing) => isCoveredBy(highlight, existing))
    ? highlights
    : [...highlights.filter((existing) => !isCoveredBy(existing, highlight)), highlight];

const containsPoint = (rect: NormalizedRect, x: number, y: number): boolean =>
  x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

const containsRect = (outer: NormalizedRect, inner: NormalizedRect): boolean =>
  inner.x >= outer.x - CONTAINMENT_EPSILON &&
  inner.y >= outer.y - CONTAINMENT_EPSILON &&
  inner.x + inner.width <= outer.x + outer.width + CONTAINMENT_EPSILON &&
  inner.y + inner.height <= outer.y + outer.height + CONTAINMENT_EPSILON;

const isCoveredBy = (inner: StoredHighlight, outer: StoredHighlight): boolean =>
  inner.pageIndex === outer.pageIndex &&
  inner.rects.every((innerRect) => outer.rects.some((outerRect) => containsRect(outerRect, innerRect)));

/** The top-left corner of a highlight's first line. */
const getStart = (highlight: StoredHighlight): { x: number; y: number } => {
  const [first, ...rest] = highlight.rects;

  if (first === undefined) {
    return { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY };
  }

  const start = rest.reduce((top, rect) => (isBefore(rect, top) ? rect : top), first);

  return { x: start.x, y: start.y };
};

const isBefore = (a: NormalizedRect, b: NormalizedRect): boolean => (a.y === b.y ? a.x < b.x : a.y < b.y);
