import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console error', m.text()); });
// Seed a save that was last seen 3 hours ago with a farm, so the welcome-back screen shows.
await page.addInitScript(() => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  const now = Date.now();
  const s = { version: 1, res: { food: 400, wood: 300, stone: 50, gold: 260 }, earned: { food: 0, wood: 0, stone: 0, gold: 0 }, collected: { food: 0, wood: 0, stone: 0, gold: 0 },
    buildings: [
      { id: 1, type: 'castle', plot: -2, level: 2, pending: { food: 0, wood: 0, stone: 0, gold: 0 }, upgradeEnd: 0, upgradeStart: 0 },
      { id: 2, type: 'walls', plot: -1, level: 0, pending: { food: 0, wood: 0, stone: 0, gold: 0 }, upgradeEnd: 0, upgradeStart: 0 },
      { id: 3, type: 'farm', plot: 0, level: 3, pending: { food: 12, wood: 0, stone: 0, gold: 0 }, upgradeEnd: 0, upgradeStart: 0 },
      { id: 4, type: 'lumber', plot: 1, level: 2, pending: { food: 0, wood: 5, stone: 0, gold: 0 }, upgradeEnd: 0, upgradeStart: 0 },
      { id: 5, type: 'house', plot: 2, level: 1, pending: { food: 0, wood: 0, stone: 0, gold: 0 }, upgradeEnd: now + 60000, upgradeStart: now - 20000 },
    ],
    regions: [0], heroes: { mira: 1 }, newHeroes: ['mira'], quest: { index: 3, base: { food: 0, wood: 0, stone: 0, gold: 0 } }, era: 0, stars: 0, boostEnd: 0,
    lastSeen: now - 3 * 3600 * 1000, createdAt: now, nextId: 6, settings: { sfx: true, music: true, lang: 'auto', quality: 'auto' }, stats: { taps: 0, upgrades: 0, adsWatched: 0 } };
  localStorage.setItem('idle-kingdom-save-v1', JSON.stringify(s));
});
await page.goto('http://localhost:4173/');
await page.waitForFunction(() => window.__IK?.ready, null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/u-welcome.png` });
await page.locator('[data-action="offline1"]').click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/u-main.png` });
const shots = [
  ['plot', async () => { await page.evaluate(() => window.__IK.focusPlot(4)); await page.waitForTimeout(400); const p = await page.evaluate(() => window.__IK.plotScreen(4)); await page.mouse.click(p.x, p.y); }],
  ['farm', async () => { await page.evaluate(() => window.__IK.focusPlot(0)); await page.waitForTimeout(400); const p = await page.evaluate(() => window.__IK.plotScreen(0)); await page.mouse.click(p.x, p.y - 10); await page.waitForTimeout(300); const p2 = await page.evaluate(() => window.__IK.plotScreen(0)); await page.mouse.click(p2.x, p2.y - 10); }],
  ['house', async () => { await page.evaluate(() => window.__IK.focusPlot(2)); await page.waitForTimeout(400); const p = await page.evaluate(() => window.__IK.plotScreen(2)); await page.mouse.click(p.x, p.y - 10); }],
  ['heroes', async () => { await page.locator('[data-nav="heroes"]').click(); }],
  ['quests', async () => { await page.locator('[data-nav="quests"]').click(); }],
  ['options', async () => { await page.locator('[data-nav="options"]').click(); }],
  ['kingdom', async () => { await page.locator('[data-nav="kingdom"]').click(); }],
];
for (const [name, fn] of shots) {
  await page.locator('.sheet-backdrop').evaluate((el) => el.click()).catch(() => {});
  await page.waitForTimeout(300);
  await fn();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/u-${name}.png` });
}
await browser.close();
