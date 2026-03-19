import { describe, expect, it } from 'bun:test';
import { analyzePageReflow } from '@/files/pdf/selection/copy/analyze-reflow';
import { PAGES_EXPECTED_OUTPUT } from '@/files/pdf/selection/copy/expected-output';
import { paragraphsToHtml, paragraphsToPlain } from '@/files/pdf/selection/copy/formatters';
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
});

/** Build a full-page selection range from raw data. */
const fullPageRange = (raw: (typeof PAGES_RAW_DATA)[number], pageIndex: number): PageSelectionRange => ({
  pageIndex,
  startCharIndex: 0,
  endCharIndex: raw.pageText.length - 1,
});

describe('analyzePageReflow', () => {
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
      const paragraphs = analyzePageReflow(rawText, range, geo);

      it('produces the expected number of paragraphs', () => {
        expect(paragraphs.length).toBe(expected.length);
      });

      for (let i = 0; i < expected.length; i++) {
        const expectedParagraph = expected[i];

        if (expectedParagraph === undefined) {
          continue;
        }

        describe(`paragraph ${String(i + 1)}: ${expectedParagraph.role}`, () => {
          it('has the correct role', () => {
            expect(paragraphs[i]?.role).toBe(expectedParagraph.role);
          });

          it('has the correct alignment', () => {
            expect(paragraphs[i]?.alignment).toBe(expectedParagraph.alignment);
          });

          if (expectedParagraph.headingLevel !== undefined) {
            it('has the correct heading level', () => {
              expect(paragraphs[i]?.headingLevel).toBe(expectedParagraph.headingLevel);
            });
          }

          if (expectedParagraph.listKind !== undefined) {
            it('has the correct list kind', () => {
              expect(paragraphs[i]?.listKind).toBe(expectedParagraph.listKind);
            });
          }

          it('has the expected number of lines', () => {
            expect(paragraphs[i]?.lines.length).toBe(expectedParagraph.lines.length);
          });

          it('has matching line content', () => {
            expect(paragraphs[i]?.lines).toEqual(expectedParagraph.lines);
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
      const paragraphs = analyzePageReflow(rawText, range, geo);

      it(`page ${pageIndex + 1}: paragraphsToPlain produces non-empty output`, () => {
        const plain = paragraphsToPlain(paragraphs);
        expect(plain.length).toBeGreaterThan(0);
      });

      it(`page ${pageIndex + 1}: paragraphsToHtml produces valid-looking HTML`, () => {
        const html = paragraphsToHtml(paragraphs);
        expect(html.length).toBeGreaterThan(0);
        expect(html).toContain('<');
        expect(html).not.toContain('undefined');
      });
    }
  });
});
