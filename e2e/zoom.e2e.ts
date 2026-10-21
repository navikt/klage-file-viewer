import {
  focusViewer,
  INITIAL_SCALE,
  SINGLE_PDF_URL,
  VIEWER_SELECTOR,
  waitForContent,
  waitForPdfRendered,
  ZOOM_IN_REGEX,
  ZOOM_OUT_REGEX,
} from '@e2e/helpers';
import { expect, test } from '@playwright/test';
import { DEFAULT_INLINE_WIDTH } from '@/scale/constants';

test.describe('KlageFileViewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForContent(page);
  });

  test.describe('zoom controls', () => {
    test('can zoom in and out using toolbar buttons', async ({ page }) => {
      const zoomInButton = page.locator(VIEWER_SELECTOR).getByRole('button', { name: ZOOM_IN_REGEX });

      // Only run this test if zoom buttons are present
      if ((await zoomInButton.count()) > 0) {
        await expect(zoomInButton).toBeVisible();
        await zoomInButton.click();

        const zoomOutButton = page.locator(VIEWER_SELECTOR).getByRole('button', { name: ZOOM_OUT_REGEX });
        await expect(zoomOutButton).toBeVisible();
        await zoomOutButton.click();
      }
    });
  });

  test.describe('inline resizing', () => {
    for (const followsScale of [false, true]) {
      test(`resizes with width ${followsScale ? 'linked to' : 'independent of'} scale`, async ({ page }) => {
        await page.addInitScript(
          ({ linked, initialWidth }) => {
            localStorage.setItem('klage-file-viewer-dev:standalone', 'false');
            localStorage.setItem('klage-file-viewer/settings/viewer-width', initialWidth.toString(10));
            localStorage.setItem('klage-file-viewer/settings/width-follows-scale', linked ? 'true' : 'false');
            localStorage.setItem('klage-file-viewer/settings/scale-value', '100');
          },
          { linked: followsScale, initialWidth: DEFAULT_INLINE_WIDTH },
        );
        await page.goto(SINGLE_PDF_URL);
        await waitForPdfRendered(page);

        const viewer = page.locator(VIEWER_SELECTOR);
        const handle = viewer.locator('..').locator(':scope > [aria-hidden="true"]');
        const box = await handle.boundingBox();

        if (box === null) {
          throw new Error('Resize handle is not visible');
        }

        const initialWidth = await viewer.evaluate((element) => element.clientWidth);
        const delta = 120;
        const expectedWidth = initialWidth + delta;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + delta, y, { steps: 5 });
        await expect(viewer).toHaveJSProperty('clientWidth', expectedWidth);
        await page.mouse.up();

        await expect(viewer).toHaveJSProperty('clientWidth', expectedWidth);
        const expectedScale = followsScale
          ? Math.round((expectedWidth / DEFAULT_INLINE_WIDTH) * 100).toString(10)
          : INITIAL_SCALE;
        await expect(viewer.getByRole('textbox', { name: 'Skalering i prosent' })).toHaveValue(expectedScale);
      });
    }
  });

  test.describe('keyboard shortcuts', () => {
    test('zooms in with Control+=', async ({ page }) => {
      const viewer = page.locator(VIEWER_SELECTOR);
      const scaleInput = viewer.locator('label', { hasText: '%' }).locator('input');
      await expect(scaleInput).toHaveValue(INITIAL_SCALE);

      await focusViewer(page);
      await page.keyboard.press('Control+=');

      await expect(scaleInput).not.toHaveValue(INITIAL_SCALE);
      const newValue = Number.parseInt(await scaleInput.inputValue(), 10);
      expect(newValue).toBeGreaterThan(Number.parseInt(INITIAL_SCALE, 10));
    });

    test('zooms out with Control+-', async ({ page }) => {
      const viewer = page.locator(VIEWER_SELECTOR);
      const scaleInput = viewer.locator('label', { hasText: '%' }).locator('input');
      await expect(scaleInput).toHaveValue(INITIAL_SCALE);

      await focusViewer(page);
      await page.keyboard.press('Control+-');

      await expect(scaleInput).not.toHaveValue(INITIAL_SCALE);
      const newValue = Number.parseInt(await scaleInput.inputValue(), 10);
      expect(newValue).toBeLessThan(Number.parseInt(INITIAL_SCALE, 10));
    });
  });
});
