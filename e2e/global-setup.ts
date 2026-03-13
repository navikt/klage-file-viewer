import { chromium } from '@playwright/test';

const globalSetup = async () => {
  const browser = await chromium.launch();
  const version = browser.version();
  await browser.close();

  console.info(`\nChromium version: ${version}\n`);
};

export default globalSetup;
