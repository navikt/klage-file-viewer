import { describe, expect, it } from 'bun:test';
import { analyzePageReflow, computeDocumentStats } from '@/files/pdf/selection/copy/analyze-reflow';
import { PAGES_EXPECTED_OUTPUT } from '@/files/pdf/selection/copy/expected-output';
import { blocksToHtml, blocksToPlain } from '@/files/pdf/selection/copy/formatters';
import { PAGES_RAW_DATA, type RawData } from '@/files/pdf/selection/copy/raw-data';
import type { PageSelectionRange, ScreenPageGeometry } from '@/files/pdf/selection/types';

/** Build a ScreenPageGeometry from raw fixture data (runs only, no tight bounds). */
const buildGeo = (raw: RawData): ScreenPageGeometry => ({
  runs: raw.runs.map((r) => ({
    rect: r.rect,
    charStart: r.charStart,
    fontSize: r.fontSize,
    fontWeight: r.fontWeight,
    italic: r.italic,
    fontName: r.fontName,
    glyphs: r.glyphs.map((g) => ({
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      flags: g.flags,
      tightX: undefined,
      tightY: undefined,
      tightWidth: undefined,
      tightHeight: undefined,
    })),
  })),
  pageText: raw.pageText,
  visualToOriginal: undefined,
  pageWidth: raw.pageWidth,
});

/** Build a full-page selection range from raw data. */
const fullPageRange = (raw: (typeof PAGES_RAW_DATA)[number], pageIndex: number): PageSelectionRange => ({
  pageIndex,
  startCharIndex: 0,
  endCharIndex: raw.pageText.length - 1,
});

describe('analyzePageReflow', () => {
  const allGeos = PAGES_RAW_DATA.map(buildGeo);
  const docStats = computeDocumentStats(allGeos);

  for (let pageIndex = 0; pageIndex < PAGES_RAW_DATA.length; pageIndex++) {
    const raw = PAGES_RAW_DATA[pageIndex];
    const expected = PAGES_EXPECTED_OUTPUT[pageIndex];

    if (raw === undefined || expected === undefined) {
      continue;
    }

    describe(`page ${pageIndex + 1}`, () => {
      const geo = buildGeo(raw);
      const range = fullPageRange(raw, pageIndex);
      const rawText = raw.pageText.slice(range.startCharIndex, range.endCharIndex + 1);
      const blocks = analyzePageReflow(rawText, range, geo, docStats);

      it('produces the expected number of blocks', () => {
        expect(blocks.length).toBe(expected.length);
      });

      for (let i = 0; i < expected.length; i++) {
        const expectedBlock = expected[i];

        if (expectedBlock === undefined) {
          continue;
        }

        describe(`block ${i + 1}: ${expectedBlock.role}`, () => {
          it('has the correct role', () => {
            expect(blocks[i]?.role).toBe(expectedBlock.role);
          });

          it('has the correct alignment', () => {
            expect(blocks[i]?.alignment).toBe(expectedBlock.alignment);
          });

          if (expectedBlock.headingLevel !== undefined) {
            it('has the correct heading level', () => {
              expect(blocks[i]?.headingLevel).toBe(expectedBlock.headingLevel);
            });
          }

          if (expectedBlock.listKind !== undefined) {
            it('has the correct list kind', () => {
              expect(blocks[i]?.listKind).toBe(expectedBlock.listKind);
            });
          }

          it('has the expected number of lines', () => {
            expect(blocks[i]?.lines.length).toBe(expectedBlock.lines.length);
          });

          it('has matching line content', () => {
            expect(blocks[i]?.lines).toEqual(expectedBlock.lines);
          });
        });
      }
    });
  }

  describe('formatters', () => {
    for (let pageIndex = 0; pageIndex < PAGES_RAW_DATA.length; pageIndex++) {
      const raw = PAGES_RAW_DATA[pageIndex];

      if (raw === undefined) {
        continue;
      }

      const geo = buildGeo(raw);
      const range = fullPageRange(raw, pageIndex);
      const rawText = raw.pageText.slice(range.startCharIndex, range.endCharIndex + 1);
      const blocks = analyzePageReflow(rawText, range, geo, docStats);

      it(`page ${pageIndex + 1}: blocksToPlain produces non-empty output`, () => {
        const plain = blocksToPlain(blocks);
        expect(plain.length).toBeGreaterThan(0);
      });

      it(`page ${pageIndex + 1}: blocksToHtml produces valid-looking HTML`, () => {
        const html = blocksToHtml(blocks);
        expect(html.length).toBeGreaterThan(0);
        expect(html).toContain('<');
        expect(html).not.toContain('undefined');
      });
    }
  });
});
