/**
 * Throwaway: screenshots the notebook (narrow 380 / wide 1280, light / dark) with Closed today,
 * starred, reopened, sleeping and long-title notes, plus the reader dialog after starring.
 * Usage: node tests/measure/polish_shots.js <outDir>
 */
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { buildTestExtension, extensionLaunchOptions, waitForServiceWorker } from '../helpers/test-extension.js';

const OUT = path.resolve(process.argv[2] || './shots');
fs.mkdirSync(OUT, { recursive: true });
const USER_DATA_DIR = path.resolve('./tests/.playwright_user_data_shots');
if (fs.existsSync(USER_DATA_DIR)) fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
const context = await chromium.launchPersistentContext(USER_DATA_DIR,
  extensionLaunchOptions(buildTestExtension(), ['--no-first-run']));
try {
  const sw = await waitForServiceWorker(context);
  const url = `chrome-extension://${sw.url().split('/')[2]}/src/app/index.html`;
  const seedPage = await context.newPage();
  await seedPage.goto(url);
  await seedPage.evaluate(async () => {
    const { saveArchivedTab } = await import('/src/storage/db.js');
    const now = Date.now();
    const base = (n, extra) => ({
      id: `s-${n}`, url: `https://example${n % 3}.com/post/${n}`, domain: `example${n % 3}.com`,
      capturedAt: now - n * 3600000, readingTimeMinutes: 3 + n,
      summary: { tldr: 'A concise gist of what the page argued and why it mattered.', bullets: ['First takeaway from the page.', 'Second takeaway, a little longer to wrap onto a second line.'], tags: ['design', 'reading'] },
      ...extra
    });
    const rows = [
      base(1, { title: 'Why quiet interfaces earn trust', status: 'archived', closedAt: now - 20 * 60000, closureTier: 'safe_to_close' }),
      base(2, { title: 'A very long article title that keeps going to check how wrapping behaves in the narrow side panel layout', status: 'archived', closedAt: now - 50 * 60000, closureTier: 'suspend_only', closureReason: 'Closed after sleeping' }),
      base(3, { title: 'Trusted domain note', status: 'archived', closedAt: now - 90 * 60000, closureReason: 'Closed: trusted domain' }),
      base(4, { title: 'Starred reference on typography', status: 'archived', isFavorite: true }),
      base(5, { title: 'Reopened yesterday', status: 'restored', restoredAt: now - 86400000 }),
      base(6, { title: 'Sleeping tab, still open', status: 'discarded' }),
      base(7, { title: 'Old note close to fading', status: 'archived', capturedAt: now - 28 * 86400000 })
    ];
    for (const r of rows) await saveArchivedTab(r);
  });
  await seedPage.close();

  for (const scheme of ['light', 'dark']) {
    for (const [name, width, panel] of [['narrow', 380, true], ['wide', 1280, false]]) {
      const page = await context.newPage();
      await page.emulateMedia({ colorScheme: scheme });
      if (panel) await page.addInitScript(() => { chrome.tabs.getCurrent = () => Promise.resolve(undefined); });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      await page.waitForTimeout(800);
      console.log('seen before reset:', JSON.stringify(await page.evaluate(() => chrome.storage.local.get('closed_today_seen'))));
      await page.evaluate(() => chrome.storage.local.remove('closed_today_seen'));
      await page.reload();
      await page.waitForSelector('.tab-card');
      await page.waitForTimeout(400);
      console.log(name, scheme, 'Closed today expanded on load:', await page.getAttribute('#closed-today-toggle', 'aria-expanded'));
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${OUT}/${name}-${scheme}.png`, fullPage: true });
      if (scheme === 'light') {
        await page.locator('.tab-card .reader-btn').first().click();
        await page.waitForTimeout(400);
        await page.locator('#modal-star-btn').click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT}/${name}-reader.png` });
      }
      await page.close();
    }
  }
  console.log('shots in', OUT);
} finally {
  await context.close();
  fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
}
