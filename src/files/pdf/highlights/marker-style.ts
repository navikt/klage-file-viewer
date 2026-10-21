/** Highlighter colour — opaque, blended onto the page with `multiply`. */
export const MARKER_COLOR = '#FFE94D';

interface MarkerPalette {
  /** Highlight colour. */
  color: string;
  /** Stronger tint for a highlight under the pointer in marker mode (click removes it). */
  hover: string;
  /** Pulse colour for a highlight navigated to from the highlight list. */
  flash: string;
}

/** Blended with `multiply` onto a light page: the paper turns yellow, dark text stays dark. */
const LIGHT_PALETTE: MarkerPalette = { color: MARKER_COLOR, hover: '#FFCC00', flash: '#FFA000' };

/**
 * Blended with `screen` onto a colour-inverted (dark) page: the black paper turns
 * amber, light text stays light. Dark enough to keep white text readable.
 */
const INVERTED_PALETTE: MarkerPalette = { color: '#8A6E00', hover: '#A88600', flash: '#C77700' };

export const getMarkerPalette = (inverted: boolean): MarkerPalette => (inverted ? INVERTED_PALETTE : LIGHT_PALETTE);

const MARKER_CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g transform="rotate(45 12 12)" stroke="#000" stroke-width="1" stroke-linejoin="round"><rect x="9" y="1" width="6" height="12" rx="1" fill="#555"/><path d="M9 13h6l-1 4h-4z" fill="${MARKER_COLOR}"/><path d="M10 17h4l-1 4h-2z" fill="#FFD600"/></g></svg>`;

/** Marker mode for one document. `unavailable` while marker mode is on but the document cannot be highlighted. */
export type DocumentMarkerMode = 'off' | 'on' | 'unavailable';

/** Dims a document and blocks its text selection while marker mode is on but the document cannot be highlighted. */
export const getMarkerUnavailableClassName = (unavailable: boolean): string =>
  unavailable ? 'cursor-not-allowed select-none opacity-40 transition-opacity' : 'transition-opacity';

/** Highlighter-pen cursor. The hotspot sits on the pen tip; falls back to the text cursor. */
export const MARKER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(MARKER_CURSOR_SVG)}") 5 19, text`;
