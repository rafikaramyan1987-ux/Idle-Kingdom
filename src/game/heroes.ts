import type { Bundle, BuildingType, Res } from './economy';

export type HeroId = 'mira' | 'bram' | 'tova' | 'lior' | 'pip' | 'wren' | 'bell' | 'ysolde';

export type Milestone =
  | { kind: 'level'; building: BuildingType; level: number }
  | { kind: 'built'; building: BuildingType; count: number }
  | { kind: 'regions'; count: number }
  | { kind: 'era'; count: number };

export interface HeroDef {
  id: HeroId;
  emoji: string;
  color: string;
  /** Production bonus per hero level for a resource ('all' = every resource). */
  bonus?: { res: Res | 'all'; perLevel: number };
  special?: 'autoCollect' | 'builder' | 'stars';
  unlock: Milestone;
}

export const HEROES: HeroDef[] = [
  { id: 'mira', emoji: '🌾', color: '#e9b949', bonus: { res: 'food', perLevel: 0.25 }, unlock: { kind: 'level', building: 'farm', level: 3 } },
  { id: 'bram', emoji: '🪓', color: '#a8663a', bonus: { res: 'wood', perLevel: 0.25 }, unlock: { kind: 'level', building: 'lumber', level: 3 } },
  { id: 'pip', emoji: '🧺', color: '#6fb86a', special: 'autoCollect', bonus: { res: 'gold', perLevel: 0.1 }, unlock: { kind: 'level', building: 'castle', level: 3 } },
  { id: 'tova', emoji: '⛏️', color: '#8a9aa8', bonus: { res: 'stone', perLevel: 0.25 }, unlock: { kind: 'level', building: 'mine', level: 3 } },
  { id: 'lior', emoji: '🪙', color: '#f2c14e', bonus: { res: 'gold', perLevel: 0.25 }, unlock: { kind: 'built', building: 'market', count: 1 } },
  { id: 'wren', emoji: '📐', color: '#5b8bd9', special: 'builder', unlock: { kind: 'regions', count: 3 } },
  { id: 'bell', emoji: '📜', color: '#b07cc6', bonus: { res: 'all', perLevel: 0.1 }, unlock: { kind: 'level', building: 'walls', level: 5 } },
  { id: 'ysolde', emoji: '✨', color: '#ef8fa8', special: 'stars', unlock: { kind: 'era', count: 1 } },
];

export const HERO_MAX_LEVEL = 10;

export function heroLevelCost(level: number): Bundle {
  // Cost to go from level -> level + 1.
  const g = Math.round(250 * Math.pow(3.2, level - 1));
  return { gold: g, food: Math.round(g * 0.6) };
}

export function heroDef(id: HeroId): HeroDef {
  const h = HEROES.find((x) => x.id === id);
  if (!h) throw new Error(`Unknown hero ${id}`);
  return h;
}

/** Architect: build time reduction (0..0.6). */
export function builderTimeFactor(wrenLevel: number): number {
  if (wrenLevel <= 0) return 1;
  return 1 - Math.min(0.6, 0.1 + 0.05 * wrenLevel);
}
