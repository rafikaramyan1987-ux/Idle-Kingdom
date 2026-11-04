import { describe, expect, it } from 'vitest';
import { RECIPES, ITEMS, BUILDINGS, xpForLevel, campEnemies } from '../src/game/defs';
import { Battle } from '../src/game/battle';
import * as G from '../src/game/state';
import { formatNumber, formatDuration } from '../src/game/format';

const T0 = new Date(2026, 10, 4, 12, 0, 0).getTime();
const B = (s: G.GameState, type: string) => s.buildings.find((b) => b.type === type)!;

describe('production chains', () => {
  it('field: plant -> grow -> harvest 2 wheat into the barn', () => {
    const s = G.newGame(T0);
    const f = B(s, 'field');
    const wheat = G.count(s, 'wheat');
    expect(G.start(s, f.id, 'wheat', T0)).toEqual({ ok: true });
    expect(G.start(s, f.id, 'wheat', T0).ok).toBe(false); // one crop at a time
    G.tick(s, T0 + 5_000, 5);
    expect(f.ready).toEqual([]);
    G.tick(s, T0 + 21_000, 16);
    expect(f.ready).toEqual(['wheat']);
    G.collect(s, f.id);
    expect(G.count(s, 'wheat')).toBe(wheat + 2);
  });
  it('bakery: wheat -> flour -> bread, sequential queue', () => {
    const s = G.newGame(T0);
    s.items.wheat = 10;
    const bk = B(s, 'bakery');
    expect(G.start(s, bk.id, 'bread', T0).ok).toBe(false); // needs flour
    G.start(s, bk.id, 'flour', T0);
    G.start(s, bk.id, 'flour', T0);
    expect(bk.jobs[1].start).toBe(bk.jobs[0].end); // queued after the first
    G.tick(s, T0 + 60_000, 0);
    G.collect(s, bk.id);
    expect(G.count(s, 'flour')).toBe(2);
    expect(G.start(s, bk.id, 'bread', T0 + 60_000)).toEqual({ ok: true });
  });
  it('queue length is limited and can be extended in the shop', () => {
    const s = G.newGame(T0);
    s.items.wheat = 100;
    const bk = B(s, 'bakery');
    for (let i = 0; i < 3; i++) G.start(s, bk.id, 'flour', T0);
    expect(G.start(s, bk.id, 'flour', T0)).toEqual({ ok: false, reason: 'full' });
    s.gems = 50;
    G.buySlot(s, 'bakery');
    expect(G.start(s, bk.id, 'flour', T0).ok).toBe(true);
  });
  it('production continues while the game is closed (timestamps)', () => {
    const s = G.newGame(T0);
    const f = B(s, 'field');
    G.start(s, f.id, 'wheat', T0);
    G.tick(s, T0 + 3 * 3600_000, 0);
    expect(f.ready).toEqual(['wheat']);
  });
  it('every recipe input is an item, every building has recipes or a role', () => {
    for (const r of RECIPES) for (const k of Object.keys(r.inputs)) expect(ITEMS).toHaveProperty(k);
    for (const r of RECIPES) expect(BUILDINGS[r.building]).toBeDefined();
  });
});

describe('barn', () => {
  it('limits storage and blocks collecting when full', () => {
    const s = G.newGame(T0);
    s.items.wood = G.barnCap(s) - G.barnUsed(s) + (s.items.wood ?? 0);
    expect(G.barnFree(s)).toBe(0);
    const f = B(s, 'field');
    G.start(s, f.id, 'wheat', T0);
    G.tick(s, T0 + 30_000, 0);
    G.collect(s, f.id);
    expect(f.ready).toEqual(['wheat']); // stays in the bubble
    expect(G.drainEvents().some((e) => e.type === 'barnFull')).toBe(true);
  });
  it('tools do not take space and upgrade the barn', () => {
    const s = G.newGame(T0);
    const cap = G.barnCap(s);
    s.items.hammer = 5; s.items.nails = 5; s.items.paint = 5;
    expect(G.barnUsed(s)).toBe(10); // 6 wheat + 4 wood
    s.gold = 1000;
    expect(G.upgradeBarn(s)).toEqual({ ok: true });
    expect(G.barnCap(s)).toBe(cap + 25);
  });
});

describe('orders & cart', () => {
  it('first order asks for wheat and pays gold + xp', () => {
    const s = G.newGame(T0);
    const o = s.orders[0];
    expect(o.lines).toEqual([['wheat', 2]]);
    const gold = s.gold, xp = s.xp;
    expect(G.deliver(s, o.id, T0)).not.toBeNull();
    expect(s.gold).toBeGreaterThan(gold);
    expect(s.xp).toBeGreaterThan(xp);
    expect(s.orders[0].readyAt).toBeGreaterThan(T0); // next order arrives a bit later
  });
  it('orders only ask for goods the player can produce', () => {
    const s = G.newGame(T0);
    for (let i = 0; i < 40; i++) {
      const o = G.makeOrder(s, T0, -1);
      for (const [item] of o.lines) expect(G.producible(s, item)).toBe(true);
    }
  });
});

describe('battles & raids', () => {
  it('the first camp is an easy win for the starting knight', () => {
    const s = G.newGame(T0);
    const b = new Battle(G.campSetup(s, 1, T0));
    expect(b.resolve()).toBe(0);
    expect(b.time).toBeGreaterThan(3);
    expect(b.events.some((e) => e.t === 'skill')).toBe(true);
  });
  it('winning a camp unlocks land and pays tools', () => {
    const s = G.newGame(T0);
    const b = new Battle(G.campSetup(s, 1, T0));
    b.resolve();
    const r = G.finishCamp(s, 1, b, T0)!;
    expect(s.regions).toContain(1);
    expect(r.items).toBeDefined();
    expect(Object.values(r.items).reduce((a, v) => a + (v ?? 0), 0)).toBeGreaterThan(0);
  });
  it('battles are deterministic for the same seed', () => {
    const s = G.newGame(T0);
    const a = new Battle(G.campSetup(s, 2, T0)), b = new Battle(G.campSetup(s, 2, T0));
    a.resolve(); b.resolve();
    expect(a.winner).toBe(b.winner);
    expect(a.time).toBeCloseTo(b.time);
  });
  it('later camps are harder', () => {
    expect(G.campPower(5)).toBeGreaterThan(G.campPower(1) * 3);
    expect(campEnemies(8).length).toBeGreaterThan(campEnemies(1).length);
  });
  it('losing a raid only costs a few goods', () => {
    const s = G.newGame(T0);
    s.items = { wheat: 10, flour: 5, wood: 5, hammer: 2 };
    s.heroes.knight!.hp = 0.13;
    s.stats.raids = 20; // a big wave
    const b = new Battle(G.raidSetup(s, T0));
    b.resolve();
    const r = G.finishRaid(s, b, T0);
    if (!r.win) {
      const lost = Object.values(r.lost).reduce((a, v) => a + (v ?? 0), 0);
      expect(lost).toBeLessThanOrEqual(4);
      expect(s.items.hammer).toBe(2);
      expect(s.buildings.length).toBe(G.newGame(T0).buildings.length);
    }
    expect(s.raidAt).toBeGreaterThan(s.play);
  });
  it('heroes heal over time and with meals', () => {
    const s = G.newGame(T0);
    const h = s.heroes.knight!;
    h.hp = 0.2; h.hpAt = T0;
    expect(G.heroHp(h, T0 + 30_000)).toBeGreaterThan(0.2);
    s.items.stew = 1;
    G.feedHero(s, 'knight', 'stew', T0);
    expect(G.heroHp(h, T0)).toBe(1);
  });
});

describe('offline, levels, format', () => {
  it('offline taxes are capped at 8 hours', () => {
    const s = G.newGame(T0);
    s.lastSeen = T0;
    expect(G.offlineReport(s, T0 + 30_000)).toBeNull();
    const r1 = G.offlineReport(s, T0 + 3600_000)!;
    const r2 = G.offlineReport(s, T0 + 48 * 3600_000)!;
    expect(r1.seconds).toBe(3600);
    expect(r2.seconds).toBe(8 * 3600);
    expect(r2.gold).toBe(r1.gold * 8);
  });
  it('xp curve is increasing', () => {
    let prev = -1;
    for (let l = 1; l < 30; l++) { expect(xpForLevel(l)).toBeGreaterThan(prev); prev = xpForLevel(l); }
  });
  it('formats big numbers', () => {
    expect(formatNumber(1200)).toBe('1.2K');
    expect(formatNumber(3_400_000)).toBe('3.4M');
    expect(formatDuration(65)).toBe('1m 05s');
  });
});

describe('no dead ends early on', () => {
  it('a fresh save always has useful actions', () => {
    const s = G.newGame(T0);
    expect(G.usefulActions(s, T0).length).toBeGreaterThan(0);
  });
  it('level 1 allows 5 fields, a coop and a mine', () => {
    expect(BUILDINGS.field.max(1)).toBeGreaterThanOrEqual(5);
    expect(BUILDINGS.coop.level).toBe(1);
    expect(BUILDINGS.mine.level).toBe(1);
  });
  it('the objective never points at something locked; otherwise it says how to level up', () => {
    const s = G.newGame(T0);
    s.goalsDone = G.GOALS.filter((g) => g.level === 1).map((g) => g.id);
    const view = G.currentGoal(s);
    expect(view.kind).toBe('levelup');
    if (view.kind === 'levelup') { expect(view.level).toBe(2); expect(view.xpLeft).toBeGreaterThan(0); }
    for (let lvl = 1; lvl <= 6; lvl++) {
      s.level = lvl;
      const v = G.currentGoal(s);
      if (v.kind === 'goal') expect(v.goal.level).toBeLessThanOrEqual(lvl);
    }
  });
  it('goals are ordered by unlock level (time-gated ones excepted)', () => {
    let lvl = 1;
    for (const g of G.GOALS) { if (!g.ready) { expect(g.level).toBeGreaterThanOrEqual(lvl); lvl = g.level; } }
  });
  it('next unlock hint lists what level 2 brings', () => {
    const s = G.newGame(T0);
    const n = G.nextUnlocks(s);
    expect(n.level).toBe(2);
    expect(n.buildings).toContain('kitchen');
    expect(n.xpLeft).toBe(xpForLevel(2));
  });
});
