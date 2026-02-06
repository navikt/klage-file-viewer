import type { HighlightRect, PageHighlights, SearchMatch } from './types';

const ESCAPE_QUERY_REGEX = /[.*+?^${}()|[\]\\]/g;

interface ComputeHighlightsResult {
  highlights: PageHighlights[];
  matches: SearchMatch[];
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

    const pageRect = pageRef.getBoundingClientRect();
    const spans = textLayer.querySelectorAll('span');

    const pageHighlights: HighlightRect[] = [];

    for (const span of spans) {
      const { highlights, matchCount } = findMatchesInSpan(span, regex, pageRect, globalMatchIndex);

      pageHighlights.push(...highlights);

      for (let i = 0; i < matchCount; i++) {
        matches.push({ pageNumber, matchIndex: globalMatchIndex + i });
      }

      globalMatchIndex += matchCount;
    }

    if (pageHighlights.length > 0) {
      highlights.push({ pageNumber, highlights: pageHighlights });
    }
  }

  return { highlights, matches };
};

const findMatchesInSpan = (
  span: Element,
  regex: RegExp,
  pageRect: DOMRect,
  matchIndex: number,
): { highlights: HighlightRect[]; matchCount: number } => {
  const text = span.textContent ?? '';
  const highlights: HighlightRect[] = [];

  // Reset lastIndex before matching, as the regex has the global flag
  // which makes it stateful across calls
  regex.lastIndex = 0;

  if (!regex.test(text)) {
    return { highlights: [], matchCount: 0 };
  }

  // Reset again after test() advanced lastIndex
  regex.lastIndex = 0;

  // Create a range to measure text positions
  const range = document.createRange();
  const textNode = span.firstChild;

  if (textNode === null || textNode.nodeType !== Node.TEXT_NODE) {
    return { highlights: [], matchCount: 0 };
  }

  let currentMatchIndex = matchIndex;

  for (const match of text.matchAll(regex)) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;

    try {
      range.setStart(textNode, matchStart);
      range.setEnd(textNode, matchEnd);

      const rects = range.getClientRects();

      for (const rect of rects) {
        highlights.push({
          top: rect.top - pageRect.top,
          left: rect.left - pageRect.left,
          width: rect.width,
          height: rect.height,
          matchIndex: currentMatchIndex,
        });
      }

      currentMatchIndex++;
    } catch {
      // Range operations can fail if text content doesn't match
    }
  }

  return { highlights, matchCount: currentMatchIndex - matchIndex };
};
