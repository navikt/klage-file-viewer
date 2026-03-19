import type { PageSelectionRange, ScreenPageGeometry } from '@/files/pdf/selection/types';
import { classifyBlock, detectAlignment, detectListMarker, isIndentedLine } from './classify';
import {
  computeBaselineFontSize,
  computeBaselineLeftEdge,
  computePageBaselineFontWeight,
  computePageMaxFontSize,
} from './font-detection';
import type { LineInfo } from './line-info';
import { collectLineInfo, computeLineGaps, computePageMaxRight, MIN_LINES_FOR_STATS } from './line-info';
import type { InternalBlock, ReflowBlock } from './reflow-types';
import { buildSpansForRange, mergeSpansWithSpace } from './spans';

// biome-ignore lint/performance/noBarrelFile: Re-export public API so external consumers don't need to change imports.
export { computeDocumentStats } from './font-detection';
export type {
  BlockRole,
  DocumentStats,
  PageReflow,
  ReflowBlock,
  ReflowSpan,
} from './reflow-types';
export { EMPTY_REFLOW, lineText } from './reflow-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * A gap between two lines that is at least this multiple of the average
 * line height indicates an "empty line" — always a block break.
 *
 * Typical within-block line spacing is ~1.0–1.2× line height.
 * Block breaks are ≥1.8× (the gap is large enough to fit another line).
 */
const EMPTY_LINE_GAP_FACTOR = 1.5;

/**
 * A line whose right edge reaches within this fraction of the maximum line
 * right edge is considered "full width".
 */
const FULL_WIDTH_THRESHOLD = 0.9;

/**
 * Minimum font-size ratio between adjacent lines to force a block break.
 * This ensures headings are split from body text even when the vertical gap
 * is the same as normal line spacing.
 */
const FONT_SIZE_BREAK_RATIO = 1.1;

// ---------------------------------------------------------------------------
// Analysis entry point
// ---------------------------------------------------------------------------

/** Strip internal geometry fields from lines before returning. */
const stripInternalFields = (p: InternalBlock): ReflowBlock => ({
  lines: p.lines.map(({ spans }) => spans),
  role: p.role,
  headingLevel: p.headingLevel,
  listKind: p.listKind,
  alignment: p.alignment,
});

/**
 * Build the intermediate {@link ReflowBlock} model from raw text and
 * page geometry.
 *
 * @param documentStats – Optional document-wide statistics (max font size,
 *   block gap threshold) computed across all pages. When provided,
 *   heading levels and block detection are consistent across pages.
 *   When omitted, page-local statistics are used as fallback.
 */
export const analyzePageReflow = (
  rawText: string,
  range: PageSelectionRange,
  geo: ScreenPageGeometry,
  documentStats?: import('./reflow-types').DocumentStats,
): ReflowBlock[] => {
  const lineInfos = collectLineInfo(range, geo);
  const baselineWeight = computePageBaselineFontWeight(geo);
  const baselineFontSize = computeBaselineFontSize(geo);
  const baselineLeftEdge = computeBaselineLeftEdge(geo);
  const maxRight = computePageMaxRight(geo);
  const maxFontSize = documentStats?.maxFontSize ?? computePageMaxFontSize(geo);

  let blocks: InternalBlock[];

  if (lineInfos.length < MIN_LINES_FOR_STATS || computeLineGaps(lineInfos).length === 0) {
    blocks = buildSingleBlock(rawText, range, geo, baselineWeight, lineInfos);
  } else {
    blocks = buildMultiLineBlocks(rawText, range, geo, baselineWeight, lineInfos, maxRight, baselineLeftEdge);
  }

  for (const block of blocks) {
    block.alignment = detectAlignment(block, maxRight, baselineLeftEdge);
    classifyBlock(block, baselineFontSize, maxFontSize, baselineLeftEdge);
  }

  return blocks.map(stripInternalFields);
};

/** Build a single block when there aren't enough lines for gap analysis. */
const buildSingleBlock = (
  rawText: string,
  range: PageSelectionRange,
  geo: ScreenPageGeometry,
  baselineWeight: number | undefined,
  lineInfos: LineInfo[],
): InternalBlock[] => {
  const fontSize = lineInfos[0]?.dominantFontSize;
  const leftEdge = lineInfos[0]?.leftEdge;
  const spans = buildSpansForRange(
    range.startCharIndex,
    range.endCharIndex,
    rawText,
    range.startCharIndex,
    geo,
    baselineWeight,
  );

  return [
    {
      lines: [{ text: rawText, spans, fontSize, leftEdge, rightEdge: undefined }],
      role: 'paragraph',
      headingLevel: undefined,
      listKind: undefined,
      alignment: 'left',
    },
  ];
};

/** Build blocks from multi-line selections with gap and font-size analysis. */
const buildMultiLineBlocks = (
  rawText: string,
  range: PageSelectionRange,
  geo: ScreenPageGeometry,
  baselineWeight: number | undefined,
  lineInfos: LineInfo[],
  maxRight: number,
  baselineLeftEdge: number | undefined,
): InternalBlock[] => {
  const gaps = computeLineGaps(lineInfos);
  const textLines = splitTextByGeometry(rawText, range, lineInfos);

  const makeBlock = (): InternalBlock => ({
    lines: [],
    role: 'paragraph',
    headingLevel: undefined,
    listKind: undefined,
    alignment: 'left',
  });

  const blocks: InternalBlock[] = [makeBlock()];

  for (let i = 0; i < textLines.length; i++) {
    const text = textLines[i];
    const lineInfo = lineInfos[i];

    if (text === undefined || lineInfo === undefined) {
      continue;
    }

    let sep: '\n\n' | '\n' | ' ' | null = null;

    if (i > 0) {
      const prevLineInfo = lineInfos[i - 1];

      if (prevLineInfo !== undefined) {
        sep = lineSeparator(gaps[i - 1], prevLineInfo, lineInfo, maxRight);
      }

      sep = refineSeparator(sep, text, lineInfo, lineInfos[i - 1], baselineLeftEdge);
    }

    if (sep === '\n\n') {
      blocks.push(makeBlock());
    }

    const currentBlock = blocks[blocks.length - 1];

    if (currentBlock !== undefined) {
      const spans = buildSpansForRange(
        lineInfo.charStart,
        lineInfo.charEnd,
        rawText,
        range.startCharIndex,
        geo,
        baselineWeight,
      );

      const lastLine = currentBlock.lines[currentBlock.lines.length - 1];

      // Soft-wrap: merge into the previous line with a space.
      if (sep === ' ' && lastLine !== undefined) {
        lastLine.text += ` ${text}`;
        mergeSpansWithSpace(lastLine.spans, spans);
        lastLine.rightEdge = lineInfo.rightEdge;
      } else {
        currentBlock.lines.push({
          text,
          spans,
          fontSize: lineInfo.dominantFontSize,
          leftEdge: lineInfo.leftEdge,
          rightEdge: lineInfo.rightEdge,
        });
      }
    }
  }

  return blocks;
};

// ---------------------------------------------------------------------------
// Line separator heuristics
// ---------------------------------------------------------------------------

/**
 * Determine the separator to place after a line:
 *  - Empty line (gap ≥ {@link EMPTY_LINE_GAP_FACTOR}× line height) → `\n\n`
 *  - Full-width wrapping line → ` ` (space)
 *  - Short line → `\n` (explicit line break)
 */
const lineSeparator = (
  gap: number | undefined,
  prevLine: LineInfo,
  nextLine: LineInfo,
  maxRight: number,
): '\n\n' | '\n' | ' ' => {
  if (gap !== undefined) {
    const avgHeight = (prevLine.height + nextLine.height) / 2;

    if (avgHeight > 0 && gap >= avgHeight * EMPTY_LINE_GAP_FACTOR) {
      return '\n\n';
    }
  }

  const isFullWidth = maxRight > 0 && prevLine.rightEdge >= maxRight * FULL_WIDTH_THRESHOLD;

  if (isFullWidth) {
    return ' ';
  }

  return '\n';
};

/**
 * Refine a separator produced by {@link lineSeparator} with additional
 * heuristics for font-size changes and list-item boundaries.
 *
 * Text-based list markers (e.g. "1.", "a)") override even soft-wrap because a
 * marker at the start of a line is unambiguous. Geometry-only detection
 * (indentation) only promotes hard-break lines — a soft-wrapped continuation
 * shares the same indentation as the list item's first line.
 */
const refineSeparator = (
  sep: '\n\n' | '\n' | ' ' | null,
  text: string,
  lineInfo: LineInfo,
  prevLineInfo: LineInfo | undefined,
  baselineLeftEdge: number | undefined,
): '\n\n' | '\n' | ' ' | null => {
  if (sep === '\n\n') {
    return sep;
  }

  if (prevLineInfo !== undefined && hasFontSizeChange(prevLineInfo, lineInfo)) {
    return '\n\n';
  }

  if (detectListMarker(text) !== null) {
    return '\n\n';
  }

  if (sep !== ' ' && isIndentedLine(lineInfo, baselineLeftEdge)) {
    return '\n\n';
  }

  return sep;
};

/**
 * Check whether two adjacent lines have a significant font-size difference,
 * indicating a structural boundary (e.g. heading → body or body → heading).
 */
const hasFontSizeChange = (a: LineInfo, b: LineInfo): boolean => {
  if (a.dominantFontSize === undefined || b.dominantFontSize === undefined) {
    return false;
  }

  const larger = Math.max(a.dominantFontSize, b.dominantFontSize);
  const smaller = Math.min(a.dominantFontSize, b.dominantFontSize);

  if (smaller === 0) {
    return false;
  }

  return larger / smaller >= FONT_SIZE_BREAK_RATIO;
};

// ---------------------------------------------------------------------------
// Text splitting
// ---------------------------------------------------------------------------

/**
 * Split the raw text string into segments corresponding to each geometry line.
 */
const splitTextByGeometry = (rawText: string, range: PageSelectionRange, lines: LineInfo[]): string[] => {
  const selectionStart = range.startCharIndex;
  const textLines: string[] = [];

  for (const line of lines) {
    const start = Math.max(line.charStart - selectionStart, 0);
    const end = Math.min(line.charEnd - selectionStart + 1, rawText.length);

    if (start >= rawText.length || end <= start) {
      textLines.push('');
      continue;
    }

    const segment = rawText.slice(start, end).replace(/^[\r\n]+|[\r\n]+$/g, '');
    textLines.push(segment);
  }

  return textLines;
};
