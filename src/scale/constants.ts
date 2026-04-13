/** A4 page width in CSS pixels (96 DPI). */
export const A4_WIDTH_PX = 794;

/** A4 page height in CSS pixels (96 DPI). */
export const A4_HEIGHT_PX = 1123;

/** Conversion factor from PDF points (72 DPI) to CSS pixels (96 DPI). */
export const PX_PER_PT = 96 / 72;

export const PDF_PAGE_HEIGHT = 1140;
export const PDF_PAGE_WIDTH = 811;
export const PDF_MARGIN = 20;
export const PDF_PADDING_X = 60;
export const PDF_PADDING_Y = 30;

export const LOGO_CIRCLE_RADIUS = 60;
export const TITLE_FONT_SIZE = 30;
export const LINE_FONT_SIZE = 15;

export const USER_STEP = 5;
export const STEP = 1;

export const INITIAL_SCALE = 100;
export const MIN_SCALE = 50;
export const MAX_SCALE = 900;
export const SCALE_STEP = 25;
export const SCROLL_STEP = 5;
export const KLAGE_FILE_VIEWER_SCALE_MODE_KEY = 'klage-file-viewer/settings/scale-mode';
export const KLAGE_FILE_VIEWER_SCALE_VALUE_KEY = 'klage-file-viewer/settings/scale-value';
export const KLAGE_FILE_VIEWER_WIDTH_KEY = 'klage-file-viewer/settings/viewer-width';

/** Horizontal padding per side applied to each file section (px). */
export const SECTION_PADDING_INLINE = 8;

/** Default inline viewer width in pixels (A4 pixel width + section padding). */
export const DEFAULT_INLINE_WIDTH = A4_WIDTH_PX + SECTION_PADDING_INLINE * 2;
export const MIN_INLINE_WIDTH = 600;
