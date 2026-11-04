import { describe, expect, it } from 'vitest';
import { Bot, fmtTime } from '../src/game/bot';
import * as G from '../src/game/state';

const T0 = new Date(2026, 10, 4, 12, 0, 0).getTime();

describe('first 15 minutes, played by a realistic player (human tap speed, objective card only)', () => {
  const s = G.newGame(T0);
  const bot = new Bot(s, T0);
  bot.run(15 * 60);
  const tl = bot.timeline;
  if (process.env.TIMELINE) {
    console.log(tl.map((e) => `${fmtTime(e.t)}  ${e.text}`).join('\n'));
    console.log(`max idle: ${bot.maxIdle}s, idle gifts: ${G.stat(s, 'idleGifts')}, level ${s.level}, regions ${s.regions.length - 1}`);
  }
  const first = (re: RegExp) => tl.find((e) => re.test(e.text))?.t ?? Infinity;

  it('never more than 20 seconds without a useful action', () => {
    expect(bot.maxIdle).toBeLessThanOrEqual(20);
  });
  it('the objective card never shows something locked', () => {
    expect(bot.lockedGoalSeen).toBe(0);
  });
  it('level 2 within 1-2 minutes, level 3 within 4-5 minutes', () => {
    expect(first(/LEVEL UP → 2/)).toBeGreaterThanOrEqual(60);
    expect(first(/LEVEL UP → 2/)).toBeLessThanOrEqual(120);
    expect(first(/LEVEL UP → 3/)).toBeGreaterThanOrEqual(225);
    expect(first(/LEVEL UP → 3/)).toBeLessThanOrEqual(300);
  });
  it('bread and the first order come fast', () => {
    expect(first(/First bread/)).toBeLessThan(100);
    expect(first(/Order delivered/)).toBeLessThan(60);
  });
  it('first battle around minute 3, first raid around minute 5, a new hero around minute 7', () => {
    const b = first(/Battle won/);
    expect(b).toBeGreaterThan(120);
    expect(b).toBeLessThan(240);
    const r = first(/Raid (defended|lost)/);
    expect(r).toBeGreaterThan(270);
    expect(r).toBeLessThan(330);
    const h = first(/Hero joined/);
    expect(h).toBeGreaterThan(360);
    expect(h).toBeLessThan(480);
  });
  it('something visible happens at least every 60 seconds', () => {
    let last = 0, worst = 0;
    for (const e of tl) { worst = Math.max(worst, e.t - last); last = e.t; }
    expect(Math.max(worst, 15 * 60 - last)).toBeLessThanOrEqual(60);
  });
});
