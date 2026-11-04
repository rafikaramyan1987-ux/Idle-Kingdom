// Pure economy definitions and formulas. No DOM / Three.js here so it is easy to unit test.

export const RESOURCES = ['food', 'wood', 'stone', 'gold'] as const;
export type Res = (typeof RESOURCES)[number];
export type Bundle = Partial<Record<Res, number>>;

export type BuildingType = 'castle' | 'walls' | 'farm' | 'lumber' | 'mine' | 'house' | 'market' | 'forge';
export const BUILDABLE: BuildingType[] = ['farm', 'lumber', 'house', 'mine', 'market', 'forge'];

export interface BuildingDef {
  type: BuildingType;
  /** Production per second at level 1 (before multipliers). */
  produces: Bundle;
  /** Population housed per level. */
  population?: number;
  /** Global production bonus per level (forge, walls). */
  globalBonus?: number;
  baseCost: Bundle;
  costGrowth: number;
  /** Castle level needed before this can be built. */
  unlockCastle: number;
  maxCount: number;
  /** Level cap per castle level. */
  levelsPerCastle: number;
  timeFactor: number;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  castle: { type: 'castle', produces: { gold: 0.5 }, baseCost: { gold: 80, wood: 60, stone: 40 }, costGrowth: 2.1, unlockCastle: 0, maxCount: 1, levelsPerCastle: 0, timeFactor: 2 },
  walls: { type: 'walls', produces: {}, globalBonus: 0.03, baseCost: { stone: 60, wood: 50 }, costGrowth: 1.6, unlockCastle: 2, maxCount: 1, levelsPerCastle: 3, timeFactor: 1.5 },
  farm: { type: 'farm', produces: { food: 1 }, baseCost: { wood: 12, gold: 8 }, costGrowth: 1.45, unlockCastle: 1, maxCount: 99, levelsPerCastle: 5, timeFactor: 1 },
  lumber: { type: 'lumber', produces: { wood: 0.8 }, baseCost: { food: 15, gold: 8 }, costGrowth: 1.45, unlockCastle: 1, maxCount: 99, levelsPerCastle: 5, timeFactor: 1 },
  house: { type: 'house', produces: { gold: 0.2 }, population: 4, baseCost: { wood: 20, food: 20 }, costGrowth: 1.5, unlockCastle: 1, maxCount: 99, levelsPerCastle: 5, timeFactor: 1 },
  mine: { type: 'mine', produces: { stone: 0.5, gold: 0.15 }, baseCost: { wood: 40, food: 40 }, costGrowth: 1.5, unlockCastle: 2, maxCount: 99, levelsPerCastle: 5, timeFactor: 1.2 },
  market: { type: 'market', produces: { gold: 1.2 }, baseCost: { wood: 80, stone: 40 }, costGrowth: 1.55, unlockCastle: 2, maxCount: 2, levelsPerCastle: 5, timeFactor: 1.3 },
  forge: { type: 'forge', produces: {}, globalBonus: 0.05, baseCost: { wood: 150, stone: 120, gold: 60 }, costGrowth: 1.65, unlockCastle: 3, maxCount: 1, levelsPerCastle: 5, timeFactor: 1.5 },
};

export const START_RESOURCES: Record<Res, number> = { food: 30, wood: 40, stone: 0, gold: 30 };
export const OFFLINE_CAP_SECONDS = 8 * 3600;
export const OFFLINE_MIN_SECONDS = 60;
/** Buildings hold up to this many seconds of production before they need a tap. */
export const STORAGE_SECONDS = 30 * 60;
export const BOOST_SECONDS = 5 * 60;
export const BASE_BUILDERS = 2;
export const POP_BONUS = 0.01;
export const STAR_BONUS = 0.1;
export const ERA_CASTLE_LEVEL = 8;

/** Production multiplier for a building level: grows a bit faster than linear. */
export function levelMultiplier(level: number): number {
  if (level <= 0) return 0;
  return level * Math.pow(1.12, level - 1);
}

export function scaleBundle(b: Bundle, k: number): Bundle {
  const out: Bundle = {};
  for (const r of RESOURCES) {
    const v = b[r];
    if (v) out[r] = v * k;
  }
  return out;
}

function niceRound(v: number): number {
  if (v < 100) return Math.ceil(v);
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.ceil(v / mag) * mag;
}

/** Cost to go from `level` to `level + 1` (level 0 means "build"). */
export function upgradeCost(type: BuildingType, level: number): Bundle {
  const def = BUILDINGS[type];
  if (type === 'castle') {
    // Castle starts at level 1; the first upgrade needs no stone so the early game never deadlocks.
    const n = Math.max(0, level - 1);
    const k = Math.pow(def.costGrowth, n);
    const out: Bundle = { gold: niceRound((def.baseCost.gold ?? 0) * k), wood: niceRound((def.baseCost.wood ?? 0) * k) };
    if (level >= 2) out.stone = niceRound((def.baseCost.stone ?? 0) * Math.pow(def.costGrowth, n - 1));
    return out;
  }
  const k = Math.pow(def.costGrowth, level);
  const out: Bundle = {};
  for (const r of RESOURCES) {
    const v = def.baseCost[r];
    if (v) out[r] = niceRound(v * k);
  }
  return out;
}

/** Upgrade duration in seconds before hero reductions. Short and relaxing. */
export function upgradeSeconds(type: BuildingType, level: number): number {
  const def = BUILDINGS[type];
  const cap = type === 'castle' ? 480 : 240;
  return Math.min(cap, Math.round(3 * Math.pow(1.4, level) * def.timeFactor));
}

export function maxLevel(type: BuildingType, castleLevel: number): number {
  if (type === 'castle') return 99;
  return Math.max(1, castleLevel * BUILDINGS[type].levelsPerCastle);
}

export function canAfford(have: Record<Res, number>, cost: Bundle): boolean {
  return RESOURCES.every((r) => (have[r] ?? 0) + 1e-9 >= (cost[r] ?? 0));
}

// ---------- Land ----------
export const REGION_COUNT = 13; // region 0 is the starting land

export function regionCost(region: number): Bundle {
  if (region <= 0) return {};
  const n = region - 1;
  return { gold: niceRound(60 * Math.pow(3.1, n)), wood: niceRound(50 * Math.pow(2.9, n)), ...(n >= 2 ? { stone: niceRound(40 * Math.pow(2.9, n - 2)) } : {}) };
}

export function regionCastleReq(region: number): number {
  return 1 + Math.floor(region / 2);
}

// ---------- Era (prestige) ----------
export function starsForLifetimeGold(lifetimeGold: number): number {
  if (lifetimeGold < 2e4) return 0;
  return Math.floor(4 * Math.sqrt(lifetimeGold / 2e4));
}
