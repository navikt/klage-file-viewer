import type {
  PdfDocumentObject,
  PdfEngine,
  Rect,
  Rotation,
  SearchAllPagesResult,
  SearchResult,
} from '@embedpdf/models';
import { MatchFlag } from '@embedpdf/models';
import type { HighlightRect, PageHighlights, SearchMatch } from '@/files/pdf/search/types';

interface ComputeHighlightsResult {
  highlights: PageHighlights[];
  matches: SearchMatch[];
}

export interface SearchableDocument {
  engine: PdfEngine;
  doc: PdfDocumentObject;
  /** The first global page number for this document (1-based). */
  pageNumberOffset: number;
  scale: number;
  /** Per-page rotation map (pageIndex → Rotation). */
  rotations: Map<number, Rotation>;
}

interface PageGeometry {
  scaleFactor: number;
}

export const computeHighlights = async (
  query: string,
  documents: SearchableDocument[],
  caseSensitive: boolean,
): Promise<ComputeHighlightsResult> => {
  if (query.length === 0) {
    return { highlights: [], matches: [] };
  }

  const highlights: PageHighlights[] = [];
  const matches: SearchMatch[] = [];
  let globalMatchIndex = 0;

  for (const document of documents) {
    const searchResult = await searchDocument(document, query, caseSensitive);

    if (searchResult === null) {
      continue;
    }

    const resultsByPage = groupResultsByPage(searchResult.results);
    const scaleFactor = document.scale / 100;

    for (const [pageIndex, pageResults] of resultsByPage) {
      const page = document.doc.pages[pageIndex];

      if (page === undefined) {
        continue;
      }

      const pageNumber = document.pageNumberOffset + pageIndex + 1;
      const geometry: PageGeometry = { scaleFactor };

      const { pageHighlights, matchCount } = processPageResults(pageResults, geometry, globalMatchIndex);

      for (let i = 0; i < matchCount; i++) {
        matches.push({ pageNumber, matchIndex: globalMatchIndex + i });
      }

      if (pageHighlights.length > 0) {
        highlights.push({ pageNumber, highlights: mergeHighlightRects(pageHighlights) });
      }

      globalMatchIndex += matchCount;
    }
  }

  return { highlights, matches };
};

const searchDocument = async (
  document: SearchableDocument,
  query: string,
  caseSensitive: boolean,
): Promise<SearchAllPagesResult | null> => {
  const { engine, doc } = document;
  const flags = caseSensitive ? [MatchFlag.MatchCase] : [];

  try {
    return await engine.searchAllPages(doc, query, { flags }).toPromise();
  } catch {
    return null;
  }
};

const groupResultsByPage = (results: SearchResult[]): Map<number, SearchResult[]> => {
  const resultsByPage = new Map<number, SearchResult[]>();

  for (const result of results) {
    const existing = resultsByPage.get(result.pageIndex);

    if (existing !== undefined) {
      existing.push(result);
    } else {
      resultsByPage.set(result.pageIndex, [result]);
    }
  }

  return resultsByPage;
};

const processPageResults = (
  pageResults: SearchResult[],
  geometry: PageGeometry,
  startMatchIndex: number,
): { pageHighlights: HighlightRect[]; matchCount: number } => {
  const pageHighlights: HighlightRect[] = [];
  let matchCount = 0;

  for (const result of pageResults) {
    const currentMatchIndex = startMatchIndex + matchCount;

    for (const rect of result.rects) {
      const highlight = transformRect(rect, geometry, currentMatchIndex);

      if (highlight !== null) {
        pageHighlights.push(highlight);
      }
    }

    matchCount++;
  }

  return { pageHighlights, matchCount };
};

/**
 * Scale a rect from the engine to screen coordinates.
 *
 * The engine already returns rects in device-space (origin top-left, Y-down)
 * via `convertPagePointToDevicePoint`, so we only need to apply the scale
 * factor. User-rotation is handled by the CSS transform on the page container.
 */
const transformRect = (rect: Rect, geometry: PageGeometry, matchIndex: number): HighlightRect | null => {
  const { scaleFactor } = geometry;

  const left = rect.origin.x * scaleFactor;
  const top = rect.origin.y * scaleFactor;
  const width = rect.size.width * scaleFactor;
  const height = rect.size.height * scaleFactor;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { top, left, width, height, matchIndex };
};

/** Tolerance in pixels for considering two rects to be on the same line. */
const POSITION_TOLERANCE = 1.5;

/**
 * Merge horizontally adjacent highlight rects that are on the same line
 * into single wider rects. This reduces DOM elements and produces cleaner
 * highlights, especially for PDFs where each character gets its own rect.
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
