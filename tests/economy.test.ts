import { describe, expect, it } from 'vitest';
import { BUILDINGS, levelMultiplier, regionCost, starsForLifetimeGold, upgradeCost, upgradeSeconds, canAfford, maxLevel } from '../src/game/economy';
import { formatNumber, formatDuration } from '../src/game/format';

describe('cost curve', () => {
  it('grows exponentially with the configured factor', () => {
    for (const t of ['farm', 'lumber', 'mine', 'house', 'market', 'forge', 'walls'] as const) {
      const a = upgradeCost(t, 10), b = upgradeCost(t, 11);
      for (const r of Object.keys(a) as (keyof typeof a)[]) {
        const ratio = b[r]! / a[r]!;
        expect(ratio).toBeGreaterThan(BUILDINGS[t].costGrowth * 0.9);
        expect(ratio).toBeLessThan(BUILDINGS[t].costGrowth * 1.1);
      }
    }
  });
  it('is strictly increasing', () => {
    let prev = 0;
    for (let l = 0; l < 40; l++) {
      const c = upgradeCost('farm', l).wood!;
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
  });
  it('first castle upgrade does not need stone (no early deadlock)', () => {
    expect(upgradeCost('castle', 1).stone ?? 0).toBe(0);
    expect(upgradeCost('castle', 2).stone).toBeGreaterThan(0);
  });
  it('starting resources can afford the first farm', () => {
    expect(canAfford({ food: 30, wood: 40, stone: 0, gold: 30 }, upgradeCost('farm', 0))).toBe(true);
  });
  it('region costs increase', () => {
    expect(regionCost(2).gold!).toBeGreaterThan(regionCost(1).gold!);
    expect(regionCost(0)).toEqual({});
  });
});

describe('production & timers', () => {
  it('level multiplier is 0 at level 0 and grows faster than linear', () => {
    expect(levelMultiplier(0)).toBe(0);
    expect(levelMultiplier(1)).toBe(1);
    expect(levelMultiplier(10)).toBeGreaterThan(10);
  });
  it('upgrade timers are short and capped', () => {
    expect(upgradeSeconds('farm', 0)).toBeLessThanOrEqual(5);
    expect(upgradeSeconds('farm', 100)).toBe(240);
    expect(upgradeSeconds('castle', 100)).toBe(480);
  });
  it('castle level caps building levels', () => {
    expect(maxLevel('farm', 1)).toBe(5);
    expect(maxLevel('farm', 3)).toBe(15);
  });
  it('stars need meaningful progress', () => {
    expect(starsForLifetimeGold(100)).toBe(0);
    expect(starsForLifetimeGold(2e6)).toBeGreaterThan(starsForLifetimeGold(2e5));
  });
});

describe('format', () => {
  it('formats big numbers', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(12)).toBe('12');
    expect(formatNumber(2.55)).toBe('2.5');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1200)).toBe('1.2K');
    expect(formatNumber(3_400_000)).toBe('3.4M');
    expect(formatNumber(999_999)).toBe('999K');
    expect(formatNumber(125_000_000_000)).toBe('125B');
    expect(formatNumber(1e15)).toBe('1Qa');
  });
  it('formats durations', () => {
    expect(formatDuration(5)).toBe('5s');
    expect(formatDuration(65)).toBe('1m 05s');
    expect(formatDuration(3600 * 8)).toBe('8h 00m');
  });
});
