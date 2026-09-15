import type { ScreenPageGeometry, ScreenRun, ScreenRunGlyph } from '@/files/pdf/selection/types';
import { isOriginGhostRun } from '@/files/pdf/selection/types';

const CR = '\r';
const LF = '\n';

/**
 * Repair a PDFium quirk where a soft line break (Shift+Enter) immediately
 * after a hyphen produces "ghost" runs at `(0, 0)` carrying the first
 * character of each subsequent visible line, while the visible run starts
 * from the second character.
 *
 * In the wild this manifests on `Soft-break.pdf`: PDFium emits the page
 * geometry as
 *
 * ```
 * run 0..5 (y=0): "\r\n" pairs (leading blank lines)
 * run 6   (y=0): "\ni"      ← orphan first char of line 28
 * run 7   (y=0): "\nf"      ← orphan first char of line 29
 * run 8   (y=0): "\nD"      ← orphan first char of line 30
 * ...
 * run 27  (y=320): "...kopiering. Det\r"   ← ends with bare CR (soft break)
 * run 28  (y=342): "nkluderer..."           ← starts mid-word
 * run 29  (y=365): "orrige..."              ← starts mid-word
 * ...
 * ```
 *
 * Without repair, `analyzePageReflow` produces text like `"...Det"` /
 * `"nkluderer..."` instead of `"...Det\ninkluderer..."`. Selecting and
 * copying drops the first character of every soft-broken line.
 *
 * Repair strategy:
 *  1. Identify "carrier ghost" runs (zero rect + a single visible char
 *     preceded by a synthetic newline glyph).
 *  2. Identify "broken body" runs (visible runs whose immediately preceding
 *     visible run ends with a bare `\r`).
 *  3. Pair carriers and broken bodies in document order. If counts don't
 *     match, leave the geometry untouched (defensive: the heuristic has
 *     misfired and we don't want to corrupt good output).
 *  4. For each pair, prepend the carrier's character (and a synthesised
 *     glyph) to the broken body run, then drop the carrier and rebuild
 *     `pageText` with sequential `charStart` values.
 */
export const repairSoftBreakGeometry = (geometry: ScreenPageGeometry): ScreenPageGeometry => {
  if (geometry.pageText === undefined || geometry.runs.length === 0) {
    return geometry;
  }

  const { carriers, brokenBodyIndexes } = scanRuns(geometry.runs, geometry.pageText);

  // Defensive: if the counts don't match, the heuristic has misfired and
  // splicing chars in the wrong place would be worse than leaving the bug.
  if (carriers.length === 0 || carriers.length !== brokenBodyIndexes.length) {
    return geometry;
  }

  return rebuildGeometry(geometry, carriers, brokenBodyIndexes);
};

interface CarrierGhost {
  runIndex: number;
  char: string;
}

interface ScanResult {
  carriers: CarrierGhost[];
  brokenBodyIndexes: number[];
}

/** Walk the runs once, classifying carrier ghosts and broken-body successors. */
const scanRuns = (runs: ScreenRun[], pageText: string): ScanResult => {
  const carriers: CarrierGhost[] = [];
  const brokenBodyIndexes: number[] = [];

  let lastVisibleEndsWithCr = false;

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];

    if (run === undefined) {
      continue;
    }

    const carrier = tryReadCarrier(run, pageText);

    if (carrier !== null) {
      carriers.push({ runIndex: i, char: carrier.char });
      // Carrier ghosts shouldn't reset the "previous visible ends with CR"
      // flag — they don't appear visually between two body lines.
      continue;
    }

    if (isVisibleRun(run)) {
      if (lastVisibleEndsWithCr) {
        brokenBodyIndexes.push(i);
      }

      lastVisibleEndsWithCr = endsWithBareCr(run, pageText);
    }
  }

  return { carriers, brokenBodyIndexes };
};

/**
 * Rebuild the geometry: drop carrier ghosts, splice their characters into
 * the matching broken body runs, and reissue sequential `charStart` values
 * with a coherent `pageText`.
 */
const rebuildGeometry = (
  geometry: ScreenPageGeometry,
  carriers: CarrierGhost[],
  brokenBodyIndexes: number[],
): ScreenPageGeometry => {
  const pageText = geometry.pageText ?? '';
  const carrierRunIndexes = new Set(carriers.map((c) => c.runIndex));
  const carrierByBodyIndex = new Map<number, CarrierGhost>();

  for (let i = 0; i < brokenBodyIndexes.length; i++) {
    const bodyIndex = brokenBodyIndexes[i];
    const carrier = carriers[i];

    if (bodyIndex !== undefined && carrier !== undefined) {
      carrierByBodyIndex.set(bodyIndex, carrier);
    }
  }

  const newRuns: ScreenRun[] = [];
  const newPageTextParts: string[] = [];
  let nextCharStart = 0;

  for (let i = 0; i < geometry.runs.length; i++) {
    const run = geometry.runs[i];

    if (run === undefined || carrierRunIndexes.has(i)) {
      continue;
    }

    // Copy the run's glyph characters plus any trailing gap (line-break chars
    // that are not glyphs) up to the next run, so line separators survive the
    // rebuild. Runs are in char order, so the next run's start bounds the gap.
    const ownedEnd = geometry.runs[i + 1]?.charStart ?? pageText.length;
    const runText = pageText.slice(run.charStart, ownedEnd);
    const carrier = carrierByBodyIndex.get(i);

    if (carrier === undefined) {
      newRuns.push({ ...run, charStart: nextCharStart });
      newPageTextParts.push(runText);
      nextCharStart += runText.length;
      continue;
    }

    const repairedGlyphs = [synthesiseLeadingGlyph(run), ...run.glyphs];

    newRuns.push({ ...run, charStart: nextCharStart, glyphs: repairedGlyphs });
    newPageTextParts.push(carrier.char + runText);
    nextCharStart += 1 + runText.length;
  }

  return {
    ...geometry,
    runs: newRuns,
    pageText: newPageTextParts.join(''),
  };
};

/**
 * Build a zero-width placeholder glyph positioned at the body run's left
 * edge. Used when splicing a recovered character onto the front of a line.
 */
const synthesiseLeadingGlyph = (run: ScreenRun): ScreenRunGlyph => {
  const firstGlyph = run.glyphs[0];

  return {
    x: run.rect.x,
    y: firstGlyph?.y ?? run.rect.y,
    width: 0,
    height: firstGlyph?.height ?? run.rect.height,
    flags: 0,
    tightX: undefined,
    tightY: undefined,
    tightWidth: undefined,
    tightHeight: undefined,
  };
};

/**
 * A "carrier ghost" is a zero-size run at the top of the page (y === 0)
 * whose `pageText` slice is `\n<single visible char>`. The leading `\n` is
 * a PDFium-inserted line-break marker; the second char is the real first
 * character of a soft-broken line further down the page.
 *
 * Returns the carried character, or `null` if the run isn't a carrier.
 */
const tryReadCarrier = (run: ScreenRun, pageText: string): { char: string } | null => {
  if (!isOriginGhostRun(run) || run.glyphs.length !== 2) {
    return null;
  }

  // The slice must be a newline marker followed by a single visible char.
  const text = pageText.slice(run.charStart, run.charStart + 2);

  if (text.length !== 2 || text.charAt(0) !== LF) {
    return null;
  }

  const second = text.charAt(1);

  // The second char must be a visible character (not another newline).
  if (second === CR || second === LF || second === '') {
    return null;
  }

  return { char: second };
};

/**
 * Pure blank-line ghosts (e.g. `\r\n` pairs at the top of a page) are also
 * zero-size, but `tryReadCarrier` rejects them because their second char is
 * `\n`. They are silently dropped from the "visible run" list so they don't
 * interfere with the `\r`-terminated detection between consecutive body
 * lines.
 */
const isVisibleRun = (run: ScreenRun): boolean => !isOriginGhostRun(run);

/**
 * Check whether a run ends with a bare `\r` (not followed by `\n`), which
 * PDFium emits as a soft line-break marker between a soft-broken line and
 * its continuation. In the captured PDFium output these carriage returns
 * report `flags === 0`, so the trailing character itself is the only
 * available signal.
 */
const endsWithBareCr = (run: ScreenRun, pageText: string): boolean => {
  const lastCharIndex = run.charStart + run.glyphs.length - 1;
  const last = pageText.charAt(lastCharIndex);
  const next = pageText.charAt(lastCharIndex + 1);

  return last === CR && next !== LF;
};
