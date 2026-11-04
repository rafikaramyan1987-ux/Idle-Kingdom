// Static game data: items, recipes, buildings, heroes, enemies. Pure data, unit-tested via the simulation.

export type Category = 'crops' | 'animal' | 'materials' | 'goods' | 'gear' | 'tools';

export const ITEMS = {
  wheat: { cat: 'crops', icon: '🌾', price: 2, level: 1 },
  corn: { cat: 'crops', icon: '🌽', price: 5, level: 3 },
  carrot: { cat: 'crops', icon: '🥕', price: 8, level: 5 },
  cotton: { cat: 'crops', icon: '🌼', price: 11, level: 6 },
  egg: { cat: 'animal', icon: '🥚', price: 7, level: 2 },
  milk: { cat: 'animal', icon: '🥛', price: 12, level: 4 },
  wool: { cat: 'animal', icon: '🧶', price: 18, level: 6 },
  wood: { cat: 'materials', icon: '🪵', price: 3, level: 1 },
  stone: { cat: 'materials', icon: '🪨', price: 4, level: 2 },
  ore: { cat: 'materials', icon: '⛏️', price: 8, level: 3 },
  flour: { cat: 'goods', icon: '🍚', price: 6, level: 1 },
  bread: { cat: 'goods', icon: '🍞', price: 12, level: 1 },
  cake: { cat: 'goods', icon: '🍰', price: 55, level: 6 },
  cheese: { cat: 'goods', icon: '🧀', price: 30, level: 5 },
  butter: { cat: 'goods', icon: '🧈', price: 32, level: 5 },
  cloth: { cat: 'goods', icon: '👕', price: 30, level: 6 },
  banner: { cat: 'goods', icon: '🚩', price: 60, level: 7 },
  sword: { cat: 'gear', icon: '🗡️', price: 30, level: 3 },
  bow: { cat: 'gear', icon: '🏹', price: 36, level: 4 },
  staff: { cat: 'gear', icon: '🪄', price: 45, level: 6 },
  shield: { cat: 'gear', icon: '🛡️', price: 40, level: 5 },
  pie: { cat: 'gear', icon: '🥧', price: 28, level: 3 },
  stew: { cat: 'gear', icon: '🍲', price: 30, level: 5 },
  hammer: { cat: 'tools', icon: '🔨', price: 40, level: 1 },
  nails: { cat: 'tools', icon: '🔩', price: 40, level: 1 },
  paint: { cat: 'tools', icon: '🪣', price: 40, level: 1 },
} as const satisfies Record<string, { cat: Category; icon: string; price: number; level: number }>;

export type ItemId = keyof typeof ITEMS;
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export type Bag = Partial<Record<ItemId, number>>;

export type BType =
  | 'castle' | 'walls' | 'barn' | 'orders' | 'field' | 'coop' | 'pasture' | 'sheep'
  | 'lumber' | 'mine' | 'bakery' | 'dairy' | 'forge' | 'weaver' | 'kitchen' | 'barracks' | 'market';

export type Kind = 'special' | 'field' | 'animal' | 'factory';

export interface Recipe {
  id: string;
  building: BType;
  inputs: Bag;
  /** Output item, or a troop type for the barracks. */
  out: ItemId | 'soldier' | 'archer';
  qty: number;
  time: number; // seconds
  xp: number;
  level: number;
  /** Gold paid when planting a crop. */
  gold?: number;
}

export const RECIPES: Recipe[] = [
  // Fields: plant -> grow -> harvest 2
  { id: 'wheat', building: 'field', inputs: {}, out: 'wheat', qty: 2, time: 20, xp: 1, level: 1, gold: 1 },
  { id: 'corn', building: 'field', inputs: {}, out: 'corn', qty: 2, time: 60, xp: 2, level: 3, gold: 3 },
  { id: 'carrot', building: 'field', inputs: {}, out: 'carrot', qty: 2, time: 120, xp: 3, level: 5, gold: 5 },
  { id: 'cotton', building: 'field', inputs: {}, out: 'cotton', qty: 2, time: 180, xp: 4, level: 6, gold: 7 },
  // Animals (each animal works in parallel, eating one feed)
  { id: 'egg', building: 'coop', inputs: { wheat: 1 }, out: 'egg', qty: 1, time: 40, xp: 2, level: 2 },
  { id: 'milk', building: 'pasture', inputs: { corn: 1 }, out: 'milk', qty: 1, time: 80, xp: 3, level: 4 },
  { id: 'wool', building: 'sheep', inputs: { carrot: 1 }, out: 'wool', qty: 1, time: 140, xp: 4, level: 6 },
  // Raw materials
  { id: 'wood', building: 'lumber', inputs: {}, out: 'wood', qty: 2, time: 25, xp: 1, level: 1 },
  { id: 'stone', building: 'mine', inputs: {}, out: 'stone', qty: 2, time: 35, xp: 1, level: 2 },
  { id: 'ore', building: 'mine', inputs: {}, out: 'ore', qty: 1, time: 45, xp: 2, level: 3 },
  // Factories
  { id: 'flour', building: 'bakery', inputs: { wheat: 2 }, out: 'flour', qty: 1, time: 12, xp: 2, level: 1 },
  { id: 'bread', building: 'bakery', inputs: { flour: 1, wheat: 1 }, out: 'bread', qty: 1, time: 20, xp: 3, level: 1 },
  { id: 'cake', building: 'bakery', inputs: { flour: 2, egg: 2, milk: 1 }, out: 'cake', qty: 1, time: 150, xp: 12, level: 6 },
  { id: 'cheese', building: 'dairy', inputs: { milk: 2 }, out: 'cheese', qty: 1, time: 90, xp: 6, level: 5 },
  { id: 'butter', building: 'dairy', inputs: { milk: 2 }, out: 'butter', qty: 1, time: 75, xp: 6, level: 5 },
  { id: 'sword', building: 'forge', inputs: { ore: 2, wood: 1 }, out: 'sword', qty: 1, time: 45, xp: 6, level: 3 },
  { id: 'bow', building: 'forge', inputs: { wood: 3, ore: 1 }, out: 'bow', qty: 1, time: 50, xp: 6, level: 4 },
  { id: 'shield', building: 'forge', inputs: { ore: 2, wood: 2 }, out: 'shield', qty: 1, time: 70, xp: 8, level: 5 },
  { id: 'staff', building: 'forge', inputs: { wood: 2, ore: 2 }, out: 'staff', qty: 1, time: 80, xp: 9, level: 6 },
  { id: 'cloth', building: 'weaver', inputs: { cotton: 2 }, out: 'cloth', qty: 1, time: 90, xp: 7, level: 6 },
  { id: 'banner', building: 'weaver', inputs: { cloth: 1, wool: 1 }, out: 'banner', qty: 1, time: 150, xp: 12, level: 7 },
  { id: 'pie', building: 'kitchen', inputs: { flour: 1, egg: 2 }, out: 'pie', qty: 1, time: 35, xp: 5, level: 3 },
  { id: 'stew', building: 'kitchen', inputs: { carrot: 1, corn: 1 }, out: 'stew', qty: 1, time: 60, xp: 6, level: 5 },
  // Army orders
  { id: 'soldier', building: 'barracks', inputs: { sword: 1, bread: 2 }, out: 'soldier', qty: 1, time: 30, xp: 8, level: 4 },
  { id: 'archer', building: 'barracks', inputs: { bow: 1, pie: 1 }, out: 'archer', qty: 1, time: 35, xp: 9, level: 5 },
];

export const recipe = (id: string): Recipe => {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown recipe ${id}`);
  return r;
};

export interface BuildingDef {
  type: BType;
  kind: Kind;
  level: number;
  cost: { gold: number } & Bag;
  build: number; // seconds
  slots: number; // queue length (factories) or animals (animal farms)
  /** How many of this building the player may own at a given player level. */
  max: (playerLevel: number) => number;
  model: string;
}

const one = (): number => 1;

export const BUILDINGS: Record<BType, BuildingDef> = {
  castle: { type: 'castle', kind: 'special', level: 1, cost: { gold: 0 }, build: 0, slots: 0, max: one, model: 'building_castle' },
  walls: { type: 'walls', kind: 'special', level: 1, cost: { gold: 0 }, build: 0, slots: 0, max: one, model: 'wall_straight' },
  barn: { type: 'barn', kind: 'special', level: 1, cost: { gold: 0 }, build: 0, slots: 0, max: one, model: 'building_home_B' },
  orders: { type: 'orders', kind: 'special', level: 1, cost: { gold: 0 }, build: 0, slots: 0, max: one, model: 'tent' },
  field: { type: 'field', kind: 'field', level: 1, cost: { gold: 15 }, build: 4, slots: 1, max: (l) => Math.min(12, 2 + l), model: 'building_grain' },
  lumber: { type: 'lumber', kind: 'factory', level: 1, cost: { gold: 40 }, build: 10, slots: 3, max: one, model: 'building_lumbermill' },
  bakery: { type: 'bakery', kind: 'factory', level: 1, cost: { gold: 40 }, build: 10, slots: 3, max: one, model: 'building_windmill' },
  coop: { type: 'coop', kind: 'animal', level: 2, cost: { gold: 100, wood: 6 }, build: 12, slots: 3, max: one, model: 'coop' },
  mine: { type: 'mine', kind: 'factory', level: 2, cost: { gold: 90, wood: 6 }, build: 15, slots: 3, max: one, model: 'building_mine' },
  forge: { type: 'forge', kind: 'factory', level: 3, cost: { gold: 140, wood: 8, stone: 6 }, build: 20, slots: 3, max: one, model: 'building_blacksmith' },
  kitchen: { type: 'kitchen', kind: 'factory', level: 3, cost: { gold: 120, wood: 8, stone: 4 }, build: 20, slots: 3, max: one, model: 'building_tavern' },
  pasture: { type: 'pasture', kind: 'animal', level: 4, cost: { gold: 220, wood: 12 }, build: 25, slots: 3, max: one, model: 'pasture' },
  barracks: { type: 'barracks', kind: 'factory', level: 4, cost: { gold: 260, wood: 14, stone: 14 }, build: 25, slots: 3, max: one, model: 'building_barracks' },
  market: { type: 'market', kind: 'special', level: 4, cost: { gold: 200, wood: 10 }, build: 20, slots: 0, max: one, model: 'building_market' },
  dairy: { type: 'dairy', kind: 'factory', level: 5, cost: { gold: 380, wood: 16, stone: 10 }, build: 30, slots: 3, max: one, model: 'building_home_A' },
  sheep: { type: 'sheep', kind: 'animal', level: 6, cost: { gold: 520, wood: 20 }, build: 30, slots: 3, max: one, model: 'sheep' },
  weaver: { type: 'weaver', kind: 'factory', level: 6, cost: { gold: 600, wood: 24, stone: 14 }, build: 35, slots: 3, max: one, model: 'building_home_B' },
};

export const BUILD_MENU: BType[] = ['field', 'coop', 'mine', 'forge', 'kitchen', 'pasture', 'barracks', 'market', 'dairy', 'sheep', 'weaver', 'lumber', 'bakery'];

// ---------- Heroes ----------
export type HeroId = 'knight' | 'ranger' | 'mage' | 'rogue' | 'barbarian';
export type SkillId = 'shieldwall' | 'volley' | 'fireball' | 'shadowstrike' | 'whirlwind';

export interface UnitStats { hp: number; atk: number; range: number; interval: number; speed: number }

export interface HeroDef extends UnitStats {
  id: HeroId;
  model: string;
  role: 'tank' | 'archer' | 'mage' | 'rogue' | 'warrior';
  skill: SkillId;
  cooldown: number;
  weapon: ItemId;
  /** Production speed bonus (per star) for one building. */
  bonus: { building: BType; pct: number };
  color: string;
}

export const HEROES: HeroDef[] = [
  { id: 'knight', model: 'knight', role: 'tank', hp: 260, atk: 17, range: 1.1, interval: 1.1, speed: 2.2, skill: 'shieldwall', cooldown: 10, weapon: 'sword', bonus: { building: 'forge', pct: 0.08 }, color: '#5b8bd9' },
  { id: 'ranger', model: 'rogue_hooded', role: 'archer', hp: 150, atk: 16, range: 5, interval: 1.2, speed: 2.4, skill: 'volley', cooldown: 8, weapon: 'bow', bonus: { building: 'lumber', pct: 0.08 }, color: '#6fb86a' },
  { id: 'mage', model: 'mage', role: 'mage', hp: 130, atk: 20, range: 4.5, interval: 1.6, speed: 2.1, skill: 'fireball', cooldown: 9, weapon: 'staff', bonus: { building: 'bakery', pct: 0.08 }, color: '#b07cc6' },
  { id: 'rogue', model: 'rogue', role: 'rogue', hp: 160, atk: 21, range: 1.0, interval: 0.85, speed: 3.0, skill: 'shadowstrike', cooldown: 8, weapon: 'sword', bonus: { building: 'market', pct: 0.08 }, color: '#e9b949' },
  { id: 'barbarian', model: 'barbarian', role: 'warrior', hp: 300, atk: 22, range: 1.2, interval: 1.3, speed: 2.2, skill: 'whirlwind', cooldown: 7, weapon: 'sword', bonus: { building: 'mine', pct: 0.08 }, color: '#d9534f' },
];

export const heroDef = (id: HeroId): HeroDef => HEROES.find((h) => h.id === id)!;

export type EnemyKind = 'minion' | 'warrior' | 'srogue' | 'smage';
export const ENEMIES: Record<EnemyKind, UnitStats & { model: string }> = {
  minion: { model: 'skeleton_minion', hp: 45, atk: 6, range: 1.0, interval: 1.2, speed: 2.0 },
  warrior: { model: 'skeleton_warrior', hp: 110, atk: 11, range: 1.1, interval: 1.4, speed: 1.8 },
  srogue: { model: 'skeleton_rogue', hp: 60, atk: 13, range: 1.0, interval: 0.9, speed: 2.8 },
  smage: { model: 'skeleton_mage', hp: 50, atk: 13, range: 4.0, interval: 1.8, speed: 1.8 },
};

export const TROOPS = {
  soldier: { model: 'knight', hp: 90, atk: 8, range: 1.0, interval: 1.1, speed: 2.2 },
  archer: { model: 'rogue_hooded', hp: 60, atk: 8, range: 4.5, interval: 1.3, speed: 2.2 },
} satisfies Record<string, UnitStats & { model: string }>;

/** Enemy camp guarding region k (1..12). */
export function campEnemies(region: number): EnemyKind[] {
  const table: EnemyKind[][] = [
    [],
    ['minion', 'minion'],
    ['minion', 'minion', 'warrior'],
    ['minion', 'warrior', 'smage'],
    ['minion', 'minion', 'warrior', 'srogue'],
    ['warrior', 'warrior', 'smage', 'srogue'],
    ['minion', 'warrior', 'warrior', 'smage', 'srogue'],
  ];
  if (region < table.length) return table[region];
  const base: EnemyKind[] = ['warrior', 'warrior', 'smage', 'srogue', 'minion'];
  return [...base, ...base.slice(0, Math.min(4, region - 6))];
}

/** Enemy strength multiplier for region camps. */
export const campScale = (region: number): number => 1 + 0.26 * Math.max(0, region - 1);
/** Player level needed before a camp can be attacked. */
export const campLevel = (region: number): number => region + 1;

export const ITEM_XP_RATIO = 0.25;

// ---------- Levels ----------
export function xpForLevel(level: number): number {
  // Total XP needed to reach `level` (level 1 = 0).
  if (level <= 1) return 0;
  return Math.round(80 * Math.pow(level - 1, 1.6));
}

export const BARN_BASE = 60;
export const BARN_STEP = 25;
export const OFFLINE_CAP = 8 * 3600;

export const RESEARCH = {
  farming: { tiers: 3, effect: 0.1 },
  industry: { tiers: 3, effect: 0.1 },
  warfare: { tiers: 3, effect: 0.1 },
  building: { tiers: 3, effect: 0.25 },
} as const;
export type ResearchId = keyof typeof RESEARCH;
export const researchCost = (tier: number): { gold: number; gems: number } => ({ gold: [150, 600, 2400][tier] ?? 9999, gems: [0, 5, 15][tier] ?? 99 });

export const DECOR = {
  well: { model: 'building_well', gold: 120, gems: 0, beauty: 0.02 },
  flags: { model: 'flag', gold: 60, gems: 0, beauty: 0.01 },
  tower: { model: 'building_tower_A', gold: 400, gems: 0, beauty: 0.04 },
  church: { model: 'building_church', gold: 0, gems: 30, beauty: 0.08 },
} as const;
export type DecorId = keyof typeof DECOR;

export const SKINS = { red: 'building_castle', blue: 'building_castle_blue', green: 'building_castle_green', yellow: 'building_castle_yellow' } as const;
export type SkinId = keyof typeof SKINS;
