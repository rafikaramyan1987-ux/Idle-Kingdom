import { describe, expect, it } from 'vitest';
import { BUILDABLE, RESOURCES, upgradeCost, type BuildingType } from '../src/game/economy';
import { buildMap } from '../src/game/map';
import * as G from '../src/game/state';

/** A simple greedy "active player" used to keep the pacing sane. */
function simulate(seconds: number, opts: { tapEvery: number }) {
  const T0 = 1_700_000_000_000;
  const s = G.newGame(T0);
  const marks: Record<string, number> = {};
  const mark = (k: string, t: number) => { if (marks[k] === undefined) marks[k] = t; };
  const plots = buildMap().plots;
  const spend = (c: Partial<Record<string, number>>) => RESOURCES.reduce((a, r) => a + (c[r] ?? 0), 0);
  for (let t = 1; t <= seconds; t++) {
    const now = T0 + t * 1000;
    G.tick(s, now, 1);
    if (t % opts.tapEvery === 0) G.collectAll(s);
    while (G.claimQuest(s, now)) { /* claim all */ }
    for (const h of ['mira', 'bram', 'tova', 'lior', 'pip', 'bell'] as const) if (t % 120 === 0 && G.canLevelHero(s, h).ok) G.levelHero(s, h);
    // A sensible player: castle first, then new land, then one of each building, then cheapest upgrades
    // while keeping enough saved for the next castle level.
    const castle = G.castle(s);
    const castleCost = upgradeCost('castle', castle.level);
    if (G.canUpgrade(s, castle).ok) G.startUpgrade(s, castle.id, now);
    const nr = G.nextRegion(s);
    if (nr !== null && G.canUnlockRegion(s, nr).ok) G.unlockRegion(s, nr);
    const free = plots.filter((p) => s.regions.includes(p.region) && !G.buildingOnPlot(s, p.id));
    if (free.length) {
      const want = [...BUILDABLE].sort((a, b) => G.countOf(s, a) - G.countOf(s, b) || (a === 'mine' ? -1 : 0));
      for (const type of want) if (G.canBuild(s, type).ok) { G.build(s, type as BuildingType, free[0].id, now); break; }
    }
    const acts: { cost: number; run: () => void }[] = [];
    for (const b of s.buildings) {
      if (b.type === 'castle' || !G.canUpgrade(s, b).ok) continue;
      const c = upgradeCost(b.type, b.level);
      const keepsSavings = RESOURCES.every((r) => s.res[r] - (c[r] ?? 0) >= (castleCost[r] ?? 0) * 0.5 || !(c[r] ?? 0));
      if (keepsSavings || !G.canUpgrade(s, castle).ok && castle.upgradeEnd > 0) acts.push({ cost: spend(c), run: () => G.startUpgrade(s, b.id, now) });
    }
    acts.sort((a, b) => a.cost - b.cost);
    if (acts.length) acts[0].run();
    for (let l = 2; l <= 12; l++) if (castle.level >= l) mark(`castle${l}`, t);
    for (let r = 1; r <= 12; r++) if (s.regions.length > r) mark(`region${r}`, t);
    if (G.canStartEra(s)) mark('era', t);
  }
  return { s, marks };
}

const fmt = (sec?: number) => (sec === undefined ? '—' : sec < 3600 ? `${Math.round(sec / 60)}m` : `${(sec / 3600).toFixed(1)}h`);

describe('pacing (greedy active player)', () => {
  const { s, marks } = simulate(4 * 3600, { tapEvery: 15 });
  if (process.env.BALANCE) {
    console.log(Object.entries(marks).map(([k, v]) => `${k}=${fmt(v)}`).join('  '));
    console.log('castle', G.castle(s).level, 'regions', s.regions.length - 1, 'quests', s.quest.index, 'res', JSON.stringify(Object.fromEntries(RESOURCES.map((r) => [r, Math.round(s.res[r])]))));
    console.log('buildings', s.buildings.map((b) => `${b.type}${b.level}`).join(' '));
  }
  it('first castle upgrade and first new land come within the first ~10 minutes', () => {
    expect(marks.castle2).toBeLessThan(12 * 60);
    expect(marks.region1).toBeLessThan(6 * 60);
  });
  it('progress keeps coming but the whole island is not done in a few hours', () => {
    expect(marks.castle4).toBeLessThan(90 * 60);
    expect(marks.castle4).toBeGreaterThan(15 * 60);
    expect(s.regions.length - 1).toBeLessThan(12);
    expect(marks.era).toBeUndefined();
  });
});
