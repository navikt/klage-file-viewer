import type { PageSelectionRange, ScreenPageGeometry } from '@/files/pdf/selection/types';

/**
 * Build a text slice in original (engine) char indices from a visual
 * selection range.
 *
 * When the page geometry has been reordered (`visualToOriginal` is set),
 * the visual start/end indices are translated back to the original char
 * space.  Because the visual range may map to a non-contiguous original
 * range, we use the minimum original index as the start and span up to
 * the maximum — the extra characters in between are harmless for the
 * reflow step which operates on geometry-based line boundaries anyway.
 */
export const buildOriginalSlice = (
  range: PageSelectionRange,
  geo: ScreenPageGeometry | undefined,
): { pageIndex: number; charIndex: number; charCount: number } => {
  if (geo?.visualToOriginal === undefined) {
    return {
      pageIndex: range.pageIndex,
      charIndex: range.startCharIndex,
      charCount: range.endCharIndex - range.startCharIndex + 1,
    };
  }

  const map = geo.visualToOriginal;

  let minOriginal = Number.POSITIVE_INFINITY;
  let maxOriginal = Number.NEGATIVE_INFINITY;

  for (let i = range.startCharIndex; i <= range.endCharIndex; i++) {
    const orig = map[i];

    if (orig === undefined) {
      continue;
    }

    minOriginal = Math.min(minOriginal, orig);
    maxOriginal = Math.max(maxOriginal, orig);
  }

  if (minOriginal > maxOriginal) {
    return { pageIndex: range.pageIndex, charIndex: 0, charCount: 0 };
  }

  return {
    pageIndex: range.pageIndex,
    charIndex: minOriginal,
    charCount: maxOriginal - minOriginal + 1,
  };
};
