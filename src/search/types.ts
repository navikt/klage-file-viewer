export interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
  matchIndex: number;
}

export interface PageHighlights {
  pageNumber: number;
  highlights: HighlightRect[];
}

export interface SearchMatch {
  pageNumber: number;
  matchIndex: number;
}
