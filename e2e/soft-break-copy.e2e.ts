import { dragAcrossPage, getCopyTarget, waitForPdfRendered } from '@e2e/helpers';
import { expect, test } from '@playwright/test';

// Broken variants — what copying produces if the selection drops the
// relocated leading character of a soft-broken line
// ("teksten" → "eksten", "den" → "en", "Denne" → "enne", …).
const EKSTEN_ALONE = /\beksten av PDFium\b/;
const EN_TOLKER_ALONE = /\ben tolker det\b/;
const OMPENSERER_ALONE = /\bompenserer ikke\b/;
const VSNITT_ALONE = /\bvsnitt senere\b/;
const ENNE_LINJEN_ALONE = /\benne linjen\b/;

// The whole page, from inside the top-left corner (which the rotate button
// covers) to inside the bottom-right one.
const SELECTION = { startX: 0.1, startY: 0.1, endX: 0.9, endY: 0.9 };

/**
 * Regression test for the hyphen-soft-break copy bug.
 *
 * `Soft-break.pdf` contains lines where PDFium renders the first character
 * in a "ghost" glyph at `(0, 0)` whenever a soft line break (Shift+Enter)
 * follows a hyphen. The glyph is displaced, but PDFium's text page keeps the
 * character at its correct logical index, so copying the selected char range
 * verbatim (via `engine.getTextSlices`) preserves the whole word.
 *
 * This test drives an actual mouse drag across the page so it exercises the
 * full pipeline: selection overlay → `useCopyHandler` → hidden copy target.
 */
test.describe('soft-break copy', () => {
  test('preserves first character of every soft-broken line', async ({ page }) => {
    test.setTimeout(30_000);

    await page.goto('/?files=file%3ASoft-break.pdf');
    await waitForPdfRendered(page);

    await expect.poll(async () => dragAcrossPage(page, SELECTION), { timeout: 10_000 }).not.toBe('');

    // Raw clipboard text, preserving the reflowed line/paragraph structure.
    const rawCopied = await getCopyTarget(page).evaluate((el) => el.textContent ?? '');

    // Whitespace-normalised view for the character-preservation checks, which
    // don't care about exact line wrapping.
    const copiedText = rawCopied.replace(/\s+/g, ' ');

    // Each of these begins a soft-broken line whose leading character PDFium
    // renders in a displaced "ghost" glyph at (0, 0). Copying the raw text for
    // the selected char range keeps the character (PDFium's text page indexes
    // it correctly); a regression would produce "eksten", "en tolker",
    // "ompenserer", "vsnitt", "enne linjen".
    expect(copiedText).toContain('normal flyt for teksten av PDFium');
    expect(copiedText).toContain('av PDFium fordi den tolker det');
    expect(copiedText).toContain('lite plass. PDFium kompenserer ikke for');
    expect(copiedText).toContain('følgefeil. Avsnitt senere i dokumentet');
    expect(copiedText).toContain('Denne linjen er etter tvungen linjeskift');
    expect(copiedText).toContain('linjeskift. Denne linjen også');

    // "a-ordningen" is split at the hyphen by a soft break, so PDFium strips
    // the dash and merges the fragments. The dash is unrecoverable, so the
    // copy holds the de-hyphenated join ("aordningen"), not the visual source.
    expect(copiedText).toContain('Her er ordet: aordningen');
    expect(copiedText).not.toContain('a-ordningen');

    // Defensive: none of the broken variants should appear at a word
    // boundary. (`eksten` is a substring of `teksten`, so we anchor the
    // negative checks with `\b`.)
    expect(copiedText).not.toMatch(EKSTEN_ALONE);
    expect(copiedText).not.toMatch(EN_TOLKER_ALONE);
    expect(copiedText).not.toMatch(OMPENSERER_ALONE);
    expect(copiedText).not.toMatch(VSNITT_ALONE);
    expect(copiedText).not.toMatch(ENNE_LINJEN_ALONE);

    // Headers must remain intact and not be split mid-word
    // (`Fødselsn ummer:`, `Klager :`, `Sa ksnummer:`).
    expect(copiedText).toContain('Fødselsnummer: 148288 97927');
    expect(copiedText).toContain('Klager: FORDEKT MATVARE');
    expect(copiedText).toContain('Fullmektig: FORDEKT MATVARE');
    expect(copiedText).toContain('Saksnummer: 9570');
    expect(copiedText).toContain('FATTET ØRN MUSKEL');

    // Reflow: soft-wrapped lines rejoin into a single paragraph with spaces
    // (the next word would not have fit on the previous line), so the body
    // paragraph is continuous prose rather than per-line breaks.
    expect(rawCopied).toContain('utenfor normal flyt for teksten av PDFium. Det inkluderer');
    expect(rawCopied).toContain('blir fjernet av PDFium fordi den tolker det');
    expect(rawCopied).toContain('lite plass. PDFium kompenserer ikke for tegnet');
    expect(rawCopied).not.toContain('flyt for\nteksten');

    // Reflow: intentional (short) line breaks are preserved, and a paragraph
    // gap becomes a blank line.
    expect(rawCopied).toContain('følgefeil.\n\nAvsnitt senere');
    expect(rawCopied).toContain('tvungen linjeskift.\nDenne linjen også');
  });
});
