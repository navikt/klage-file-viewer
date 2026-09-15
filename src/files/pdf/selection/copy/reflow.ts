import type { Rotation } from '@embedpdf/models';
import type { PageSelectionRange, ScreenPageGeometry, ScreenRun, ScreenRunGlyph } from '@/files/pdf/selection/types';
import { GLYPH_FLAG_EMPTY, GLYPH_FLAG_SPACE, hasGlyphFlag } from '@/files/pdf/selection/types';

/** A run of text within a block sharing the same emphasis. */
export interface ReflowSpan {
  text: string;
  bold: boolean;
  italic: boolean;
}

/** A logical block of copied content (a wrap-joined line, list item, or heading). */
export interface ReflowBlock {
  kind: 'paragraph' | 'listItem' | 'heading';
  /** Styled runs that make up the block's text. */
  spans: ReflowSpan[];
  /** Indentation nesting level for `listItem` (1+); 0 otherwise. */
  level: number;
  /** Heading level 1–3 for `heading`; 0 otherwise. */
  headingLevel: number;
  /** Whether a paragraph gap (blank line) precedes this block. */
  gapBefore: boolean;
}

/**
 * Reconstruct paragraphs, indentation-based lists, and headings from a raw
 * selection of PDF text, returning a structured list of blocks.
 *
 * The character content always comes from the engine text (`pageText`, PDFium's
 * native char-index extraction) — this never re-derives characters from glyph
 * geometry, so soft-break characters are never lost. The geometry is used only
 * to decide structure:
 *
 *  - left-edge clusters → indentation levels (lists are indicated by indent);
 *  - dominant text size vs the page baseline → headings;
 *  - a change in level or text size, or a large vertical gap, is a structural
 *    break; otherwise a "next word would not have fit" test joins soft wraps.
 *
 * A misjudged geometry line can only pick the wrong separator/role — never drop
 * a character; the one thing geometry adds is a space across a column-sized
 * horizontal gap. Rotated pages (`/Rotate` 90/180/270) are first mapped into an
 * upright reading space so the same horizontal analysis applies unchanged.
 */
export const reflowSelection = (rawText: string, geo: ScreenPageGeometry, range: PageSelectionRange): ReflowBlock[] => {
  const textLines = splitTextLines(rawText, range.startCharIndex);

  if (textLines.length === 0) {
    return [];
  }

  const reading = toReadingSpace(geo);
  const pageText = reading.pageText ?? '';
  const geomLines = collectGeomLines(reading);
  assignIndentLevels(geomLines, reading.pageWidth);

  const baselineSize = baselineTextSize(geomLines);
  const styleIndex = buildStyleIndex(reading, baselineWeight(reading));
  const gapIndex = buildGapIndex(reading);
  const rightMargin = geomLines.reduce((max, line) => Math.max(max, line.right), 0);
  const typicalGap = medianGap(geomLines);
  const slack = rightMargin * MARGIN_SLACK_FACTOR;

  const blocks: ReflowBlock[] = [];

  let currentLines: TextLine[] = textLines[0] === undefined ? [] : [textLines[0]];
  let currentGeom = textLines[0] === undefined ? undefined : geomLineFor(textLines[0], geomLines);
  let currentGap = false;

  const flush = (): void => {
    const spans = buildBlockSpans(currentLines, pageText, styleIndex, gapIndex);
    blocks.push(makeBlock(spans, currentGeom, baselineSize, currentGap));
  };

  for (let i = 1; i < textLines.length; i++) {
    const prev = textLines[i - 1];
    const curr = textLines[i];

    if (prev === undefined || curr === undefined) {
      continue;
    }

    const separator = separatorBefore(prev, curr, geomLines, rightMargin, typicalGap, slack);

    if (separator === ' ') {
      currentLines.push(curr);
    } else {
      flush();
      currentLines = [curr];
      currentGeom = geomLineFor(curr, geomLines);
      currentGap = separator === '\n\n';
    }
  }

  flush();

  return blocks;
};

// A line break becomes a paragraph break when the vertical gap to the next
// line is at least this multiple of the page's typical line gap.
const PARAGRAPH_GAP_FACTOR = 1.6;

// Slack (fraction of the text width) allowed when testing whether the next
// word would have fit at the end of the current line.
const MARGIN_SLACK_FACTOR = 0.01;

// Fraction of line height used to approximate a space's advance width.
const SPACE_ADVANCE_FACTOR = 0.3;

// Fraction of line height within which two left edges count as the same column.
const INDENT_TOLERANCE_FACTOR = 0.5;

// A line whose left edge sits beyond this fraction of the text width is not a
// list indent (e.g. a right-aligned date) and is treated as level 0.
const INDENT_MAX_FRACTION = 0.5;

// A line whose dominant text size is at least this multiple of the page
// baseline is treated as a heading.
const HEADING_RATIO = 1.15;

// Heading-level thresholds (text-size ratio to the baseline).
const HEADING_LEVEL_1_RATIO = 1.7;
const HEADING_LEVEL_2_RATIO = 1.35;

// Adjacent lines whose text sizes differ by at least this ratio are a
// structural break (e.g. heading → body) and are never wrap-joined.
const TEXT_SIZE_BREAK_RATIO = 1.15;

// Two glyphs on the same line separated by at least this fraction of the line
// height (≈1.2 em) are in different columns and get a space between them.
const COLUMN_GAP_RATIO = 0.25;

// A run whose font weight exceeds the page baseline weight by at least this
// much is treated as bold.
const BOLD_WEIGHT_DELTA = 150;

// Font weights above this are PDFium artefacts (it sometimes reports a single
// nonsensical weight, e.g. 1496, for every run) and are ignored.
const MAX_VALID_FONT_WEIGHT = 900;

// PostScript font-name patterns indicating bold/italic. The name is the most
// reliable signal — many PDFs embed a bold/italic font without setting the
// weight or italic flag.
const BOLD_NAME_PATTERN = /bold|heavy|black|semibold|demibold/i;
const ITALIC_NAME_PATTERN = /italic|oblique/i;

const WHITESPACE_PATTERN = /\s/;

interface TextLine {
  text: string;
  start: number;
  end: number;
  blankBefore: boolean;
}

interface LineGlyph {
  cross: number;
  size: number;
  flags: number;
}

interface GeomLine {
  top: number;
  bottom: number;
  centre: number;
  left: number;
  right: number;
  start: number;
  end: number;
  level: number;
  /** Rendered text height → glyph count, used to size the line. */
  sizeCounts: Map<number, number>;
  glyphs: LineGlyph[];
}

const makeBlock = (
  spans: ReflowSpan[],
  geomLine: GeomLine | undefined,
  baselineSize: number,
  gapBefore: boolean,
): ReflowBlock => {
  const level = geomLine?.level ?? 0;
  const size = geomLine === undefined ? baselineSize : dominantTextSize(geomLine);
  const headingLevel = headingLevelFor(size, baselineSize);

  if (headingLevel > 0) {
    return { kind: 'heading', spans, level: 0, headingLevel, gapBefore };
  }

  if (level >= 1) {
    return { kind: 'listItem', spans, level, headingLevel: 0, gapBefore };
  }

  return { kind: 'paragraph', spans, level: 0, headingLevel: 0, gapBefore };
};

const headingLevelFor = (size: number, baseline: number): number => {
  if (baseline <= 0 || size <= 0) {
    return 0;
  }

  const ratio = size / baseline;

  if (ratio < HEADING_RATIO) {
    return 0;
  }

  if (ratio >= HEADING_LEVEL_1_RATIO) {
    return 1;
  }

  if (ratio >= HEADING_LEVEL_2_RATIO) {
    return 2;
  }

  return 3;
};

/** Split text into visual lines on PDFium's line breaks, tracking char ranges. */
const splitTextLines = (rawText: string, baseIndex: number): TextLine[] => {
  const lines: TextLine[] = [];
  let i = 0;
  let blankPending = false;

  while (i < rawText.length) {
    let j = i;

    while (j < rawText.length && rawText[j] !== '\r' && rawText[j] !== '\n') {
      j++;
    }

    const part = rawText.slice(i, j);
    const trimmed = part.trim();

    if (trimmed === '') {
      blankPending = true;
    } else {
      // Track the trimmed char range so spans don't include edge whitespace.
      const leading = part.length - part.trimStart().length;
      const start = baseIndex + i + leading;
      lines.push({ text: trimmed, start, end: start + trimmed.length - 1, blankBefore: blankPending });
      blankPending = false;
    }

    if (j < rawText.length && rawText[j] === '\r' && rawText[j + 1] === '\n') {
      j += 2;
    } else if (j < rawText.length) {
      j += 1;
    }

    i = j;
  }

  return lines;
};

/**
 * Map a whole page geometry into an upright reading space where text flows
 * left→right, top→bottom, so the horizontal reflow analysis applies unchanged.
 *
 * Pages with an inherent `/Rotate` (90/180/270) carry glyph geometry in a
 * rotated device space where reading "lines" may be vertical columns. The
 * character content (`pageText`) and `charStart` values are already in reading
 * order (`reorderRunsVisually` ran during geometry transform); only the
 * coordinates need rotating. Each run rect and glyph box is axis-aligned in
 * device space, so each is remapped as a rectangle. For 90°/270° the page's
 * width and height extents swap. Rotation 0 is returned unchanged.
 */
const toReadingSpace = (geo: ScreenPageGeometry): ScreenPageGeometry => {
  const rotation = geo.pageRotation ?? 0;

  if (rotation === 0) {
    return geo;
  }

  const { width: deviceWidth, height: deviceHeight } = deviceExtent(geo);
  const swapped = rotation === 1 || rotation === 3;

  const runs: ScreenRun[] = geo.runs.map((run) => ({
    ...run,
    rect: rotateRect(run.rect, rotation, deviceWidth, deviceHeight),
    glyphs: run.glyphs.map((glyph) => rotateGlyph(glyph, rotation, deviceWidth, deviceHeight)),
  }));

  return {
    ...geo,
    runs,
    pageWidth: swapped ? geo.pageHeight : geo.pageWidth,
    pageHeight: swapped ? geo.pageWidth : geo.pageHeight,
    pageRotation: 0,
  };
};

/** Device-space page extent, falling back to the runs' bounding box. */
const deviceExtent = (geo: ScreenPageGeometry): { width: number; height: number } => {
  if (geo.pageWidth !== undefined && geo.pageHeight !== undefined) {
    return { width: geo.pageWidth, height: geo.pageHeight };
  }

  let width = 0;
  let height = 0;

  for (const run of geo.runs) {
    width = Math.max(width, run.rect.x + run.rect.width);
    height = Math.max(height, run.rect.y + run.rect.height);
  }

  return { width, height };
};

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Rotate an axis-aligned device-space rectangle into upright reading space for
 * the given `/Rotate`. `deviceWidth`/`deviceHeight` are the device page extents.
 */
const rotateRect = (rect: Rect, rotation: Rotation, deviceWidth: number, deviceHeight: number): Rect => {
  const { x, y, width: w, height: h } = rect;

  if (rotation === 1) {
    return { x: y, y: deviceWidth - x - w, width: h, height: w };
  }

  if (rotation === 2) {
    return { x: deviceWidth - x - w, y: deviceHeight - y - h, width: w, height: h };
  }

  if (rotation === 3) {
    return { x: deviceHeight - y - h, y: x, width: h, height: w };
  }

  return rect;
};

/** Rotate a glyph's loose box into reading space, preserving flags/tight bounds. */
const rotateGlyph = (
  glyph: ScreenRunGlyph,
  rotation: Rotation,
  deviceWidth: number,
  deviceHeight: number,
): ScreenRunGlyph => {
  const box = rotateRect(
    { x: glyph.x, y: glyph.y, width: glyph.width, height: glyph.height },
    rotation,
    deviceWidth,
    deviceHeight,
  );

  return { ...glyph, x: box.x, y: box.y, width: box.width, height: box.height };
};

/** Group all visible runs on the page into positioned lines (in reading order). */
const collectGeomLines = (geo: ScreenPageGeometry): GeomLine[] => {
  const lines: GeomLine[] = [];
  let current: GeomLine | null = null;

  for (const run of geo.runs) {
    if (run.rect.width === 0 && run.rect.height === 0) {
      continue;
    }

    if (run.glyphs.length === 0) {
      continue;
    }

    const runStart = run.charStart;
    const runEnd = run.charStart + run.glyphs.length - 1;
    const top = run.rect.y;
    const bottom = run.rect.y + run.rect.height;

    if (current === null || !overlapsVertically(current, top, bottom)) {
      if (current !== null) {
        lines.push(current);
      }

      current = {
        top,
        bottom,
        centre: (top + bottom) / 2,
        left: run.rect.x,
        right: run.rect.x + run.rect.width,
        start: runStart,
        end: runEnd,
        level: 0,
        sizeCounts: new Map(),
        glyphs: [],
      };
    } else {
      current.top = Math.min(current.top, top);
      current.bottom = Math.max(current.bottom, bottom);
      current.centre = (current.top + current.bottom) / 2;
      current.left = Math.min(current.left, run.rect.x);
      current.right = Math.max(current.right, run.rect.x + run.rect.width);
      current.start = Math.min(current.start, runStart);
      current.end = Math.max(current.end, runEnd);
    }

    // Size the run by how tall it actually renders rather than by
    // `run.fontSize`. PDFium reports the raw `Tf` operand, which ignores any
    // scale baked into the text matrix — a page that sets `/F1 1 Tf` and scales
    // by 10 in `Tm` reports size 1 for every run no matter how large it draws.
    // Flattened form widgets report their true size, so the two scales would
    // otherwise coexist on one page and make ordinary field values look like
    // headings. Run rects are loose (font-metric) boxes in device space, so
    // they are character-independent and comparable across the whole page.
    const size = Math.round(run.rect.height * 100) / 100;

    if (size > 0) {
      current.sizeCounts.set(size, (current.sizeCounts.get(size) ?? 0) + run.glyphs.length);
    }

    for (const glyph of run.glyphs) {
      current.glyphs.push({ cross: glyph.x, size: glyph.width, flags: glyph.flags });
    }
  }

  if (current !== null) {
    lines.push(current);
  }

  return lines;
};

const overlapsVertically = (line: GeomLine, top: number, bottom: number): boolean => {
  const overlapStart = Math.max(line.top, top);
  const overlapEnd = Math.min(line.bottom, bottom);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  const union = Math.max(line.bottom, bottom) - Math.min(line.top, top);

  return union > 0 && overlap / union >= 0.5;
};

/** Dominant (most glyphs) rendered text size of a line, or 0 when unknown. */
const dominantTextSize = (line: GeomLine): number => {
  let best = 0;
  let bestCount = 0;

  for (const [size, count] of line.sizeCounts) {
    if (count > bestCount) {
      bestCount = count;
      best = size;
    }
  }

  return best;
};

/** The page's baseline (most common) rendered text size across all lines. */
const baselineTextSize = (lines: GeomLine[]): number => {
  const tally = new Map<number, number>();

  for (const line of lines) {
    for (const [size, count] of line.sizeCounts) {
      tally.set(size, (tally.get(size) ?? 0) + count);
    }
  }

  let best = 0;
  let bestCount = 0;

  for (const [size, count] of tally) {
    if (count > bestCount) {
      bestCount = count;
      best = size;
    }
  }

  return best;
};

/**
 * Cluster line left-edges into indentation columns and assign each line a
 * nesting level. The leftmost column is level 0; each deeper column is a
 * sub-level (these documents indicate lists purely by indentation).
 *
 * A line whose left edge sits past {@link INDENT_MAX_FRACTION} of the text
 * width is treated as level 0, not a deep list level — that catches
 * right-positioned lines (e.g. a right-aligned date) which are not list items.
 */
const assignIndentLevels = (lines: GeomLine[], pageWidth: number | undefined): void => {
  if (lines.length === 0) {
    return;
  }

  const tolerance = indentTolerance(lines);
  const sorted = [...lines].sort((a, b) => a.left - b.left);

  const columns: number[] = [];

  for (const line of sorted) {
    const last = columns[columns.length - 1];

    if (last === undefined || line.left - last > tolerance) {
      columns.push(line.left);
    }
  }

  const baseline = columns[0] ?? 0;
  const maxRight = lines.reduce((max, line) => Math.max(max, line.right), baseline);
  const reference = pageWidth !== undefined && pageWidth > baseline ? pageWidth : maxRight;
  const maxIndent = (reference - baseline) * INDENT_MAX_FRACTION;
  const ladder = columns.filter((column) => column - baseline <= maxIndent);

  for (const line of lines) {
    if (line.left - baseline > maxIndent) {
      line.level = 0;
      continue;
    }

    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let k = 0; k < ladder.length; k++) {
      const distance = Math.abs(line.left - (ladder[k] ?? 0));

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = k;
      }
    }

    line.level = nearest;
  }
};

const indentTolerance = (lines: GeomLine[]): number => {
  const heights = lines.map((line) => line.bottom - line.top).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] ?? 0;

  return Math.max(2, median * INDENT_TOLERANCE_FACTOR);
};

/** Median centre-to-centre gap between consecutive lines (by vertical order). */
const medianGap = (lines: GeomLine[]): number => {
  if (lines.length < 2) {
    return 0;
  }

  const centres = lines.map((line) => line.centre).sort((a, b) => a - b);
  const gaps: number[] = [];

  for (let i = 1; i < centres.length; i++) {
    gaps.push((centres[i] ?? 0) - (centres[i - 1] ?? 0));
  }

  gaps.sort((a, b) => a - b);

  return gaps[Math.floor(gaps.length / 2)] ?? 0;
};

/** Decide the separator to place before `curr`. */
const separatorBefore = (
  prev: TextLine,
  curr: TextLine,
  geomLines: GeomLine[],
  rightMargin: number,
  typicalGap: number,
  slack: number,
): ' ' | '\n' | '\n\n' => {
  if (curr.blankBefore) {
    return '\n\n';
  }

  const geomPrev = geomLineFor(prev, geomLines);
  const geomCurr = geomLineFor(curr, geomLines);

  // A change in indentation level is always a structural break.
  if ((geomPrev?.level ?? 0) !== (geomCurr?.level ?? 0)) {
    return '\n';
  }

  // A change in text size (e.g. heading → body) is a structural break.
  if (geomPrev !== undefined && geomCurr !== undefined) {
    const sizePrev = dominantTextSize(geomPrev);
    const sizeCurr = dominantTextSize(geomCurr);

    if (sizePrev > 0 && sizeCurr > 0) {
      const ratio = Math.max(sizePrev, sizeCurr) / Math.min(sizePrev, sizeCurr);

      if (ratio >= TEXT_SIZE_BREAK_RATIO) {
        return '\n\n';
      }
    }
  }

  if (geomPrev !== undefined && geomCurr !== undefined && typicalGap > 0) {
    const gap = geomCurr.centre - geomPrev.centre;

    if (gap >= typicalGap * PARAGRAPH_GAP_FACTOR) {
      return '\n\n';
    }
  }

  if (geomPrev === undefined || geomCurr === undefined) {
    return '\n';
  }

  // Wrap detection: if the next line's first word would not have fit after
  // the current line's last glyph, the break was a soft wrap → join.
  const nextWordWidth = firstWordWidth(geomCurr);
  const spaceWidth = (geomPrev.bottom - geomPrev.top) * SPACE_ADVANCE_FACTOR;

  if (geomPrev.right + spaceWidth + nextWordWidth > rightMargin - slack) {
    return ' ';
  }

  return '\n';
};

/** The geometry line whose char range overlaps the text line the most. */
const geomLineFor = (textLine: TextLine, geomLines: GeomLine[]): GeomLine | undefined => {
  let best: GeomLine | undefined;
  let bestOverlap = 0;

  for (const line of geomLines) {
    const overlap = Math.min(textLine.end, line.end) - Math.max(textLine.start, line.start) + 1;

    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = line;
    }
  }

  return bestOverlap > 0 ? best : undefined;
};

/** Width of the first word on a line (from its leftmost glyph to the first space). */
const firstWordWidth = (line: GeomLine): number => {
  const glyphs = line.glyphs
    .filter((glyph) => !hasGlyphFlag(glyph.flags, GLYPH_FLAG_EMPTY))
    .sort((a, b) => a.cross - b.cross);

  let started = false;
  let left = 0;
  let right = 0;

  for (const glyph of glyphs) {
    const isSpace = hasGlyphFlag(glyph.flags, GLYPH_FLAG_SPACE);

    if (!started) {
      if (isSpace) {
        continue;
      }

      started = true;
      left = glyph.cross;
      right = glyph.cross + glyph.size;
    } else {
      if (isSpace) {
        break;
      }

      right = Math.max(right, glyph.cross + glyph.size);
    }
  }

  return started ? right - left : 0;
};

// ---------------------------------------------------------------------------
// Emphasis (bold / italic) spans
// ---------------------------------------------------------------------------

interface StyleEntry {
  start: number;
  end: number;
  bold: boolean;
  italic: boolean;
}

/**
 * Build the styled spans for a block from its source lines. Content comes from
 * the engine text (`pageText`); style (bold/italic) comes from the run each
 * character belongs to. Wrap-joined lines are separated by a single space, as
 * are glyphs sitting in separate columns of the same line.
 */
const buildBlockSpans = (
  lines: TextLine[],
  pageText: string,
  styleIndex: StyleEntry[],
  gapIndex: Map<number, GapGlyph>,
): ReflowSpan[] => {
  const raw: ReflowSpan[] = [];

  lines.forEach((line, index) => {
    if (index > 0) {
      raw.push({ text: ' ', bold: false, italic: false });
    }

    let previous: GapGlyph | undefined;

    for (let i = line.start; i <= line.end; i++) {
      const char = pageText[i] ?? '';
      const blank = char === '' || WHITESPACE_PATTERN.test(char);
      const glyph = gapIndex.get(i);

      if (!blank && glyph !== undefined && previous !== undefined && needsColumnSpace(previous, glyph)) {
        raw.push({ text: ' ', bold: false, italic: false });
      }

      const style = lookupStyle(styleIndex, i);
      raw.push({ text: char, bold: style.bold, italic: style.italic });

      if (blank) {
        previous = undefined;
      } else if (glyph !== undefined) {
        previous = glyph;
      }
    }
  });

  return mergeSpans(raw);
};

/** Merge adjacent spans that share emphasis and drop empty spans. */
const mergeSpans = (spans: ReflowSpan[]): ReflowSpan[] => {
  const out: ReflowSpan[] = [];

  for (const span of spans) {
    if (span.text === '') {
      continue;
    }

    const last = out[out.length - 1];

    if (last !== undefined && last.bold === span.bold && last.italic === span.italic) {
      last.text += span.text;
    } else {
      out.push({ ...span });
    }
  }

  return out.length > 0 ? out : [{ text: '', bold: false, italic: false }];
};

/** Build a sorted index of char ranges to their run's emphasis. */
const buildStyleIndex = (geo: ScreenPageGeometry, baseline: number): StyleEntry[] => {
  const entries: StyleEntry[] = [];

  for (const run of geo.runs) {
    if (run.glyphs.length === 0) {
      continue;
    }

    entries.push({
      start: run.charStart,
      end: run.charStart + run.glyphs.length - 1,
      bold: isBoldRun(run, baseline),
      italic: isItalicRun(run),
    });
  }

  entries.sort((a, b) => a.start - b.start);

  return entries;
};

/**
 * Whether a run is bold. The PostScript font name is the primary signal (many
 * PDFs embed a bold font without setting the weight); a valid weight clearly
 * above the page baseline is the fallback.
 */
const isBoldRun = (run: ScreenRun, baseline: number): boolean => {
  if (run.fontName !== undefined && BOLD_NAME_PATTERN.test(run.fontName)) {
    return true;
  }

  if (run.fontWeight !== undefined && run.fontWeight <= MAX_VALID_FONT_WEIGHT && baseline <= MAX_VALID_FONT_WEIGHT) {
    return run.fontWeight >= baseline + BOLD_WEIGHT_DELTA;
  }

  return false;
};

/** Whether a run is italic, by the italic flag or the font name. */
const isItalicRun = (run: ScreenRun): boolean =>
  run.italic === true || (run.fontName !== undefined && ITALIC_NAME_PATTERN.test(run.fontName));

/** The emphasis at a char index (binary search over the sorted style index). */
const lookupStyle = (index: StyleEntry[], charIndex: number): { bold: boolean; italic: boolean } => {
  let lo = 0;
  let hi = index.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const entry = index[mid];

    if (entry === undefined) {
      break;
    }

    if (charIndex < entry.start) {
      hi = mid - 1;
    } else if (charIndex > entry.end) {
      lo = mid + 1;
    } else {
      return { bold: entry.bold, italic: entry.italic };
    }
  }

  return { bold: false, italic: false };
};

/** The page's baseline (most common) font weight, defaulting to 400. */
const baselineWeight = (geo: ScreenPageGeometry): number => {
  const tally = new Map<number, number>();

  for (const run of geo.runs) {
    if (run.fontWeight !== undefined && run.fontWeight <= MAX_VALID_FONT_WEIGHT && run.glyphs.length > 0) {
      tally.set(run.fontWeight, (tally.get(run.fontWeight) ?? 0) + run.glyphs.length);
    }
  }

  let best = 400;
  let bestCount = 0;

  for (const [weight, count] of tally) {
    if (count > bestCount) {
      bestCount = count;
      best = weight;
    }
  }

  return best;
};

// ---------------------------------------------------------------------------
// Column gaps
// ---------------------------------------------------------------------------

/** Horizontal extent of a single glyph. */
interface GapGlyph {
  left: number;
  right: number;
  height: number;
}

/**
 * Index every laid-out glyph by its character index. Side-by-side table columns
 * are separate runs that PDFium reports back to back in `pageText` with no
 * space between them — only the horizontal gap tells them apart.
 */
const buildGapIndex = (geo: ScreenPageGeometry): Map<number, GapGlyph> => {
  const index = new Map<number, GapGlyph>();

  for (const run of geo.runs) {
    run.glyphs.forEach((glyph, offset) => {
      if (hasGlyphFlag(glyph.flags, GLYPH_FLAG_EMPTY) || glyph.width <= 0) {
        return;
      }

      index.set(run.charStart + offset, {
        left: glyph.x,
        right: glyph.x + glyph.width,
        height: glyph.height,
      });
    });
  }

  return index;
};

/** Whether two consecutive glyphs are far enough apart to need a space. */
const needsColumnSpace = (previous: GapGlyph, current: GapGlyph): boolean => {
  const height = Math.max(previous.height, current.height);

  return height > 0 && current.left - previous.right >= height * COLUMN_GAP_RATIO;
};
