import { expect, test, type Page } from '@playwright/test';

interface IK {
  ready: boolean;
  frames: number;
  state(): { res: Record<string, number>; buildings: { id: number; type: string; level: number; plot: number; pending: Record<string, number> }[] };
  drawCalls(): number;
  samplePixels(): number;
  plotScreen(plot: number): { x: number; y: number; visible: boolean };
  focusPlot(plot: number): void;
}
declare global { interface Window { __IK: IK } }

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('opens, renders WebGL, builds a farm and collects food', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => window.__IK?.ready === true, null, { timeout: 90_000 });
  await page.waitForFunction(() => window.__IK.frames > 5);

  // WebGL really renders: draw calls and a varied picture.
  expect(await page.evaluate(() => window.__IK.drawCalls())).toBeGreaterThan(10);
  expect(await page.evaluate(() => window.__IK.samplePixels())).toBeGreaterThan(4);

  // UI overlay is there at 390px.
  await expect(page.locator('.resbar .res')).toHaveCount(4);
  await expect(page.locator('#quest')).toContainText(/Farm|Ferme/);
  await expect(page.locator('#nav button')).toHaveCount(4);

  // Tap an empty plot in the 3D scene -> build sheet.
  await page.evaluate(() => window.__IK.focusPlot(0));
  await page.waitForTimeout(300);
  const pt = await page.evaluate(() => window.__IK.plotScreen(0));
  expect(pt.visible).toBe(true);
  await page.mouse.click(pt.x, pt.y);
  const farmCard = page.locator('[data-build="farm"]');
  await expect(farmCard).toBeVisible();
  const woodBefore = await page.evaluate(() => window.__IK.state().res.wood);
  await farmCard.click();
  await expect.poll(() => page.evaluate(() => window.__IK.state().res.wood)).toBeLessThan(woodBefore);

  // Construction finishes (short timer) and the farm produces.
  await expect.poll(() => page.evaluate(() => window.__IK.state().buildings.find((b) => b.type === 'farm')?.level ?? 0), { timeout: 30_000 }).toBe(1);
  const farmId = await page.evaluate(() => window.__IK.state().buildings.find((b) => b.type === 'farm')!.id);
  const label = page.locator(`.lbl.collect[data-label="building:${farmId}"]`);
  await expect(label).toBeVisible({ timeout: 30_000 });
  const foodBefore = await page.evaluate(() => window.__IK.state().res.food);
  // Labels gently float (CSS animation), so skip Playwright's stability wait.
  await label.click({ force: true });
  await expect.poll(() => page.evaluate(() => window.__IK.state().res.food)).toBeGreaterThan(foodBefore);

  // Quest progressed: building the farm completes the first goal.
  await expect(page.locator('#quest [data-action="claim"]')).toBeVisible();
  await page.locator('#quest [data-action="claim"]').click({ force: true }); // the done card gently pulses
  await expect(page.locator('#quest')).not.toContainText(/Build Farm/);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('bottom navigation opens heroes, quests and options sheets', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => window.__IK?.ready === true, null, { timeout: 90_000 });
  for (const tab of ['heroes', 'quests', 'options']) {
    await page.locator(`[data-nav="${tab}"]`).click();
    await expect(page.locator('#sheet-body h2')).toBeVisible();
  }
  await page.locator('[data-action="setting"][data-arg="lang=fr"]').click();
  await expect(page.locator('[data-nav="options"] span[data-i18n]')).toHaveText('Options');
  await expect(page.locator('[data-nav="heroes"] span[data-i18n]')).toHaveText('Héros');
  expect(errors, errors.join('\n')).toEqual([]);
});

test.describe('French phone', () => {
  test.use({ locale: 'fr-FR' });
  test('auto-detects French from the browser', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/?e2e=1');
    await page.waitForFunction(() => window.__IK?.ready === true, null, { timeout: 90_000 });
    await expect(page.locator('[data-nav="kingdom"] span[data-i18n]')).toHaveText('Royaume');
    await expect(page.locator('#quest')).toContainText('Ferme');
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
