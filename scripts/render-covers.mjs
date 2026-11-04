// Renders CrazyGames cover images from the real 3D scene into covers/.
// Usage: npm run build && npm run covers
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const SIZES = [
  [1920, 1080],
  [800, 1200],
  [800, 800],
];
const PORT = 4179;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch { /* not up yet */ }
    await wait(500);
  }
  fs.mkdirSync('covers', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [w, h] of SIZES) {
    // Render at half the CSS size with devicePixelRatio 2 for crisp, anti-aliased output.
    const page = await browser.newPage({ viewport: { width: w / 2, height: h / 2 }, deviceScaleFactor: 2 });
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    await page.goto(`http://localhost:${PORT}/?cover=1`);
    await page.waitForFunction(() => window.__IK?.ready && window.__IK.frames > 8, null, { timeout: 300000 });
    await page.waitForTimeout(2500);
    const file = `covers/cover-${w}x${h}.png`;
    await page.screenshot({ path: file });
    console.log('wrote', file);
    await page.close();
  }
  await browser.close();
} finally {
  server.kill();
}
