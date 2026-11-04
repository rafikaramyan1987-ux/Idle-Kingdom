import { describe, expect, it } from 'vitest';
import { buildMap, pickTile, hexToWorld, worldToHex } from '../src/game/map';
import { AdPacer } from '../src/game/ads';

describe('map', () => {
  const m = buildMap();
  it('has a castle in the centre and plots in every region', () => {
    expect(m.cells.get('0,0')!.kind).toBe('castle');
    for (const r of m.regions) expect(r.plots.length).toBeGreaterThan(0);
  });
  it('every road and river cell has a matching tile', () => {
    for (const c of m.cells.values()) {
      if (c.kind === 'road') expect(c.tile).toMatch(/^hex_road_/);
      if (c.kind === 'river') expect(c.tile).toMatch(/^hex_river_/);
    }
  });
  it('tile picker handles rotations', () => {
    expect(pickTile('road', [0, 3])).toEqual({ model: 'hex_road_A', rot: 0 });
    expect(pickTile('road', [1, 4])).toEqual({ model: 'hex_road_A', rot: 1 });
    expect(pickTile('river', [4, 0])).not.toBeNull();
  });
  it('hex <-> world conversion round-trips', () => {
    for (const h of [{ q: 0, r: 0 }, { q: 3, r: -2 }, { q: -4, r: 5 }]) {
      const w = hexToWorld(h);
      expect(worldToHex(w.x, w.z)).toEqual(h);
    }
  });
});

describe('ad pacing', () => {
  it('never in the first 3 minutes, then at most every 3 minutes', () => {
    const p = new AdPacer(0);
    expect(p.canShowMidgame(60_000)).toBe(false);
    expect(p.canShowMidgame(180_000)).toBe(true);
    p.markShown(180_000);
    expect(p.canShowMidgame(200_000)).toBe(false);
    expect(p.canShowMidgame(360_000)).toBe(true);
  });
});
