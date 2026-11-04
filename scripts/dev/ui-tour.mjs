import { chromium } from 'playwright';
const out = process.argv[2];
const only = process.argv[3];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console error', m.text()); });
await page.goto('http://localhost:4173/?e2e=1');
await page.waitForFunction(() => window.__IK?.ready && window.__IK.charsReady, null, { timeout: 120000 });
await page.waitForTimeout(800);
const shot = async (name) => { if (!only || only.includes(name)) await page.screenshot({ path: `${out}/t-${name}.png` }); };
const close = async () => { await page.evaluate(() => document.querySelector('.sheet-backdrop')?.click()); await page.waitForTimeout(350); };
// 1. field sheet
await page.locator('#goal [data-action="goalGo"]').click();
await page.waitForTimeout(700); await shot('field');
await page.locator('[data-recipe="wheat"]').click({ force: true });
await page.waitForTimeout(300); await close();
await page.evaluate(() => window.__IK.fastForward(25)); await page.waitForTimeout(600); await shot('ready');
// collect via bubble
const bub = page.locator('[data-bubble^="ready:"]').first(); await bub.click({ force: true }); await page.waitForTimeout(1500);
// 2. bakery
await page.locator('#goal [data-action="goalGo"]').click(); await page.waitForTimeout(700);
await page.locator('[data-recipe="flour"]').click({ force: true }); await page.waitForTimeout(300); await shot('bakery'); await close();
// 3. orders
await page.locator("#nav [data-nav=\"orders\"]").click(); await page.waitForTimeout(500); await shot('orders'); await close();
// 4. barn, heroes, market, shop, tasks, event
for (const [nav, name] of [['barn', 'barn'], ['heroes', 'heroes'], ['market', 'market'], ['shop', 'shop']]) { await page.locator(`#nav [data-nav="${nav}"]`).click(); await page.waitForTimeout(500); await shot(name); await close(); }
for (const a of ['tasks', 'event']) { await page.locator(`.side [data-action="${a}"]`).click(); await page.waitForTimeout(500); await shot(a); await close(); }
// 5. build menu
await page.evaluate(() => window.__IK.focusPlot(7)); await page.waitForTimeout(500);
const p = await page.evaluate(() => window.__IK.plotScreen(7)); await page.mouse.click(p.x, p.y); await page.waitForTimeout(600); await shot('build'); await close();
// 6. battle
await page.evaluate(() => { const s = window.__IK; s.cheat(2); s.startCamp(1); });
await page.waitForTimeout(2500); await shot('battle'); await page.waitForTimeout(1500); await shot('battle2');
await page.waitForFunction(() => !window.__IK.battleActive, null, { timeout: 90000 }); await page.waitForTimeout(800); await shot('victory');
await page.locator('[data-action="modal-ok"]').click(); await page.waitForTimeout(500);
await page.evaluate(() => window.__IK.raid()); await page.waitForTimeout(3000); await shot('raid');
await browser.close();
