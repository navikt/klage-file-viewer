import type { HighlightRect, PageHighlights, SearchMatch } from '@/files/pdf/search/types';

const ESCAPE_QUERY_REGEX = /[.*+?^${}()|[\]\\]/g;

interface ComputeHighlightsResult {
  highlights: PageHighlights[];
  matches: SearchMatch[];
}

interface SpanTextInfo {
  textNode: Text;
  /** Start index of this span's text within the concatenated page text. */
  startIndex: number;
  /** End index (exclusive) of this span's text within the concatenated page text. */
  endIndex: number;
}

export const computeHighlights = (
  query: string,
  pageRefs: React.RefObject<Map<number, HTMLDivElement>>,
  caseSensitive: boolean,
): ComputeHighlightsResult => {
  if (query.length === 0) {
    return { highlights: [], matches: [] };
  }

  const escapedQuery = query.replaceAll(ESCAPE_QUERY_REGEX, '\\$&');
  const regex = new RegExp(escapedQuery, caseSensitive ? 'g' : 'gi');
  const highlights: PageHighlights[] = [];
  const matches: SearchMatch[] = [];
  let globalMatchIndex = 0;

  for (const [pageNumber, pageRef] of pageRefs.current?.entries() ?? []) {
    const textLayer = pageRef.querySelector('.textLayer');

    if (textLayer === null) {
      continue;
    }

    const textLayerRect = textLayer.getBoundingClientRect();
    const { highlights: pageHighlights, matchCount } = findMatchesInPage(
      textLayer,
      regex,
      textLayerRect,
      globalMatchIndex,
    );

    for (let i = 0; i < matchCount; i++) {
      matches.push({ pageNumber, matchIndex: globalMatchIndex + i });
    }

    if (pageHighlights.length > 0) {
      highlights.push({ pageNumber, highlights: pageHighlights });
    }

    globalMatchIndex += matchCount;
  }

  return { highlights, matches };
};

/**
 * Concatenates text from all spans in the text layer, searches for matches
 * in the concatenated text, and maps match positions back to individual
 * span text nodes for accurate highlight rectangles.
 *
 * This approach handles PDFs where each character is in its own span
 * (e.g., Google Docs exports) as well as normal PDFs where spans contain
 * words or phrases.
 */
const findMatchesInPage = (
  textLayer: Element,
  regex: RegExp,
  containerRect: DOMRect,
  globalMatchIndex: number,
): { highlights: HighlightRect[]; matchCount: number } => {
  const spanInfos: SpanTextInfo[] = [];
  let concatenatedText = '';

  for (const child of textLayer.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const element = child as Element;

      if (element.nodeName === 'BR') {
        // Insert a space at line boundaries so cross-line searches work.
        // This space is not mapped to any span, so it won't produce a highlight rect.
        if (concatenatedText.length > 0 && !concatenatedText.endsWith(' ')) {
          concatenatedText += ' ';
        }

        continue;
      }

      if (element.nodeName === 'SPAN') {
        const textNode = findTextNode(element);

        if (textNode === null) {
          continue;
        }

        const text = textNode.textContent ?? '';

        if (text.length === 0) {
          continue;
        }

        spanInfos.push({
          textNode,
          startIndex: concatenatedText.length,
          endIndex: concatenatedText.length + text.length,
        });

        concatenatedText += text;
      }
    }
  }

  if (concatenatedText.length === 0) {
    return { highlights: [], matchCount: 0 };
  }

  regex.lastIndex = 0;

  const highlights: HighlightRect[] = [];
  let matchCount = 0;

  for (const match of concatenatedText.matchAll(regex)) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    const currentMatchIndex = globalMatchIndex + matchCount;

    const matchHighlights = getHighlightRectsForMatch(
      spanInfos,
      matchStart,
      matchEnd,
      containerRect,
      currentMatchIndex,
    );
    highlights.push(...matchHighlights);

    matchCount++;
  }

  return { highlights, matchCount };
};

/**
 * For a single match in the concatenated text, find all overlapping spans
 * and create highlight rectangles for the matched portions of each span.
 */
const getHighlightRectsForMatch = (
  spanInfos: SpanTextInfo[],
  matchStart: number,
  matchEnd: number,
  containerRect: DOMRect,
  matchIndex: number,
): HighlightRect[] => {
  const highlights: HighlightRect[] = [];

  for (const spanInfo of spanInfos) {
    // Skip spans that don't overlap with this match
    if (spanInfo.endIndex <= matchStart || spanInfo.startIndex >= matchEnd) {
      continue;
    }

    // Calculate the overlap range within this span's text node
    const overlapStart = Math.max(0, matchStart - spanInfo.startIndex);
    const overlapEnd = Math.min(spanInfo.endIndex - spanInfo.startIndex, matchEnd - spanInfo.startIndex);

    try {
      const range = document.createRange();
      range.setStart(spanInfo.textNode, overlapStart);
      range.setEnd(spanInfo.textNode, overlapEnd);

      const rects = range.getClientRects();

      for (const rect of rects) {
        if (rect.width === 0 || rect.height === 0) {
          continue;
        }

        highlights.push({
          top: rect.top - containerRect.top,
          left: rect.left - containerRect.left,
          width: rect.width,
          height: rect.height,
          matchIndex,
        });
      }
    } catch {
      // Range operations can fail if text content doesn't match DOM state
    }
  }

  return mergeHighlightRects(highlights);
};

/** Tolerance in pixels for considering two rects to be on the same line. */
const POSITION_TOLERANCE = 1.5;

/**
 * Merge horizontally adjacent highlight rects that are on the same line
 * into single wider rects. This reduces DOM elements and produces cleaner
 * highlights, especially for PDFs where each character is its own span.
 */
const mergeHighlightRects = (rects: HighlightRect[]): HighlightRect[] => {
  if (rects.length <= 1) {
    return rects;
  }

  const sorted = rects.toSorted((a, b) => {
    const topDiff = a.top - b.top;

    if (Math.abs(topDiff) > POSITION_TOLERANCE) {
      return topDiff;
    }

    return a.left - b.left;
  });

  const first = sorted[0];

  if (first === undefined) {
    return rects;
  }

  const merged: HighlightRect[] = [first];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = merged[merged.length - 1];

    if (current === undefined || previous === undefined) {
      continue;
    }

    const sameLine =
      Math.abs(current.top - previous.top) <= POSITION_TOLERANCE &&
      Math.abs(current.height - previous.height) <= POSITION_TOLERANCE;

    const adjacent = current.left <= previous.left + previous.width + POSITION_TOLERANCE;

    if (sameLine && adjacent) {
      const mergedRight = Math.max(previous.left + previous.width, current.left + current.width);
      previous.width = mergedRight - previous.left;
    } else {
      merged.push(current);
    }
  }

  return merged;
};

/**
 * Find the first direct text node child of a span.
 * Returns null if the span has no text node children.
 */
const findTextNode = (span: Element): Text | null => {
  for (const child of span.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      return child as Text;
    }
  }

  return null;
};
