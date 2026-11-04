import type { BuildingType } from './game/economy';
import { buildMap } from './game/map';
import { newGame, castle, walls, type GameState } from './game/state';

/** A pretty, well-developed kingdom used to render store covers from the real scene. */
export function coverState(now: number): GameState {
  const s = newGame(now);
  s.regions = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  castle(s).level = 9;
  walls(s).level = 8;
  const types: BuildingType[] = ['house', 'farm', 'market', 'lumber', 'house', 'forge', 'farm', 'mine', 'house', 'lumber', 'farm', 'house', 'mine', 'market', 'farm', 'house'];
  const levels = [15, 10, 15, 10, 6, 15, 15, 10, 10, 15, 6, 15, 6, 10, 10, 6];
  let i = 0;
  for (const p of buildMap().plots) {
    if (!s.regions.includes(p.region)) continue;
    const type = types[i % types.length];
    s.buildings.push({ id: s.nextId++, type, plot: p.id, level: levels[i % levels.length], pending: { food: 0, wood: 0, stone: 0, gold: 0 }, upgradeEnd: 0, upgradeStart: 0 });
    i++;
  }
  return s;
}
