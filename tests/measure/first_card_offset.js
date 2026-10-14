/**
 * Measures the vertical offset (px from the top of the page) of the first note card in the
 * side-panel layout (380px wide, getCurrent() stubbed), with a few seeded notes.
 * Usage: node tests/measure/first_card_offset.js
 */
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { buildTestExtension, extensionLaunchOptions, waitForServiceWorker } from '../helpers/test-extension.js';

const USER_DATA_DIR = path.resolve('./tests/.playwright_user_data_measure');
if (fs.existsSync(USER_DATA_DIR)) fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
const context = await chromium.launchPersistentContext(USER_DATA_DIR,
  extensionLaunchOptions(buildTestExtension(), ['--no-first-run']));
try {
  const sw = await waitForServiceWorker(context);
  const url = `chrome-extension://${sw.url().split('/')[2]}/src/app/index.html`;
  const page = await context.newPage();
  await page.addInitScript(() => { chrome.tabs.getCurrent = () => Promise.resolve(undefined); });
  await page.setViewportSize({ width: 380, height: 800 });
  await page.goto(url);
  await page.evaluate(async () => {
    const { saveArchivedTab } = await import('/src/storage/db.js');
    for (const n of [1, 2, 3]) {
      await saveArchivedTab({
        id: `m-${n}`, url: `https://example.com/${n}`, title: `Measure note ${n}`, domain: 'example.com',
        capturedAt: Date.now() - n * 60000, readingTimeMinutes: 4,
        summary: { tldr: 'A short gist.', bullets: ['One takeaway.'], tags: ['a'] }, status: 'archived'
      });
    }
  });
  await page.reload();
  await page.waitForSelector('.tab-card');
  const y = await page.evaluate(() => Math.round(document.querySelector('.tab-card').getBoundingClientRect().top + scrollY));
  console.log(`first-card-offset-px: ${y}`);
} finally {
  await context.close();
  fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
}
