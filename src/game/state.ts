// Game state and all player actions (pure logic, no DOM / Three.js). Times: `now` = wall clock ms,
// `s.play` = active play seconds (used for raids and live events so nothing attacks while the game is closed).
import {
  BARN_BASE, BARN_STEP, BUILDINGS, DECOR, HEROES, ITEMS, ITEM_IDS, OFFLINE_CAP, RECIPES, RESEARCH, SKINS,
  campEnemies, campLevel, campScale, heroDef, recipe, researchCost, xpForLevel,
  type Bag, type BType, type DecorId, type HeroId, type ItemId, type Recipe, type ResearchId, type SkinId,
} from './defs';
import { Battle, enemyPower, type BattleSetup, type SquadHero } from './battle';
import { buildMap, hexDist, key } from './map';
import { Rng } from './rng';

export const SAVE_VERSION = 2;
export const CASTLE_PLOT = -2;
export const WALLS_PLOT = -1;

export interface Job { recipe: string; start: number; end: number }

export interface Building {
  id: number;
  type: BType;
  plot: number;
  level: number;
  /** Construction finishes at this time (0 = built). */
  buildEnd: number;
  buildStart: number;
  /** Factories: sequential queue (head runs). Animals: one job per animal (parallel). Fields: one crop. */
  jobs: Job[];
  /** Finished products waiting in the bubble. */
  ready: string[];
}

export interface HeroState { level: number; xp: number; stars: number; hp: number; hpAt: number; weapon: boolean; shield: boolean; buff: boolean }

export interface Order { id: number; lines: [ItemId, number][]; gold: number; xp: number; tool?: ItemId; readyAt: number }
export interface Crate { item: ItemId; qty: number; done: boolean }
export interface Cart { arrive: number; leave: number; crates: Crate[]; bonusClaimed: boolean }
export interface Chest { id: number; q: number; r: number; big: boolean }
export interface Offer { item: ItemId; qty: number; gold: number; gems: number; sold: boolean }
export interface Task { kind: 'harvest' | 'produce' | 'orders' | 'battles' | 'chests'; target: number; progress: number }

export interface Settings { sfx: boolean; music: boolean; lang: 'en' | 'fr' | 'auto'; quality: 'auto' | 'high' | 'low' }

export interface GameState {
  version: number;
  gold: number;
  gems: number;
  xp: number;
  level: number;
  items: Bag;
  barnLevel: number;
  buildings: Building[];
  regions: number[];
  heroes: Partial<Record<HeroId, HeroState>>;
  troops: { soldier: number; archer: number };
  orders: Order[];
  cart: Cart | null;
  nextCartAt: number;
  raidAt: number;
  chests: Chest[];
  nextChestAt: number;
  visitor: { hero: HeroId; until: number; gold: number; gems: number } | null;
  visitorsSeen: HeroId[];
  market: { offers: Offer[]; refreshAt: number };
  research: Record<ResearchId, number>;
  decor: { id: DecorId; q: number; r: number }[];
  skin: SkinId;
  skins: SkinId[];
  extraSlots: Partial<Record<BType, number>>;
  boostUntil: number;
  ruinsDone: number[];
  daily: { day: string; tasks: Task[]; claimed: boolean };
  weekly: { week: string; points: number; pending: number };
  stats: Record<string, number>;
  made: Record<string, number>;
  tutorial: number;
  seed: number;
  play: number;
  taxAcc: number;
  /** Play time of the last notable event (used to keep something happening). */
  calmSince: number;
  lastSeen: number;
  createdAt: number;
  nextId: number;
  settings: Settings;
}

// ---------- Events (drained by the UI / simulation) ----------
export type GameEvent =
  | { type: 'levelUp'; level: number }
  | { type: 'built'; id: number; btype: BType }
  | { type: 'ready'; id: number }
  | { type: 'order'; gold: number }
  | { type: 'raidWarn'; inSec: number }
  | { type: 'raid' }
  | { type: 'chest'; id: number }
  | { type: 'visitor'; hero: HeroId }
  | { type: 'cartArrive' }
  | { type: 'cartLeave'; complete: boolean }
  | { type: 'heroJoin'; hero: HeroId }
  | { type: 'region'; region: number }
  | { type: 'barnFull' }
  | { type: 'goal'; index: number }
  | { type: 'market' }
  | { type: 'task'; kind: Task['kind'] }
  | { type: 'gift'; gold: number; item?: ItemId; qty?: number };

let events: GameEvent[] = [];
const emit = (e: GameEvent): void => { events.push(e); };
export function drainEvents(): GameEvent[] { const e = events; events = []; return e; }

const zeroResearch = (): Record<ResearchId, number> => ({ farming: 0, industry: 0, warfare: 0, building: 0 });

export function newGame(now: number, keep?: Partial<GameState>): GameState {
  const s: GameState = {
    version: SAVE_VERSION, gold: 60, gems: 10, xp: 0, level: 1,
    items: { wheat: 6, wood: 4 }, barnLevel: 1, buildings: [], regions: [0],
    heroes: { knight: { level: 1, xp: 0, stars: 1, hp: 1, hpAt: now, weapon: false, shield: false, buff: false } },
    troops: { soldier: 0, archer: 0 }, orders: [], cart: null, nextCartAt: 470, raidAt: 300,
    chests: [], nextChestAt: 75, visitor: null, visitorsSeen: [],
    market: { offers: [], refreshAt: 0 }, research: zeroResearch(), decor: [], skin: 'red', skins: ['red'],
    extraSlots: {}, boostUntil: 0, ruinsDone: [],
    daily: { day: '', tasks: [], claimed: false }, weekly: { week: '', points: 0, pending: 0 },
    stats: {}, made: {}, tutorial: 0, seed: 12345, play: 0, taxAcc: 0, calmSince: 0, lastSeen: now, createdAt: now, nextId: 1,
    settings: { sfx: true, music: true, lang: 'auto', quality: 'auto' },
    ...keep,
  };
  const add = (type: BType, plot: number, level = 1): Building => {
    const b: Building = { id: s.nextId++, type, plot, level, buildEnd: 0, buildStart: 0, jobs: [], ready: [] };
    s.buildings.push(b);
    return b;
  };
  add('castle', CASTLE_PLOT);
  add('walls', WALLS_PLOT);
  add('barn', 0);
  add('orders', 1);
  add('field', 2);
  add('field', 3);
  add('bakery', 4);
  add('lumber', 5);
  s.orders = [makeOrder(s, now, 0), makeOrder(s, now, 1)];
  rollDaily(s, now);
  return s;
}

// ---------- Helpers ----------
const rngOf = (s: GameState): Rng => { const r = new Rng(s.seed); return r; };
function roll(s: GameState): number { const r = new Rng(s.seed); const v = r.next(); s.seed = r.state; return v; }
function rint(s: GameState, a: number, b: number): number { return a + Math.floor(roll(s) * (b - a + 1)); }
function rpick<T>(s: GameState, arr: readonly T[]): T { return arr[Math.floor(roll(s) * arr.length)]; }
void rngOf;

export const stat = (s: GameState, k: string): number => s.stats[k] ?? 0;
const bump = (s: GameState, k: string, n = 1): void => { s.stats[k] = stat(s, k) + n; };

export const count = (s: GameState, item: ItemId): number => s.items[item] ?? 0;
export function hasAll(s: GameState, bag: Bag): boolean {
  return (Object.keys(bag) as ItemId[]).every((k) => count(s, k) >= (bag[k] ?? 0));
}
function take(s: GameState, bag: Bag): void {
  for (const k of Object.keys(bag) as ItemId[]) s.items[k] = count(s, k) - (bag[k] ?? 0);
}
export function barnCap(s: GameState): number {
  return BARN_BASE + BARN_STEP * (s.barnLevel - 1) + s.research.building * 10;
}
export function barnUsed(s: GameState): number {
  return ITEM_IDS.reduce((a, k) => a + (ITEMS[k].cat === 'tools' ? 0 : count(s, k)), 0);
}
export const barnFree = (s: GameState): number => Math.max(0, barnCap(s) - barnUsed(s));
/** Adds items to the barn (tools are unlimited). Returns how many were stored. */
export function give(s: GameState, item: ItemId, n: number, force = false): number {
  const room = ITEMS[item].cat === 'tools' || force ? n : Math.min(n, barnFree(s));
  if (room > 0) s.items[item] = count(s, item) + room;
  return room;
}

export function addXp(s: GameState, xp: number): void {
  s.xp += Math.round(xp);
  while (s.xp >= xpForLevel(s.level + 1)) {
    s.level++;
    s.gems += 3;
    s.gold += 20 * s.level;
    emit({ type: 'levelUp', level: s.level });
    // A bigger order board after level 3.
    if (s.level === 3 && s.orders.length < 3) s.orders.push(makeOrder(s, 0, -1));
  }
}

export const castle = (s: GameState): Building => s.buildings.find((b) => b.type === 'castle')!;
export const walls = (s: GameState): Building => s.buildings.find((b) => b.type === 'walls')!;
export const buildingOf = (s: GameState, t: BType): Building | undefined => s.buildings.find((b) => b.type === t && b.buildEnd === 0);
export const buildingOnPlot = (s: GameState, plot: number): Building | undefined => s.buildings.find((b) => b.plot === plot);
export const owned = (s: GameState, t: BType): number => s.buildings.filter((b) => b.type === t).length;
export const isUnlocked = (s: GameState, item: ItemId): boolean => ITEMS[item].level <= s.level;

// ---------- Speeds ----------
export function heroBonus(s: GameState, building: BType): number {
  let k = 1;
  for (const h of HEROES) {
    const st = s.heroes[h.id];
    if (st && h.bonus.building === building) k += h.bonus.pct * st.stars;
  }
  return k;
}

export function jobTime(s: GameState, r: Recipe, now: number): number {
  const kind = BUILDINGS[r.building].kind;
  let t = r.time;
  if (kind === 'field' || kind === 'animal') t *= 1 - RESEARCH.farming.effect * s.research.farming;
  else t *= 1 - RESEARCH.industry.effect * s.research.industry;
  t /= heroBonus(s, r.building);
  if (s.boostUntil > now) t /= 2;
  return Math.max(2, Math.round(t * 10) / 10);
}

export function slots(s: GameState, b: Building): number {
  return BUILDINGS[b.type].slots + (s.extraSlots[b.type] ?? 0);
}

// ---------- Construction ----------
export type Result = { ok: true } | { ok: false; reason: 'gold' | 'gems' | 'items' | 'level' | 'limit' | 'busy' | 'barn' | 'invalid' | 'full' };

export function canBuild(s: GameState, type: BType): Result {
  const d = BUILDINGS[type];
  if (d.kind === 'special' && type !== 'market') return { ok: false, reason: 'invalid' };
  if (s.level < d.level) return { ok: false, reason: 'level' };
  if (owned(s, type) >= d.max(s.level)) return { ok: false, reason: 'limit' };
  if (s.gold < buildCost(s, type).gold) return { ok: false, reason: 'gold' };
  const { gold: _g, ...items } = buildCost(s, type);
  void _g;
  if (!hasAll(s, items as Bag)) return { ok: false, reason: 'items' };
  return { ok: true };
}

export function buildCost(s: GameState, type: BType): { gold: number } & Bag {
  const c = { ...BUILDINGS[type].cost };
  if (type === 'field') c.gold = 15 + 10 * Math.max(0, owned(s, 'field') - 2);
  return c;
}

export function build(s: GameState, type: BType, plot: number, now: number): Result {
  const p = buildMap().plots[plot];
  if (!p || !s.regions.includes(p.region) || buildingOnPlot(s, plot)) return { ok: false, reason: 'invalid' };
  const c = canBuild(s, type);
  if (!c.ok) return c;
  const { gold, ...items } = buildCost(s, type);
  s.gold -= gold;
  take(s, items as Bag);
  const t = BUILDINGS[type].build * (1 - RESEARCH.building.effect * s.research.building);
  s.buildings.push({ id: s.nextId++, type, plot, level: 1, buildStart: now, buildEnd: now + t * 1000, jobs: [], ready: [] });
  addXp(s, 3 + BUILDINGS[type].level * 2);
  return { ok: true };
}

// ---------- Production ----------
export function recipesFor(type: BType): Recipe[] {
  return RECIPES.filter((r) => r.building === type);
}

export function canStart(s: GameState, b: Building, r: Recipe): Result {
  if (b.buildEnd > 0) return { ok: false, reason: 'busy' };
  if (r.building !== b.type || s.level < r.level) return { ok: false, reason: 'level' };
  const kind = BUILDINGS[b.type].kind;
  if (kind === 'field' && (b.jobs.length > 0 || b.ready.length > 0)) return { ok: false, reason: 'busy' };
  // Animals keep their product until it is collected; factories have a queue.
  if (kind === 'animal' && b.jobs.length + b.ready.length >= slots(s, b)) return { ok: false, reason: 'full' };
  if (kind === 'factory' && b.jobs.length >= slots(s, b)) return { ok: false, reason: 'full' };
  if ((r.gold ?? 0) > s.gold) return { ok: false, reason: 'gold' };
  if (!hasAll(s, r.inputs)) return { ok: false, reason: 'items' };
  return { ok: true };
}

/** Plant a crop, feed an animal or queue a product. */
export function start(s: GameState, buildingId: number, recipeId: string, now: number): Result {
  const b = s.buildings.find((x) => x.id === buildingId);
  if (!b) return { ok: false, reason: 'invalid' };
  const r = recipe(recipeId);
  const c = canStart(s, b, r);
  if (!c.ok) return c;
  s.gold -= r.gold ?? 0;
  take(s, r.inputs);
  const kind = BUILDINGS[b.type].kind;
  const t = jobTime(s, r, now) * 1000;
  const sequential = kind === 'factory';
  const last = b.jobs[b.jobs.length - 1];
  const startAt = sequential && last ? last.end : now;
  b.jobs.push({ recipe: r.id, start: startAt, end: startAt + t });
  return { ok: true };
}

/** Animal farms: feed every free animal at once. */
export function feedAll(s: GameState, buildingId: number, now: number): number {
  const b = s.buildings.find((x) => x.id === buildingId);
  if (!b) return 0;
  const r = recipesFor(b.type)[0];
  let n = 0;
  while (start(s, buildingId, r.id, now).ok) n++;
  return n;
}

/** Collects finished products into the barn (troops go to the army). */
export function collect(s: GameState, buildingId: number): Bag & { soldier?: number; archer?: number } {
  const b = s.buildings.find((x) => x.id === buildingId);
  const got: Bag & { soldier?: number; archer?: number } = {};
  if (!b) return got;
  const keep: string[] = [];
  let full = false;
  for (const rid of b.ready) {
    const r = recipe(rid);
    if (r.out === 'soldier' || r.out === 'archer') {
      s.troops[r.out]++;
      got[r.out] = (got[r.out] ?? 0) + 1;
      addXp(s, r.xp);
      continue;
    }
    const stored = give(s, r.out, r.qty);
    if (stored < r.qty) { full = true; keep.push(rid); if (stored > 0) s.items[r.out] = count(s, r.out) - stored; continue; }
    got[r.out] = (got[r.out] ?? 0) + stored;
    addXp(s, r.xp);
    s.made[r.id] = (s.made[r.id] ?? 0) + 1;
    const cat = ITEMS[r.out].cat;
    if (cat === 'crops') { bump(s, 'crops', stored); taskProgress(s, 'harvest', stored); }
    else { bump(s, 'goods', stored); taskProgress(s, 'produce', stored); }
  }
  b.ready = keep;
  if (full) emit({ type: 'barnFull' });
  return got;
}

/** Instantly finishes the running job / construction (rewarded ad or gems). */
export function finishNow(s: GameState, buildingId: number, now: number): boolean {
  const b = s.buildings.find((x) => x.id === buildingId);
  if (!b) return false;
  if (b.buildEnd > now) { b.buildEnd = now; return true; }
  const head = b.jobs[0];
  if (!head) return false;
  const shift = Math.max(0, head.end - now);
  if (BUILDINGS[b.type].kind === 'factory') for (const j of b.jobs) { j.end -= shift; j.start = Math.max(now, j.start - shift); }
  else head.end = now;
  return true;
}

export const skipCost = (msLeft: number): number => Math.max(1, Math.ceil(msLeft / 1000 / 60));

export function activateBoost(s: GameState, now: number, minutes: number): void {
  const until = Math.max(s.boostUntil, now) + minutes * 60_000;
  // Running jobs speed up too.
  for (const b of s.buildings) for (const j of b.jobs) if (j.end > now) j.end = now + (j.end - now) / 2;
  s.boostUntil = until;
}

// ---------- Orders ----------
const ORDER_POOL: ItemId[] = ['wheat', 'flour', 'bread', 'egg', 'wood', 'stone', 'corn', 'pie', 'ore', 'milk', 'sword', 'cheese', 'butter', 'carrot', 'bow', 'stew', 'cotton', 'cloth', 'wool', 'cake', 'shield', 'banner'];

/** Items the player can actually make right now (crops, or a recipe in a building they own). */
export function producible(s: GameState, item: ItemId): boolean {
  return RECIPES.some((r) => r.out === item && r.level <= s.level && (r.building === 'field' || s.buildings.some((b) => b.type === r.building)));
}

export function makeOrder(s: GameState, now: number, scripted: number): Order {
  let lines: [ItemId, number][];
  if (scripted === 0) lines = [['wheat', 2]];
  else if (scripted === 1) lines = [['bread', 1]];
  else {
    const all = ORDER_POOL.filter((i) => isUnlocked(s, i) && producible(s, i));
    const fresh = all.filter((i) => ITEMS[i].level >= s.level - 3);
    const pool = fresh.length >= 2 ? fresh : all;
    const n = Math.min(pool.length, s.level < 3 ? rint(s, 1, 2) : rint(s, 1, 3));
    const chosen = new Set<ItemId>();
    while (chosen.size < n) chosen.add(rpick(s, pool));
    // Cheap goods come in handfuls, slow crafted goods one or two at a time.
    lines = [...chosen].map((i) => {
      const p = ITEMS[i].price;
      const base = p < 6 ? rint(s, 2, 4) : p < 15 ? rint(s, 1, 3) : rint(s, 1, 2);
      return [i, Math.max(1, Math.round(base * (1 + s.level * 0.05)))];
    });
  }
  const value = lines.reduce((a, [i, q]) => a + ITEMS[i].price * q, 0);
  const tool = scripted < 0 && s.level >= 2 && roll(s) < 0.22 ? rpick(s, ['hammer', 'nails', 'paint'] as ItemId[]) : undefined;
  return { id: s.nextId++, lines, gold: Math.round(value * 1.6 + 6), xp: Math.round(value * 0.45 + 3), tool, readyAt: now };
}

export function canDeliver(s: GameState, o: Order, now: number): boolean {
  return o.readyAt <= now && o.lines.every(([i, q]) => count(s, i) >= q);
}

export function deliver(s: GameState, orderId: number, now: number): Order | null {
  const idx = s.orders.findIndex((o) => o.id === orderId);
  const o = s.orders[idx];
  if (!o || !canDeliver(s, o, now)) return null;
  for (const [i, q] of o.lines) s.items[i] = count(s, i) - q;
  const beauty = 1 + s.decor.reduce((a, d) => a + DECOR[d.id].beauty, 0);
  const gold = Math.round(o.gold * beauty * heroBonus(s, 'market'));
  s.gold += gold;
  addXp(s, o.xp);
  if (o.tool) give(s, o.tool, 1);
  bump(s, 'orders');
  taskProgress(s, 'orders', 1);
  weekly(s, 10);
  const next = makeOrder(s, now + 12_000, -1);
  s.orders[idx] = next;
  emit({ type: 'order', gold });
  return { ...o, gold };
}

export function discardOrder(s: GameState, orderId: number, now: number): void {
  const idx = s.orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return;
  s.orders[idx] = makeOrder(s, now + 45_000, -1);
}

// ---------- Cart (big orders) ----------
export function fillCrate(s: GameState, i: number): boolean {
  const c = s.cart?.crates[i];
  if (!s.cart || !c || c.done || count(s, c.item) < c.qty) return false;
  s.items[c.item] = count(s, c.item) - c.qty;
  c.done = true;
  s.gold += Math.round(ITEMS[c.item].price * c.qty * 1.7);
  addXp(s, Math.round(ITEMS[c.item].price * c.qty * 0.6));
  weekly(s, 15);
  if (s.cart.crates.every((x) => x.done) && !s.cart.bonusClaimed) {
    s.cart.bonusClaimed = true;
    s.gems += 5;
    give(s, 'hammer', 1); give(s, 'nails', 1); give(s, 'paint', 1);
  }
  return true;
}

function spawnCart(s: GameState): void {
  const pool = ORDER_POOL.filter((i) => isUnlocked(s, i) && producible(s, i));
  const n = Math.min(6, 3 + Math.floor(s.level / 4));
  const crates: Crate[] = [];
  for (let k = 0; k < n; k++) {
    const item = rpick(s, pool);
    crates.push({ item, qty: Math.max(2, Math.round((ITEMS[item].price < 6 ? 6 : 3) * (1 + s.level * 0.1))), done: false });
  }
  s.cart = { arrive: s.play, leave: s.play + 600, crates, bonusClaimed: false };
  emit({ type: 'cartArrive' });
}

// ---------- Heroes ----------
export function heroHp(h: HeroState, now: number): number {
  return Math.min(1, h.hp + Math.max(0, now - h.hpAt) / 1000 / 150);
}

export function heroMult(s: GameState, h: HeroState): number {
  return (1 + 0.15 * (h.level - 1)) * (1 + 0.25 * (h.stars - 1)) * (1 + RESEARCH.warfare.effect * s.research.warfare);
}

export function heroPower(s: GameState, id: HeroId): number {
  const h = s.heroes[id];
  if (!h) return 0;
  const d = heroDef(id);
  const k = heroMult(s, h);
  const hp = d.hp * k * (h.shield ? 1.25 : 1);
  const atk = d.atk * k + (h.weapon ? 5 + h.level : 0);
  return Math.round(hp / 10 + (atk / d.interval) * 2.2);
}

export const heroXpNeed = (level: number): number => Math.round(30 * Math.pow(level, 1.4));
export const heroTrainCost = (level: number): number => Math.round(50 * Math.pow(level, 1.6));
export const heroMaxLevel = (s: GameState): number => 5 + castle(s).level * 5;
export const starCost = (stars: number): { gold: number; banner: number } => ({ gold: 400 * stars * stars, banner: stars });

export function trainHero(s: GameState, id: HeroId): Result {
  const h = s.heroes[id];
  if (!h) return { ok: false, reason: 'invalid' };
  if (h.level >= heroMaxLevel(s)) return { ok: false, reason: 'limit' };
  if (h.xp < heroXpNeed(h.level)) return { ok: false, reason: 'level' };
  const c = heroTrainCost(h.level);
  if (s.gold < c) return { ok: false, reason: 'gold' };
  s.gold -= c;
  h.xp -= heroXpNeed(h.level);
  h.level++;
  return { ok: true };
}

export function starUp(s: GameState, id: HeroId): Result {
  const h = s.heroes[id];
  if (!h || h.stars >= 5) return { ok: false, reason: 'limit' };
  const c = starCost(h.stars);
  if (s.gold < c.gold) return { ok: false, reason: 'gold' };
  if (count(s, 'banner') < c.banner) return { ok: false, reason: 'items' };
  s.gold -= c.gold;
  s.items.banner = count(s, 'banner') - c.banner;
  h.stars++;
  return { ok: true };
}

export function equip(s: GameState, id: HeroId, slot: 'weapon' | 'shield'): Result {
  const h = s.heroes[id];
  if (!h || h[slot]) return { ok: false, reason: 'invalid' };
  const item: ItemId = slot === 'weapon' ? heroDef(id).weapon : 'shield';
  if (count(s, item) < 1) return { ok: false, reason: 'items' };
  s.items[item] = count(s, item) - 1;
  h[slot] = true;
  return { ok: true };
}

/** Meals: pie heals 50% and gives +20% attack next battle, stew heals fully. */
export function feedHero(s: GameState, id: HeroId, meal: 'pie' | 'stew', now: number): Result {
  const h = s.heroes[id];
  if (!h) return { ok: false, reason: 'invalid' };
  if (count(s, meal) < 1) return { ok: false, reason: 'items' };
  s.items[meal] = count(s, meal) - 1;
  h.hp = Math.min(1, heroHp(h, now) + (meal === 'stew' ? 1 : 0.5));
  h.hpAt = now;
  if (meal === 'pie') h.buff = true;
  return { ok: true };
}

export function recruitVisitor(s: GameState, now: number): Result {
  const v = s.visitor;
  if (!v) return { ok: false, reason: 'invalid' };
  if (s.gold < v.gold) return { ok: false, reason: 'gold' };
  if (s.gems < v.gems) return { ok: false, reason: 'gems' };
  s.gold -= v.gold;
  s.gems -= v.gems;
  s.heroes[v.hero] = { level: 1, xp: 0, stars: 1, hp: 1, hpAt: now, weapon: false, shield: false, buff: false };
  emit({ type: 'heroJoin', hero: v.hero });
  s.visitor = null;
  return { ok: true };
}

const VISITORS: { hero: HeroId; level: number; play: number; gold: number; gems: number; after?: HeroId }[] = [
  { hero: 'ranger', level: 1, play: 420, gold: 0, gems: 0 },
  { hero: 'mage', level: 5, play: 0, gold: 300, gems: 0, after: 'ranger' },
  { hero: 'rogue', level: 7, play: 0, gold: 0, gems: 20, after: 'mage' },
  { hero: 'barbarian', level: 9, play: 0, gold: 1200, gems: 0, after: 'rogue' },
];

// ---------- Battles ----------
export function squad(s: GameState, now: number, ids?: HeroId[]): SquadHero[] {
  const list = (ids ?? (Object.keys(s.heroes) as HeroId[]).sort((a, b) => heroPower(s, b) - heroPower(s, a)).slice(0, 3))
    .filter((id) => s.heroes[id] && heroHp(s.heroes[id]!, now) > 0.12);
  return list.map((id) => {
    const h = s.heroes[id]!;
    return { id, level: h.level, stars: h.stars, hp: heroHp(h, now), power: heroMult(s, h), buff: h.buff ? 0.2 : 0, weaponBonus: h.weapon ? 5 + h.level : 0, shieldBonus: h.shield ? 0.25 : 0 };
  });
}

export function nextRegion(s: GameState): number | null {
  for (let i = 1; i < 13; i++) if (!s.regions.includes(i)) return i;
  return null;
}

export function campSetup(s: GameState, region: number, now: number, ids?: HeroId[]): BattleSetup {
  const t = { soldier: Math.min(s.troops.soldier, 3), archer: Math.min(s.troops.archer, 3) };
  return { heroes: squad(s, now, ids), troops: t, enemies: campEnemies(region), enemyScale: campScale(region), towers: 0, towerAtk: 0, seed: (s.seed ^ (region * 7919)) >>> 0, mode: 'camp' };
}

export function campPower(region: number): number {
  return enemyPower(campEnemies(region), campScale(region));
}

export function squadPower(s: GameState, now: number, ids?: HeroId[]): number {
  return squad(s, now, ids).reduce((a, h) => a + Math.round(heroPower(s, h.id) * (0.4 + 0.6 * h.hp)), 0) + Math.min(s.troops.soldier, 3) * 12 + Math.min(s.troops.archer, 3) * 11;
}

export function canAttack(s: GameState, region: number, now: number): Result {
  if (nextRegion(s) !== region) return { ok: false, reason: 'invalid' };
  if (s.level < campLevel(region)) return { ok: false, reason: 'level' };
  // The first camp wakes up once the farm is running (after the coop goal).
  if (region === 1 && s.tutorial < GOALS.findIndex((g) => g.id === 'camp')) return { ok: false, reason: 'level' };
  if (!squad(s, now).length) return { ok: false, reason: 'busy' };
  return { ok: true };
}

export interface BattleReward { gold: number; gems: number; xp: number; heroXp: number; items: Bag }

export function campReward(region: number): BattleReward {
  const tools: ItemId[] = ['hammer', 'nails', 'paint'];
  const items: Bag = { [tools[region % 3]]: 1 + Math.floor(region / 3), [tools[(region + 1) % 3]]: 1 };
  return { gold: 40 + 45 * region, gems: 3 + region, xp: 8 + 6 * region, heroXp: 20 + 15 * region, items };
}

/** Applies the outcome of a camp battle. */
export function finishCamp(s: GameState, region: number, battle: Battle, now: number): BattleReward | null {
  applyHeroDamage(s, battle, now);
  if (battle.winner !== 0) return null;
  const r = campReward(region);
  s.gold += r.gold;
  s.gems += r.gems;
  for (const [k, v] of Object.entries(r.items) as [ItemId, number][]) give(s, k, v, true);
  for (const h of battle.setup.heroes) { const st = s.heroes[h.id]; if (st) st.xp += r.heroXp; }
  addXp(s, r.xp);
  s.regions.push(region);
  bump(s, 'battles');
  taskProgress(s, 'battles', 1);
  weekly(s, 30);
  // Treasure revealed in the new land.
  const reg = buildMap().regions[region];
  const free = reg.cells.map((k) => buildMap().cells.get(k)!).filter((c) => c.kind === 'decor' || c.kind === 'grass');
  if (free.length) { const c = free[Math.floor(roll(s) * free.length)]; s.chests.push({ id: s.nextId++, q: c.q, r: c.r, big: true }); }
  emit({ type: 'region', region });
  return r;
}

function applyHeroDamage(s: GameState, battle: Battle, now: number): void {
  for (const h of battle.setup.heroes) {
    const st = s.heroes[h.id];
    if (!st) continue;
    st.hp = Math.max(0.05, battle.heroHp(h.id));
    st.hpAt = now;
    st.buff = false;
  }
  const left = battle.troopsLeft();
  s.troops.soldier -= battle.setup.troops.soldier - left.soldier;
  s.troops.archer -= battle.setup.troops.archer - left.archer;
}

// ---------- Raids ----------
export function raidSetup(s: GameState, now: number): BattleSetup {
  // Raids grow slowly with each wave so the first ones are easy and readable.
  const r = stat(s, 'raids') + stat(s, 'raidsLost');
  const n = Math.min(8, 3 + Math.floor(r / 2));
  const enemies = Array.from({ length: n }, (_, i) => (r >= 2 && i % 3 === 2 ? 'warrior' : r >= 4 && i % 4 === 3 ? 'smage' : 'minion') as 'minion');
  const towers = Math.min(4, walls(s).level);
  return {
    heroes: squad(s, now), troops: { soldier: Math.min(s.troops.soldier, 3), archer: Math.min(s.troops.archer, 3) },
    enemies, enemyScale: 1 + 0.08 * r + 0.04 * (s.level - 1), towers, towerAtk: 4 + 3 * walls(s).level, seed: (s.seed ^ 0x9e3779b9) >>> 0, mode: 'raid',
  };
}

export interface RaidResult { win: boolean; gold: number; gems: number; lost: Bag }

export function finishRaid(s: GameState, battle: Battle, now: number): RaidResult {
  applyHeroDamage(s, battle, now);
  s.raidAt = s.play + 240 + Math.floor(roll(s) * 60);
  if (battle.winner === 0) {
    const gold = 15 + 8 * s.level, gems = 1 + (roll(s) < 0.5 ? 1 : 0);
    s.gold += gold;
    s.gems += gems;
    addXp(s, 8 + s.level * 2);
    bump(s, 'raids');
    taskProgress(s, 'battles', 1);
    weekly(s, 20);
    return { win: true, gold, gems, lost: {} };
  }
  // Losing only costs a few goods, never buildings or progress.
  const lost: Bag = {};
  const pool = ITEM_IDS.filter((i) => ['crops', 'goods', 'animal'].includes(ITEMS[i].cat) && count(s, i) > 0);
  for (let k = 0; k < 4 && pool.length; k++) {
    const i = rpick(s, pool);
    if (count(s, i) > 0) { s.items[i] = count(s, i) - 1; lost[i] = (lost[i] ?? 0) + 1; }
  }
  bump(s, 'raidsLost');
  return { win: false, gold: 0, gems: 0, lost };
}

// ---------- Chests, ruins ----------
export function openChest(s: GameState, id: number): { gold: number; gems: number; items: Bag } | null {
  const i = s.chests.findIndex((c) => c.id === id);
  if (i < 0) return null;
  const c = s.chests[i];
  s.chests.splice(i, 1);
  const out = { gold: 0, gems: 0, items: {} as Bag };
  const r = roll(s);
  if (c.big) { out.gold = 40 + 15 * s.level; out.gems = 3; out.items = { [rpick(s, ['hammer', 'nails', 'paint'] as ItemId[])]: 1 }; }
  else if (r < 0.5) out.gold = 15 + rint(s, 0, 20) + 5 * s.level;
  else if (r < 0.78) out.items = { [rpick(s, ['hammer', 'nails', 'paint'] as ItemId[])]: 1 };
  else out.gems = rint(s, 1, 3);
  s.gold += out.gold;
  s.gems += out.gems;
  for (const [k, v] of Object.entries(out.items) as [ItemId, number][]) give(s, k, v, true);
  bump(s, 'chests');
  taskProgress(s, 'chests', 1);
  return out;
}

export const ruinsCost = (region: number): Bag => ({ wood: 4 + region, stone: 4 + region, ...(region >= 4 ? { ore: region } : {}) });

export function restoreRuins(s: GameState, region: number): Result {
  if (s.ruinsDone.includes(region) || !s.regions.includes(region)) return { ok: false, reason: 'invalid' };
  const c = ruinsCost(region);
  if (!hasAll(s, c)) return { ok: false, reason: 'items' };
  take(s, c);
  s.ruinsDone.push(region);
  s.gems += 8;
  s.gold += 80 + 20 * region;
  addXp(s, 20 + 5 * region);
  return { ok: true };
}

// ---------- Barn, castle, walls ----------
export const barnUpgradeCost = (level: number): { gold: number } & Bag => ({ gold: 80 * level, hammer: level, nails: level, paint: Math.max(0, level - 1) });
export const castleUpgradeCost = (level: number): { gold: number } & Bag => ({ gold: Math.round(250 * Math.pow(level, 1.9)), stone: 8 * level, wood: 8 * level, hammer: level, nails: level });
export const wallsUpgradeCost = (level: number): { gold: number } & Bag => ({ gold: 60 * level, stone: 5 * level, wood: 4 * level });

function payCost(s: GameState, c: { gold: number } & Bag): Result {
  if (s.gold < c.gold) return { ok: false, reason: 'gold' };
  const { gold, ...items } = c;
  if (!hasAll(s, items as Bag)) return { ok: false, reason: 'items' };
  s.gold -= gold;
  take(s, items as Bag);
  return { ok: true };
}

export function upgradeBarn(s: GameState): Result {
  const r = payCost(s, barnUpgradeCost(s.barnLevel));
  if (r.ok) { s.barnLevel++; addXp(s, 10); }
  return r;
}
export function upgradeCastle(s: GameState): Result {
  if (castle(s).level >= 1 + Math.floor(s.level / 3)) return { ok: false, reason: 'level' };
  const r = payCost(s, castleUpgradeCost(castle(s).level));
  if (r.ok) { castle(s).level++; addXp(s, 25); }
  return r;
}
export function upgradeWalls(s: GameState): Result {
  if (walls(s).level >= 2 + s.level) return { ok: false, reason: 'level' };
  const r = payCost(s, wallsUpgradeCost(walls(s).level));
  if (r.ok) { walls(s).level++; addXp(s, 8); }
  return r;
}

// ---------- Market & shop ----------
export function refreshMarket(s: GameState, now: number): void {
  const pool = ITEM_IDS.filter((i) => isUnlocked(s, i) && ITEMS[i].cat !== 'tools');
  const offers: Offer[] = [];
  for (let k = 0; k < 4; k++) {
    const item = rpick(s, pool);
    const qty = ITEMS[item].price < 8 ? rint(s, 3, 6) : rint(s, 1, 3);
    offers.push({ item, qty, gold: Math.round(ITEMS[item].price * qty * 1.25), gems: 0, sold: false });
  }
  const tool = rpick(s, ['hammer', 'nails', 'paint'] as ItemId[]);
  offers.push({ item: tool, qty: 1, gold: 0, gems: 4, sold: false });
  offers.push({ item: rpick(s, ['hammer', 'nails', 'paint'] as ItemId[]), qty: 1, gold: 120 + 20 * s.level, gems: 0, sold: false });
  s.market = { offers, refreshAt: now + 10 * 60_000 };
  emit({ type: 'market' });
}

export function buyOffer(s: GameState, i: number): Result {
  const o = s.market.offers[i];
  if (!o || o.sold) return { ok: false, reason: 'invalid' };
  if (s.gold < o.gold) return { ok: false, reason: 'gold' };
  if (s.gems < o.gems) return { ok: false, reason: 'gems' };
  if (ITEMS[o.item].cat !== 'tools' && barnFree(s) < o.qty) return { ok: false, reason: 'barn' };
  s.gold -= o.gold;
  s.gems -= o.gems;
  give(s, o.item, o.qty);
  o.sold = true;
  return { ok: true };
}

export function sell(s: GameState, item: ItemId, qty: number): number {
  const n = Math.min(qty, count(s, item));
  if (n <= 0) return 0;
  s.items[item] = count(s, item) - n;
  const g = Math.ceil(ITEMS[item].price * n * 0.6);
  s.gold += g;
  return g;
}

export const slotCost = (extra: number): number => [8, 15, 25][extra] ?? 999;
export function buySlot(s: GameState, type: BType): Result {
  const e = s.extraSlots[type] ?? 0;
  if (e >= 3) return { ok: false, reason: 'limit' };
  if (s.gems < slotCost(e)) return { ok: false, reason: 'gems' };
  s.gems -= slotCost(e);
  s.extraSlots[type] = e + 1;
  return { ok: true };
}

export const BOOST_GEMS = 15;
export function buyBoost(s: GameState, now: number): Result {
  if (s.gems < BOOST_GEMS) return { ok: false, reason: 'gems' };
  s.gems -= BOOST_GEMS;
  activateBoost(s, now, 15);
  return { ok: true };
}

export const GEAR_PRICE: Partial<Record<ItemId, number>> = { sword: 120, bow: 140, shield: 180, staff: 220, pie: 90, stew: 110 };
export function buyGear(s: GameState, item: ItemId): Result {
  const p = GEAR_PRICE[item];
  if (!p) return { ok: false, reason: 'invalid' };
  if (s.gold < p) return { ok: false, reason: 'gold' };
  if (barnFree(s) < 1) return { ok: false, reason: 'barn' };
  s.gold -= p;
  give(s, item, 1);
  return { ok: true };
}

export function buyDecor(s: GameState, id: DecorId): Result {
  const d = DECOR[id];
  if (s.gold < d.gold) return { ok: false, reason: 'gold' };
  if (s.gems < d.gems) return { ok: false, reason: 'gems' };
  const map = buildMap();
  const used = new Set(s.decor.map((x) => key(x)));
  const spot = [...map.cells.values()].filter((c) => s.regions.includes(c.region) && c.kind === 'decor' && !used.has(key(c)) && hexDist(c) >= 3 && c.decor.length > 0 && !c.decor[0].model.startsWith('building'))
    .sort((a, b) => hexDist(a) - hexDist(b))[0];
  if (!spot) return { ok: false, reason: 'full' };
  s.gold -= d.gold;
  s.gems -= d.gems;
  s.decor.push({ id, q: spot.q, r: spot.r });
  return { ok: true };
}

export const SKIN_GEMS = 25;
export function buySkin(s: GameState, skin: SkinId): Result {
  if (!(skin in SKINS)) return { ok: false, reason: 'invalid' };
  if (!s.skins.includes(skin)) {
    if (s.gems < SKIN_GEMS) return { ok: false, reason: 'gems' };
    s.gems -= SKIN_GEMS;
    s.skins.push(skin);
  }
  s.skin = skin;
  return { ok: true };
}

export function research(s: GameState, id: ResearchId): Result {
  const tier = s.research[id];
  if (tier >= RESEARCH[id].tiers) return { ok: false, reason: 'limit' };
  if (s.level < 3 + tier * 3) return { ok: false, reason: 'level' };
  const c = researchCost(tier);
  if (s.gold < c.gold) return { ok: false, reason: 'gold' };
  if (s.gems < c.gems) return { ok: false, reason: 'gems' };
  s.gold -= c.gold;
  s.gems -= c.gems;
  s.research[id]++;
  return { ok: true };
}

// ---------- Daily tasks & weekly event ----------
export function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
export function weekKey(now: number): string {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return `${m.getFullYear()}-${m.getMonth() + 1}-${m.getDate()}`;
}
export function weekStart(now: number): number {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime();
}

function rollDaily(s: GameState, now: number): void {
  const L = s.level;
  s.daily = {
    day: dayKey(now), claimed: false,
    tasks: [
      { kind: 'harvest', target: 20 + 6 * L, progress: 0 },
      { kind: 'produce', target: 8 + 3 * L, progress: 0 },
      { kind: 'orders', target: 3 + Math.floor(L / 2), progress: 0 },
      { kind: 'battles', target: 2 + Math.floor(L / 4), progress: 0 },
      { kind: 'chests', target: 2, progress: 0 },
    ],
  };
}

function taskProgress(s: GameState, kind: Task['kind'], n: number): void {
  for (const t of s.daily.tasks) if (t.kind === kind && t.progress < t.target) {
    t.progress = Math.min(t.target, t.progress + n);
    if (t.progress >= t.target) { weekly(s, 5); emit({ type: 'task', kind }); }
  }
}

export const dailyPercent = (s: GameState): number => Math.round((s.daily.tasks.filter((t) => t.progress >= t.target).length / s.daily.tasks.length) * 100);

export function claimDaily(s: GameState): Result {
  if (s.daily.claimed || dailyPercent(s) < 100) return { ok: false, reason: 'invalid' };
  s.daily.claimed = true;
  s.gems += 10;
  s.gold += 100 + 20 * s.level;
  give(s, 'hammer', 1); give(s, 'nails', 1); give(s, 'paint', 1);
  return { ok: true };
}

function weekly(s: GameState, pts: number): void { s.weekly.points += pts; }

export const RIVALS = ['Aldwin', 'Maelis', 'Corvin', 'Isolde', 'Bertrand', 'Liora', 'Gaspard', 'Elodie', 'Rowan'];
/** AI rivals' festival points (deterministic per week). */
export function rivalScores(now: number): { name: string; points: number }[] {
  const ws = weekStart(now);
  const hours = Math.max(0, (now - ws) / 3_600_000);
  const seed = Math.floor(ws / 86_400_000);
  return RIVALS.map((name, i) => {
    const r = new Rng(seed * 31 + i * 977);
    const rate = 3 + r.next() * 18;
    return { name, points: Math.round(rate * Math.pow(hours, 0.92) + r.next() * 40) };
  });
}

export function leaderboard(s: GameState, now: number, you: string): { name: string; points: number; you: boolean }[] {
  return [...rivalScores(now).map((r) => ({ ...r, you: false })), { name: you, points: s.weekly.points, you: true }].sort((a, b) => b.points - a.points);
}

const weeklyReward = (rank: number): number => (rank === 1 ? 50 : rank === 2 ? 30 : rank === 3 ? 20 : rank <= 6 ? 10 : 5);

export function claimWeekly(s: GameState): number {
  const g = s.weekly.pending;
  s.gems += g;
  s.weekly.pending = 0;
  return g;
}

// ---------- Tutorial goals ----------
export interface Goal { id: string; done: (s: GameState) => boolean; gold: number }
export const GOALS: Goal[] = [
  { id: 'plant', done: (s) => s.buildings.some((b) => b.type === 'field' && (b.jobs.length > 0 || b.ready.length > 0)) || stat(s, 'crops') > 0, gold: 5 },
  { id: 'harvest', done: (s) => stat(s, 'crops') >= 2, gold: 5 },
  { id: 'flour', done: (s) => (s.made.flour ?? 0) >= 1, gold: 10 },
  { id: 'bread', done: (s) => (s.made.bread ?? 0) >= 1, gold: 10 },
  { id: 'order', done: (s) => stat(s, 'orders') >= 1, gold: 15 },
  { id: 'coop', done: (s) => owned(s, 'coop') >= 1, gold: 15 },
  { id: 'camp', done: (s) => s.regions.length >= 2, gold: 20 },
  { id: 'chest', done: (s) => stat(s, 'chests') >= 1, gold: 15 },
  { id: 'raid', done: (s) => stat(s, 'raids') + stat(s, 'raidsLost') >= 1, gold: 20 },
  { id: 'hero', done: (s) => Object.keys(s.heroes).length >= 2, gold: 20 },
  { id: 'mine', done: (s) => owned(s, 'mine') >= 1, gold: 20 },
  { id: 'forge', done: (s) => owned(s, 'forge') >= 1, gold: 25 },
  { id: 'sword', done: (s) => (s.made.sword ?? 0) >= 1, gold: 25 },
  { id: 'barracks', done: (s) => owned(s, 'barracks') >= 1, gold: 30 },
  { id: 'soldier', done: (s) => s.troops.soldier + stat(s, 'troopsLost') >= 1 || (s.made.soldier ?? 0) >= 1, gold: 30 },
  { id: 'camp2', done: (s) => s.regions.length >= 3, gold: 40 },
];

function checkGoals(s: GameState): void {
  while (s.tutorial < GOALS.length && GOALS[s.tutorial].done(s)) {
    s.gold += GOALS[s.tutorial].gold;
    addXp(s, 3);
    emit({ type: 'goal', index: s.tutorial });
    s.tutorial++;
  }
}

const CALM = new Set<GameEvent['type']>(['ready', 'barnFull']);
const notable = (): boolean => events.some((e) => !CALM.has(e.type));

/** A villager drops by with a small present (keeps the first sessions lively). */
function gift(s: GameState): void {
  if (roll(s) < 0.5 && s.chests.filter((c) => !c.big).length < 2) { spawnChest(s); return; }
  const pool = ITEM_IDS.filter((i) => isUnlocked(s, i) && producible(s, i) && ITEMS[i].cat !== 'tools');
  const item = rpick(s, pool);
  const qty = ITEMS[item].price < 8 ? 3 : 1;
  const got = give(s, item, qty);
  const gold = 10 + 3 * s.level;
  s.gold += gold;
  emit({ type: 'gift', gold, item: got ? item : undefined, qty: got });
}

// ---------- Simulation tick ----------
export function tick(s: GameState, now: number, dt: number): void {
  if (notable()) s.calmSince = s.play;
  // Construction & production
  for (const b of s.buildings) {
    if (b.buildEnd > 0 && now >= b.buildEnd) {
      b.buildEnd = 0;
      emit({ type: 'built', id: b.id, btype: b.type });
    }
    if (!b.jobs.length) continue;
    const before = b.ready.length;
    b.jobs = b.jobs.filter((j) => {
      if (j.end <= now) { b.ready.push(j.recipe); return false; }
      return true;
    });
    if (b.ready.length > before) emit({ type: 'ready', id: b.id });
  }
  // Castle taxes (small, steady)
  s.taxAcc += (dt * castle(s).level * 1.5) / 60;
  if (s.taxAcc >= 1) { s.gold += Math.floor(s.taxAcc); s.taxAcc -= Math.floor(s.taxAcc); }

  // Live events run on active play time only.
  if (dt > 0) {
    const prev = s.play;
    s.play += dt;
    if (prev < s.raidAt - 15 && s.play >= s.raidAt - 15) emit({ type: 'raidWarn', inSec: 15 });
    if (prev < s.raidAt && s.play >= s.raidAt) emit({ type: 'raid' });
    if (s.play >= s.nextChestAt) {
      s.nextChestAt = s.play + 70 + roll(s) * 35;
      if (s.chests.filter((c) => !c.big).length < 2) spawnChest(s);
    }
    if (!s.cart && s.play >= s.nextCartAt && s.level >= 2) spawnCart(s);
    if (s.cart && s.play >= s.cart.leave) {
      emit({ type: 'cartLeave', complete: s.cart.bonusClaimed });
      s.cart = null;
      s.nextCartAt = s.play + 900;
    }
    if (s.visitor && s.play > s.visitor.until) s.visitor = null;
    if (!s.visitor) {
      for (const v of VISITORS) {
        if (s.heroes[v.hero] || s.level < v.level || s.play < v.play || (v.after && !s.heroes[v.after])) continue;
        if (s.visitorsSeen.includes(v.hero) && roll(s) > 0.002) continue; // returns now and then
        s.visitor = { hero: v.hero, until: s.play + 240, gold: v.gold, gems: v.gems };
        if (!s.visitorsSeen.includes(v.hero)) s.visitorsSeen.push(v.hero);
        emit({ type: 'visitor', hero: v.hero });
        break;
      }
    }
  }
  if (s.level >= 4 && now >= s.market.refreshAt && buildingOf(s, 'market')) refreshMarket(s, now);
  if (s.daily.day !== dayKey(now)) rollDaily(s, now);
  const wk = weekKey(now);
  if (s.weekly.week !== wk) {
    if (s.weekly.week) {
      const rank = leaderboard(s, weekStart(now) - 1000, 'you').findIndex((r) => r.you) + 1;
      s.weekly.pending += weeklyReward(rank);
    }
    s.weekly = { ...s.weekly, week: wk, points: 0 };
  }
  checkGoals(s);
  if (notable()) s.calmSince = s.play;
  else if (dt > 0 && s.play - s.calmSince > 45) { gift(s); s.calmSince = s.play; }
  s.lastSeen = now;
}

function spawnChest(s: GameState): void {
  const map = buildMap();
  const used = new Set([...s.chests.map((c) => key(c)), ...s.decor.map((d) => key(d))]);
  const cells = [...map.cells.values()].filter((c) => s.regions.includes(c.region) && (c.kind === 'decor' || c.kind === 'grass') && !used.has(key(c)) && hexDist(c) >= 3);
  if (!cells.length) return;
  const c = cells[Math.floor(roll(s) * cells.length)];
  const id = s.nextId++;
  s.chests.push({ id, q: c.q, r: c.r, big: false });
  emit({ type: 'chest', id });
}

// ---------- Offline ----------
export interface OfflineReport { seconds: number; gold: number; finished: number }

/** Called on load: production timers already ran on the wall clock; castle taxes accrue up to 8 h. */
export function offlineReport(s: GameState, now: number): OfflineReport | null {
  const seconds = Math.min(OFFLINE_CAP, Math.max(0, (now - s.lastSeen) / 1000));
  if (seconds < 60) return null;
  const gold = Math.floor((seconds * castle(s).level * 1.5) / 60);
  const finished = s.buildings.reduce((a, b) => a + b.jobs.filter((j) => j.end <= now).length, 0);
  return { seconds, gold, finished };
}

export function applyOffline(s: GameState, rep: OfflineReport, factor: number): void {
  s.gold += rep.gold * factor;
}

export { Battle, recipe };
