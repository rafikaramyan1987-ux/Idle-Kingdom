import {
  BASE_BUILDERS, BOOST_SECONDS, BUILDINGS, ERA_CASTLE_LEVEL, OFFLINE_CAP_SECONDS, OFFLINE_MIN_SECONDS, POP_BONUS,
  RESOURCES, REGION_COUNT, STAR_BONUS, START_RESOURCES, STORAGE_SECONDS,
  canAfford, levelMultiplier, maxLevel, regionCastleReq, regionCost, starsForLifetimeGold, upgradeCost, upgradeSeconds,
  type Bundle, type BuildingType, type Res,
} from './economy';
import { HEROES, HERO_MAX_LEVEL, builderTimeFactor, heroLevelCost, type HeroId, type Milestone } from './heroes';
import { questAt, type QuestGoal } from './quests';
import { buildMap } from './map';

export const SAVE_VERSION = 1;
export const WALLS_PLOT = -1;
export const CASTLE_PLOT = -2;

export interface Building {
  id: number;
  type: BuildingType;
  plot: number;
  level: number;
  pending: Record<Res, number>;
  /** Timestamp (ms) when the running upgrade finishes, 0 = idle. */
  upgradeEnd: number;
  upgradeStart: number;
}

export interface Settings {
  sfx: boolean;
  music: boolean;
  lang: 'en' | 'fr' | 'auto';
  quality: 'auto' | 'high' | 'low';
}

export interface GameState {
  version: number;
  res: Record<Res, number>;
  /** Earned this era (used for stars and quests). */
  earned: Record<Res, number>;
  /** Tapped/collected totals, used by "collect" quests. */
  collected: Record<Res, number>;
  buildings: Building[];
  regions: number[];
  heroes: Partial<Record<HeroId, number>>;
  /** Heroes unlocked but not yet seen in the Heroes panel. */
  newHeroes: HeroId[];
  quest: { index: number; base: Record<Res, number> };
  era: number;
  stars: number;
  boostEnd: number;
  lastSeen: number;
  createdAt: number;
  nextId: number;
  settings: Settings;
  stats: { taps: number; upgrades: number; adsWatched: number };
}

const zero = (): Record<Res, number> => ({ food: 0, wood: 0, stone: 0, gold: 0 });

export function newGame(now: number, keep?: Partial<GameState>): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    res: { ...START_RESOURCES },
    earned: zero(),
    collected: zero(),
    buildings: [],
    regions: [0],
    heroes: {},
    newHeroes: [],
    quest: { index: 0, base: zero() },
    era: 0,
    stars: 0,
    boostEnd: 0,
    lastSeen: now,
    createdAt: now,
    nextId: 1,
    settings: { sfx: true, music: true, lang: 'auto', quality: 'auto' },
    stats: { taps: 0, upgrades: 0, adsWatched: 0 },
    ...keep,
  };
  s.buildings.push(makeBuilding(s, 'castle', CASTLE_PLOT, 1));
  s.buildings.push(makeBuilding(s, 'walls', WALLS_PLOT, 0));
  return s;
}

function makeBuilding(s: GameState, type: BuildingType, plot: number, level: number): Building {
  return { id: s.nextId++, type, plot, level, pending: zero(), upgradeEnd: 0, upgradeStart: 0 };
}

// ---------- Queries ----------
export const castle = (s: GameState): Building => s.buildings.find((b) => b.type === 'castle')!;
export const walls = (s: GameState): Building => s.buildings.find((b) => b.type === 'walls')!;
export const countOf = (s: GameState, t: BuildingType): number => s.buildings.filter((b) => b.type === t && (b.level > 0 || b.upgradeEnd > 0)).length;
export const builtCount = (s: GameState, t: BuildingType): number => s.buildings.filter((b) => b.type === t && b.level > 0).length;
export const maxLevelOf = (s: GameState, t: BuildingType): number => s.buildings.filter((b) => b.type === t).reduce((m, b) => Math.max(m, b.level), 0);
export const buildingOnPlot = (s: GameState, plot: number): Building | undefined => s.buildings.find((b) => b.plot === plot);
export const heroLevel = (s: GameState, id: HeroId): number => s.heroes[id] ?? 0;

export function population(s: GameState): number {
  return s.buildings.reduce((p, b) => p + (BUILDINGS[b.type].population ?? 0) * b.level, 0);
}

export function builders(s: GameState): number {
  return BASE_BUILDERS + (heroLevel(s, 'wren') > 0 ? 1 : 0);
}

export function activeUpgrades(s: GameState): number {
  return s.buildings.filter((b) => b.upgradeEnd > 0).length;
}

/** Global multiplier (forge, walls, population, stars, heroes, boost) for a resource. */
export function multiplier(s: GameState, res: Res, now: number, includeBoost = true): number {
  let m = 1;
  for (const b of s.buildings) {
    const g = BUILDINGS[b.type].globalBonus;
    if (g) m += g * b.level;
  }
  m *= 1 + population(s) * POP_BONUS;
  m *= 1 + s.stars * STAR_BONUS;
  let hero = 1;
  for (const h of HEROES) {
    const lv = heroLevel(s, h.id);
    if (lv > 0 && h.bonus && (h.bonus.res === 'all' || h.bonus.res === res)) hero += h.bonus.perLevel * lv;
  }
  m *= hero;
  if (includeBoost && s.boostEnd > now) m *= 2;
  return m;
}

export function buildingRate(s: GameState, b: Building, now: number, includeBoost = true): Bundle {
  const def = BUILDINGS[b.type];
  const out: Bundle = {};
  if (b.level <= 0) return out;
  const lm = levelMultiplier(b.level);
  for (const r of RESOURCES) {
    const base = def.produces[r];
    if (base) out[r] = base * lm * multiplier(s, r, now, includeBoost);
  }
  return out;
}

export function totalRates(s: GameState, now: number, includeBoost = true): Record<Res, number> {
  const out = zero();
  for (const b of s.buildings) {
    const r = buildingRate(s, b, now, includeBoost);
    for (const k of RESOURCES) out[k] += r[k] ?? 0;
  }
  return out;
}

export function storageCap(s: GameState, b: Building, res: Res, now: number): number {
  const r = buildingRate(s, b, now, false)[res] ?? 0;
  return Math.max(10, r * STORAGE_SECONDS);
}

// ---------- Mutations ----------
function pay(s: GameState, cost: Bundle): void {
  for (const r of RESOURCES) s.res[r] = Math.max(0, s.res[r] - (cost[r] ?? 0));
}

export function gain(s: GameState, b: Bundle): void {
  for (const r of RESOURCES) {
    const v = b[r] ?? 0;
    s.res[r] += v;
    s.earned[r] += v;
  }
}

export type ActionResult = { ok: true } | { ok: false; reason: 'cost' | 'builders' | 'maxLevel' | 'locked' | 'busy' | 'limit' | 'invalid' };

export function upgradeDuration(s: GameState, b: Building): number {
  return upgradeSeconds(b.type, b.level) * builderTimeFactor(heroLevel(s, 'wren'));
}

export function canBuild(s: GameState, type: BuildingType): ActionResult {
  const def = BUILDINGS[type];
  if (castle(s).level < def.unlockCastle) return { ok: false, reason: 'locked' };
  if (countOf(s, type) >= def.maxCount) return { ok: false, reason: 'limit' };
  if (activeUpgrades(s) >= builders(s)) return { ok: false, reason: 'builders' };
  if (!canAfford(s.res, upgradeCost(type, 0))) return { ok: false, reason: 'cost' };
  return { ok: true };
}

export function build(s: GameState, type: BuildingType, plot: number, now: number): ActionResult {
  if (type === 'castle' || type === 'walls') return { ok: false, reason: 'invalid' };
  const p = buildMap().plots[plot];
  if (!p || !s.regions.includes(p.region) || buildingOnPlot(s, plot)) return { ok: false, reason: 'invalid' };
  const c = canBuild(s, type);
  if (!c.ok) return c;
  pay(s, upgradeCost(type, 0));
  const b = makeBuilding(s, type, plot, 0);
  b.upgradeStart = now;
  b.upgradeEnd = now + upgradeDuration(s, b) * 1000;
  s.buildings.push(b);
  return { ok: true };
}

export function canUpgrade(s: GameState, b: Building): ActionResult {
  if (b.upgradeEnd > 0) return { ok: false, reason: 'busy' };
  const def = BUILDINGS[b.type];
  if (castle(s).level < def.unlockCastle) return { ok: false, reason: 'locked' };
  if (b.level >= maxLevel(b.type, castle(s).level)) return { ok: false, reason: 'maxLevel' };
  if (activeUpgrades(s) >= builders(s)) return { ok: false, reason: 'builders' };
  if (!canAfford(s.res, upgradeCost(b.type, b.level))) return { ok: false, reason: 'cost' };
  return { ok: true };
}

export function startUpgrade(s: GameState, id: number, now: number): ActionResult {
  const b = s.buildings.find((x) => x.id === id);
  if (!b) return { ok: false, reason: 'invalid' };
  const c = canUpgrade(s, b);
  if (!c.ok) return c;
  pay(s, upgradeCost(b.type, b.level));
  b.upgradeStart = now;
  b.upgradeEnd = now + upgradeDuration(s, b) * 1000;
  return { ok: true };
}

/** Instantly completes an upgrade (rewarded ad). */
export function finishUpgradeNow(s: GameState, id: number, now: number): boolean {
  const b = s.buildings.find((x) => x.id === id);
  if (!b || b.upgradeEnd <= 0) return false;
  b.upgradeEnd = now;
  return true;
}

export function collect(s: GameState, id: number): Bundle {
  const b = s.buildings.find((x) => x.id === id);
  const got: Bundle = {};
  if (!b) return got;
  for (const r of RESOURCES) {
    const v = Math.floor(b.pending[r]);
    if (v > 0) {
      got[r] = v;
      b.pending[r] -= v;
      s.collected[r] += v;
    }
  }
  gain(s, got);
  s.stats.taps++;
  return got;
}

export function collectAll(s: GameState): Bundle {
  const total: Bundle = {};
  for (const b of s.buildings) {
    const got = collect(s, b.id);
    for (const r of RESOURCES) if (got[r]) total[r] = (total[r] ?? 0) + got[r]!;
  }
  return total;
}

export function canUnlockRegion(s: GameState, region: number): ActionResult {
  if (region <= 0 || region >= REGION_COUNT || s.regions.includes(region)) return { ok: false, reason: 'invalid' };
  if (nextRegion(s) !== region) return { ok: false, reason: 'locked' };
  if (castle(s).level < regionCastleReq(region)) return { ok: false, reason: 'locked' };
  if (!canAfford(s.res, regionCost(region))) return { ok: false, reason: 'cost' };
  return { ok: true };
}

/** Regions unlock in a fixed, gentle order (front of the island first). */
export function nextRegion(s: GameState): number | null {
  for (let i = 1; i < REGION_COUNT; i++) if (!s.regions.includes(i)) return i;
  return null;
}

export function unlockRegion(s: GameState, region: number): ActionResult {
  const c = canUnlockRegion(s, region);
  if (!c.ok) return c;
  pay(s, regionCost(region));
  s.regions.push(region);
  return { ok: true };
}

export function canLevelHero(s: GameState, id: HeroId): ActionResult {
  const lv = heroLevel(s, id);
  if (lv <= 0) return { ok: false, reason: 'locked' };
  if (lv >= HERO_MAX_LEVEL) return { ok: false, reason: 'maxLevel' };
  if (!canAfford(s.res, heroLevelCost(lv))) return { ok: false, reason: 'cost' };
  return { ok: true };
}

export function levelHero(s: GameState, id: HeroId): ActionResult {
  const c = canLevelHero(s, id);
  if (!c.ok) return c;
  pay(s, heroLevelCost(heroLevel(s, id)));
  s.heroes[id] = heroLevel(s, id) + 1;
  return { ok: true };
}

export function activateBoost(s: GameState, now: number): void {
  s.boostEnd = Math.max(s.boostEnd, now) + BOOST_SECONDS * 1000;
}

// ---------- Milestones / quests ----------
function milestoneReached(s: GameState, m: Milestone): boolean {
  switch (m.kind) {
    case 'level': return maxLevelOf(s, m.building) >= m.level;
    case 'built': return builtCount(s, m.building) >= m.count;
    case 'regions': return s.regions.length - 1 >= m.count;
    case 'era': return s.era >= m.count;
  }
}

export function goalProgress(s: GameState, g: QuestGoal): { value: number; target: number } {
  switch (g.kind) {
    case 'build': return { value: builtCount(s, g.building), target: g.count };
    case 'level': return { value: maxLevelOf(s, g.building), target: g.level };
    case 'collect': return { value: Math.floor(s.collected[g.res] - s.quest.base[g.res]), target: g.amount };
    case 'regions': return { value: s.regions.length - 1, target: g.count };
    case 'population': return { value: population(s), target: g.count };
    case 'heroes': return { value: Object.values(s.heroes).filter((v) => (v ?? 0) > 0).length, target: g.count };
  }
}

export function currentQuest(s: GameState): ReturnType<typeof questAt> {
  return questAt(s.quest.index);
}

export function questDone(s: GameState): boolean {
  const p = goalProgress(s, currentQuest(s).goal);
  return p.value >= p.target;
}

export function questReward(s: GameState, now: number): Bundle {
  const q = currentQuest(s);
  if (q.reward) return q.reward;
  const rates = totalRates(s, now, false);
  const out: Bundle = {};
  for (const r of RESOURCES) if (rates[r] > 0) out[r] = Math.ceil(rates[r] * (q.rewardSeconds ?? 120));
  return out;
}

export function claimQuest(s: GameState, now: number): Bundle | null {
  if (!questDone(s)) return null;
  const reward = questReward(s, now);
  gain(s, reward);
  s.quest.index++;
  s.quest.base = { ...s.collected };
  return reward;
}

// ---------- Simulation ----------
export interface TickEvents {
  finished: Building[];
  heroes: HeroId[];
}

/** Advances the simulation. `now` is wall-clock ms; dt in seconds. */
export function tick(s: GameState, now: number, dt: number): TickEvents {
  const events: TickEvents = { finished: [], heroes: [] };
  const auto = heroLevel(s, 'pip') > 0;
  for (const b of s.buildings) {
    if (b.level > 0 && dt > 0) {
      const rate = buildingRate(s, b, now);
      for (const r of RESOURCES) {
        const v = (rate[r] ?? 0) * dt;
        if (!v) continue;
        if (auto) {
          s.res[r] += v;
          s.earned[r] += v;
          s.collected[r] += v;
        } else {
          b.pending[r] = Math.min(storageCap(s, b, r, now), b.pending[r] + v);
        }
      }
    }
    if (b.upgradeEnd > 0 && now >= b.upgradeEnd) {
      b.level++;
      b.upgradeEnd = 0;
      b.upgradeStart = 0;
      s.stats.upgrades++;
      events.finished.push(b);
    }
  }
  for (const h of HEROES) {
    if (heroLevel(s, h.id) === 0 && milestoneReached(s, h.unlock)) {
      s.heroes[h.id] = 1;
      s.newHeroes.push(h.id);
      events.heroes.push(h.id);
    }
  }
  s.lastSeen = now;
  return events;
}

export interface OfflineReport {
  seconds: number;
  earnings: Record<Res, number>;
}

/** Earnings while the game was closed, capped at 8 hours. Does not mutate state. */
export function offlineEarnings(s: GameState, now: number): OfflineReport | null {
  const seconds = Math.min(OFFLINE_CAP_SECONDS, Math.max(0, (now - s.lastSeen) / 1000));
  if (seconds < OFFLINE_MIN_SECONDS) return null;
  const rates = totalRates(s, s.lastSeen, false);
  const earnings = zero();
  let any = false;
  for (const r of RESOURCES) {
    earnings[r] = Math.floor(rates[r] * seconds);
    if (earnings[r] > 0) any = true;
  }
  return any ? { seconds, earnings } : null;
}

export function applyOffline(s: GameState, report: OfflineReport, factor: number): void {
  gain(s, Object.fromEntries(RESOURCES.map((r) => [r, report.earnings[r] * factor])) as Bundle);
}

// ---------- Era ----------
export function canStartEra(s: GameState): boolean {
  return castle(s).level >= ERA_CASTLE_LEVEL;
}

export function starsOnNewEra(s: GameState): number {
  const bonus = 1 + 0.25 * heroLevel(s, 'ysolde');
  return Math.floor(starsForLifetimeGold(s.earned.gold) * bonus);
}

export function startNewEra(s: GameState, now: number): GameState | null {
  if (!canStartEra(s)) return null;
  const stars = s.stars + Math.max(1, starsOnNewEra(s));
  const next = newGame(now, {
    era: s.era + 1,
    stars,
    heroes: { ...s.heroes },
    settings: { ...s.settings },
    stats: { ...s.stats },
    createdAt: s.createdAt,
  });
  // Unlock heroes tied to eras right away.
  tick(next, now, 0);
  return next;
}

export { canAfford, upgradeCost, regionCost, regionCastleReq, maxLevel };
