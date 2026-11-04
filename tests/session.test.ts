import { describe, expect, it } from 'vitest';
import { Bot, fmtTime } from '../src/game/bot';
import * as G from '../src/game/state';

const T0 = new Date(2026, 10, 4, 12, 0, 0).getTime();

describe('first session pacing (bot plays 15 minutes)', () => {
  const s = G.newGame(T0);
  const bot = new Bot(s, T0);
  bot.run(15 * 60);
  const tl = bot.timeline;
  if (process.env.TIMELINE) console.log(tl.map((e) => `${fmtTime(e.t)}  ${e.text}`).join('\n'));
  const first = (re: RegExp) => tl.find((e) => re.test(e.text))?.t ?? Infinity;

  it('bread and the first order come fast', () => {
    expect(first(/First bread made/)).toBeLessThan(90);
    expect(first(/Order delivered/)).toBeLessThan(120);
  });
  it('first battle around minute 3', () => {
    const t = first(/Battle won/);
    expect(t).toBeGreaterThan(120);
    expect(t).toBeLessThan(240);
  });
  it('first raid around minute 5', () => {
    const t = first(/Raid (defended|lost)/);
    expect(t).toBeGreaterThan(270);
    expect(t).toBeLessThan(330);
  });
  it('a new hero joins around minute 7', () => {
    const t = first(/Hero joined/);
    expect(t).toBeGreaterThan(360);
    expect(t).toBeLessThan(480);
  });
  it('something happens at least every 60 seconds', () => {
    let last = 0;
    let worst = 0;
    for (const e of tl) { worst = Math.max(worst, e.t - last); last = e.t; }
    worst = Math.max(worst, 15 * 60 - last);
    expect(worst).toBeLessThanOrEqual(60);
  });
  it('progress is real but the game is far from done', () => {
    expect(s.level).toBeGreaterThanOrEqual(4);
    expect(s.level).toBeLessThanOrEqual(8);
    expect(s.regions.length).toBeGreaterThanOrEqual(3);
    expect(s.regions.length).toBeLessThan(8);
  });
});
