import { describe, expect, it } from 'vitest';
import {
  newGame, build, tick, collect, startUpgrade, offlineEarnings, applyOffline, totalRates, unlockRegion, claimQuest,
  currentQuest, questDone, castle, activateBoost, startNewEra, finishUpgradeNow, buildingOnPlot, canBuild, population, multiplier,
} from '../src/game/state';
import { OFFLINE_CAP_SECONDS } from '../src/game/economy';

const T0 = 1_700_000_000_000;

function withFarm() {
  const s = newGame(T0);
  expect(build(s, 'farm', 0, T0)).toEqual({ ok: true });
  tick(s, T0 + 10_000, 0); // finish construction
  return s;
}

describe('building & production', () => {
  it('builds a farm that finishes after its timer', () => {
    const s = newGame(T0);
    build(s, 'farm', 0, T0);
    const farm = buildingOnPlot(s, 0)!;
    expect(farm.level).toBe(0);
    tick(s, T0 + 1000, 1);
    expect(farm.level).toBe(0);
    const ev = tick(s, T0 + 10_000, 0);
    expect(farm.level).toBe(1);
    expect(ev.finished).toContain(farm);
  });
  it('pays the cost and rejects unaffordable or occupied plots', () => {
    const s = newGame(T0);
    const wood = s.res.wood;
    build(s, 'farm', 0, T0);
    expect(s.res.wood).toBeLessThan(wood);
    expect(build(s, 'farm', 0, T0)).toEqual({ ok: false, reason: 'invalid' });
    s.res = { food: 0, wood: 0, stone: 0, gold: 0 };
    expect(build(s, 'farm', 1, T0)).toEqual({ ok: false, reason: 'cost' });
  });
  it('cannot build on locked land', () => {
    const s = newGame(T0);
    s.res = { food: 1e9, wood: 1e9, stone: 1e9, gold: 1e9 };
    const lockedPlot = 20; // outer regions are locked at start
    expect(build(s, 'farm', lockedPlot, T0).ok).toBe(false);
  });
  it('accumulates pending resources and collects them', () => {
    const s = withFarm();
    const farm = buildingOnPlot(s, 0)!;
    tick(s, T0 + 20_000, 10);
    expect(farm.pending.food).toBeCloseTo(10 * totalRates(s, T0).food - 0, 0);
    const before = s.res.food;
    const got = collect(s, farm.id);
    expect(got.food).toBeGreaterThan(0);
    expect(s.res.food).toBe(before + got.food!);
  });
  it('caps pending storage', () => {
    const s = withFarm();
    const farm = buildingOnPlot(s, 0)!;
    tick(s, T0, 1e7);
    expect(farm.pending.food).toBeLessThanOrEqual(30 * 60 * 1 + 1);
  });
  it('upgrading increases production', () => {
    const s = withFarm();
    s.res = { food: 1e6, wood: 1e6, stone: 1e6, gold: 1e6 };
    const r1 = totalRates(s, T0).food;
    const farm = buildingOnPlot(s, 0)!;
    expect(startUpgrade(s, farm.id, T0)).toEqual({ ok: true });
    tick(s, T0 + 600_000, 0);
    expect(farm.level).toBe(2);
    expect(totalRates(s, T0).food).toBeGreaterThan(r1);
  });
  it('respects the builder limit and the finish-now reward', () => {
    const s = newGame(T0);
    s.res = { food: 1e6, wood: 1e6, stone: 1e6, gold: 1e6 };
    build(s, 'farm', 0, T0);
    build(s, 'farm', 1, T0);
    expect(canBuild(s, 'farm')).toEqual({ ok: false, reason: 'builders' });
    const b = buildingOnPlot(s, 0)!;
    finishUpgradeNow(s, b.id, T0 + 1);
    tick(s, T0 + 1, 0);
    expect(b.level).toBe(1);
  });
  it('boost doubles production for 5 minutes', () => {
    const s = withFarm();
    const base = totalRates(s, T0).food;
    activateBoost(s, T0);
    expect(totalRates(s, T0 + 1000).food).toBeCloseTo(base * 2);
    expect(totalRates(s, T0 + 5 * 60_000 + 1).food).toBeCloseTo(base);
  });
  it('houses add population which boosts production', () => {
    const s = withFarm();
    const m = multiplier(s, 'food', T0);
    s.res = { food: 1e6, wood: 1e6, stone: 1e6, gold: 1e6 };
    build(s, 'house', 1, T0);
    tick(s, T0 + 600_000, 0);
    expect(population(s)).toBeGreaterThan(0);
    expect(multiplier(s, 'food', T0)).toBeGreaterThan(m);
  });
});

describe('offline earnings', () => {
  it('nothing for short absences', () => {
    const s = withFarm();
    s.lastSeen = T0;
    expect(offlineEarnings(s, T0 + 30_000)).toBeNull();
  });
  it('pays production for the time away', () => {
    const s = withFarm();
    s.lastSeen = T0;
    const rep = offlineEarnings(s, T0 + 3600_000)!;
    expect(rep.seconds).toBe(3600);
    expect(rep.earnings.food).toBe(Math.floor(totalRates(s, T0, false).food * 3600));
  });
  it('is capped at 8 hours', () => {
    const s = withFarm();
    s.lastSeen = T0;
    const rep = offlineEarnings(s, T0 + 48 * 3600_000)!;
    expect(rep.seconds).toBe(OFFLINE_CAP_SECONDS);
  });
  it('ignores an active boost and can be doubled', () => {
    const s = withFarm();
    s.lastSeen = T0;
    activateBoost(s, T0);
    const rep = offlineEarnings(s, T0 + 3600_000)!;
    expect(rep.earnings.food).toBe(Math.floor(totalRates(s, T0, false).food * 3600));
    const before = s.res.food;
    applyOffline(s, rep, 2);
    expect(s.res.food).toBe(before + rep.earnings.food * 2);
  });
});

describe('land, quests, heroes, era', () => {
  it('unlocks regions in order with castle requirement', () => {
    const s = newGame(T0);
    s.res = { food: 1e9, wood: 1e9, stone: 1e9, gold: 1e9 };
    expect(unlockRegion(s, 2).ok).toBe(false);
    expect(unlockRegion(s, 1)).toEqual({ ok: true });
    expect(unlockRegion(s, 2)).toEqual({ ok: false, reason: 'locked' }); // needs castle 2
    castle(s).level = 2;
    expect(unlockRegion(s, 2)).toEqual({ ok: true });
  });
  it('first quest is building a farm and pays a reward', () => {
    const s = newGame(T0);
    expect(currentQuest(s).goal).toEqual({ kind: 'build', building: 'farm', count: 1 });
    expect(questDone(s)).toBe(false);
    build(s, 'farm', 0, T0);
    tick(s, T0 + 10_000, 0);
    expect(questDone(s)).toBe(true);
    const wood = s.res.wood;
    expect(claimQuest(s, T0)).not.toBeNull();
    expect(s.res.wood).toBeGreaterThan(wood);
    expect(s.quest.index).toBe(1);
  });
  it('unlocks a hero on a milestone', () => {
    const s = withFarm();
    buildingOnPlot(s, 0)!.level = 3;
    const ev = tick(s, T0, 0);
    expect(ev.heroes).toContain('mira');
    expect(s.heroes.mira).toBe(1);
  });
  it('new era keeps heroes and grants stars', () => {
    const s = withFarm();
    s.heroes.mira = 2;
    expect(startNewEra(s, T0)).toBeNull();
    castle(s).level = 8;
    s.earned.gold = 5e6;
    const n = startNewEra(s, T0)!;
    expect(n.era).toBe(1);
    expect(n.stars).toBeGreaterThan(0);
    expect(n.heroes.mira).toBe(2);
    expect(n.heroes.ysolde).toBe(1);
    expect(castle(n).level).toBe(1);
    expect(n.regions).toEqual([0]);
  });
});
