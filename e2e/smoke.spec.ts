import { expect, test, type Page } from '@playwright/test';

interface IK {
  ready: boolean;
  frames: number;
  charsReady: boolean;
  battleActive: boolean;
  state(): { gold: number; items: Record<string, number>; buildings: { id: number; type: string; plot: number; buildEnd: number; jobs: unknown[]; ready: string[] }[]; regions: number[] };
  drawCalls(): number;
  samplePixels(): number;
  plotScreen(plot: number): { x: number; y: number; visible: boolean };
  focusPlot(plot: number): void;
  fastForward(sec: number): void;
  cheat(level: number): void;
  startCamp(region: number): { ok: boolean };
}
declare global { interface Window { __IK: IK } }

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function boot(page: Page): Promise<void> {
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => window.__IK?.ready === true, null, { timeout: 90_000 });
  await page.waitForFunction(() => window.__IK.frames > 5);
}

test('renders WebGL, builds a field, plants and harvests wheat into the barn', async ({ page }) => {
  const errors = watchErrors(page);
  await boot(page);
  expect(await page.evaluate(() => window.__IK.drawCalls())).toBeGreaterThan(10);
  expect(await page.evaluate(() => window.__IK.samplePixels())).toBeGreaterThan(4);
  await expect(page.locator('.hud .pill')).toHaveCount(3);
  await expect(page.locator('#nav button')).toHaveCount(5);
  await expect(page.locator('#goal')).toContainText(/wheat|blé/i);

  // Tap an empty plot in the 3D scene -> build a new field.
  const plot = await page.evaluate(() => { const used = new Set(window.__IK.state().buildings.map((b) => b.plot)); let p = 0; while (used.has(p)) p++; return p; });
  await page.evaluate((p) => window.__IK.focusPlot(p), plot);
  await page.waitForTimeout(300);
  const pt = await page.evaluate((p) => window.__IK.plotScreen(p), plot);
  expect(pt.visible).toBe(true);
  await page.mouse.click(pt.x, pt.y);
  const card = page.locator('[data-build="field"]');
  await expect(card).toBeVisible();
  const gold = await page.evaluate(() => window.__IK.state().gold);
  await card.click();
  await expect.poll(() => page.evaluate(() => window.__IK.state().gold)).toBeLessThan(gold);
  await page.evaluate(() => window.__IK.fastForward(30));
  const fieldId = await page.evaluate((p) => window.__IK.state().buildings.find((b) => b.plot === p)!.id, plot);
  await expect.poll(() => page.evaluate((id) => window.__IK.state().buildings.find((b) => b.id === id)!.buildEnd, fieldId)).toBe(0);

  // Plant wheat in the new field via its panel.
  await page.locator(`[data-bubble="open:${fieldId}"]`).click({ force: true });
  await page.locator('[data-recipe="wheat"]').click();
  await expect.poll(() => page.evaluate((id) => window.__IK.state().buildings.find((b) => b.id === id)!.jobs.length, fieldId)).toBe(1);
  await page.locator('.sheet-backdrop').click({ position: { x: 20, y: 20 }, force: true });

  // Grow, then tap the speech bubble to harvest into the barn.
  await page.evaluate(() => window.__IK.fastForward(30));
  const bubble = page.locator(`[data-bubble="ready:${fieldId}"]`);
  await expect(bubble).toBeVisible({ timeout: 20_000 });
  const wheat = await page.evaluate(() => window.__IK.state().items.wheat ?? 0);
  await bubble.click({ force: true }); // bubbles gently float
  await expect.poll(() => page.evaluate(() => window.__IK.state().items.wheat ?? 0)).toBe(wheat + 2);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('first battle: animated heroes beat the skeleton camp and discover land', async ({ page }) => {
  const errors = watchErrors(page);
  await boot(page);
  await page.waitForFunction(() => window.__IK.charsReady, null, { timeout: 90_000 });
  await page.evaluate(() => window.__IK.cheat(2));
  expect(await page.evaluate(() => window.__IK.startCamp(1).ok)).toBe(true);
  await expect(page.locator('#battle .skill')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__IK.battleActive), { timeout: 90_000 }).toBe(false);
  await expect(page.locator('.modal-card')).toBeVisible();
  expect(await page.evaluate(() => window.__IK.state().regions)).toContain(1);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('panels open from the bottom navigation', async ({ page }) => {
  const errors = watchErrors(page);
  await boot(page);
  for (const tab of ['barn', 'orders', 'heroes', 'market', 'shop']) {
    await page.locator(`#nav [data-nav="${tab}"]`).click();
    await expect(page.locator('#sheet-body h2').first()).toBeVisible();
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

test.describe('French phone', () => {
  test.use({ locale: 'fr-FR' });
  test('auto-detects French from the browser', async ({ page }) => {
    const errors = watchErrors(page);
    await boot(page);
    await expect(page.locator('[data-nav="barn"] [data-i18n]')).toHaveText('Grange');
    await expect(page.locator('#goal')).toContainText('blé');
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
