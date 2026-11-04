// Deterministic hex island layout (pointy-top axial coordinates). Pure data, no Three.js.

export interface Axial { q: number; r: number }

/** Edge directions, index = angle / 60° counter-clockwise from east (north = -z). */
export const DIRS: Axial[] = [
  { q: 1, r: 0 }, // 0   E
  { q: 1, r: -1 }, // 60  NE
  { q: 0, r: -1 }, // 120 NW
  { q: -1, r: 0 }, // 180 W
  { q: -1, r: 1 }, // 240 SW
  { q: 0, r: 1 }, // 300 SE
];

export const HEX_INRADIUS = 1; // tiles are 2 units wide (flat sides at x = ±1)
export const SQRT3 = Math.sqrt(3);

export function hexToWorld(h: Axial): { x: number; z: number } {
  return { x: 2 * h.q + h.r, z: SQRT3 * h.r };
}

export function worldToHex(x: number, z: number): Axial {
  const r = z / SQRT3;
  const q = (x - r) / 2;
  return hexRound(q, r);
}

function hexRound(qf: number, rf: number): Axial {
  const sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

export function hexDist(a: Axial, b: Axial = { q: 0, r: 0 }): number {
  const dq = a.q - b.q, dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export const key = (h: Axial): string => `${h.q},${h.r}`;
export const add = (a: Axial, b: Axial): Axial => ({ q: a.q + b.q, r: a.r + b.r });

/** Small deterministic hash -> [0,1). */
export function hash2(a: number, b: number, seed = 0): number {
  let h = (a * 374761393 + b * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Connection masks of the KayKit tiles (bit i = edge i connects), measured by scripts/dev/edges.mjs.
const ROAD_TILES: Record<string, number[]> = {
  hex_road_A: [0, 3], hex_road_B: [1, 3], hex_road_C: [2, 3], hex_road_D: [1, 3, 5], hex_road_E: [0, 1, 3],
  hex_road_F: [0, 3, 5], hex_road_G: [2, 3, 4], hex_road_H: [0, 2, 3, 4], hex_road_I: [1, 2, 4, 5],
  hex_road_J: [0, 3, 4, 5], hex_road_K: [1, 2, 3, 4, 5], hex_road_L: [0, 1, 2, 3, 4, 5], hex_road_M: [3],
};
const RIVER_TILES: Record<string, number[]> = {
  hex_river_A: [0, 3], hex_river_B: [1, 3], hex_river_C: [2, 3], hex_river_D: [1, 3, 5], hex_river_E: [0, 1, 3],
};

const WALL_TILES: Record<string, number[]> = { wall_straight: [0, 3], wall_corner_A_outside: [1, 3], wall_corner_B_outside: [2, 3] };
const GATE_TILES: Record<string, number[]> = { wall_straight_gate: [0, 3], wall_corner_A_gate: [1, 3] };

const maskOf = (edges: number[]): number => edges.reduce((m, e) => m | (1 << e), 0);
const rotMask = (m: number, k: number): number => {
  let out = 0;
  for (let e = 0; e < 6; e++) if (m & (1 << e)) out |= 1 << ((e + k) % 6);
  return out;
};

/** Finds a tile + rotation (in 60° steps, CCW) whose connections equal `edges`. */
export function pickTile(catalog: 'road' | 'river', edges: number[]): { model: string; rot: number } | null {
  const want = maskOf(edges);
  const cat = catalog === 'road' ? ROAD_TILES : RIVER_TILES;
  for (const [model, e] of Object.entries(cat)) {
    const m = maskOf(e);
    for (let k = 0; k < 6; k++) if (rotMask(m, k) === want) return { model, rot: k };
  }
  return null;
}

function pickWall(edges: number[], gate: boolean): { model: string; rot: number } {
  const want = maskOf(edges);
  for (const [model, e] of Object.entries(gate ? GATE_TILES : WALL_TILES)) {
    for (let k = 0; k < 6; k++) if (rotMask(maskOf(e), k) === want) return { model, rot: k };
  }
  return { model: gate ? 'wall_straight_gate' : 'wall_straight', rot: 0 };
}

export type CellKind = 'grass' | 'river' | 'road' | 'castle' | 'plot' | 'decor';

export interface Decor { model: string; rot: number; scale: number; dx: number; dz: number }

export interface Cell extends Axial {
  kind: CellKind;
  region: number;
  tile: string;
  rot: number; // radians
  decor: Decor[];
  plot?: number;
  /** River edges (for watermill placement). */
  riverEdges?: number[];
}

export interface Region { id: number; center: { x: number; z: number }; cells: string[]; plots: number[] }

export interface Plot { id: number; q: number; r: number; region: number }

export interface KingdomMap {
  cells: Map<string, Cell>;
  regions: Region[];
  plots: Plot[];
  river: Axial[];
  roads: Axial[];
  /** Road graph for villagers: adjacency between road cells (+castle). */
  roadLinks: [string, string][];
  watermill: { q: number; r: number; edge: number };
  /** Wall tiles in build order (gates first). */
  walls: { q: number; r: number; model: string; rot: number; gate: boolean }[];
  radius: number;
}

const SECTOR_ORDER = [4, 5, 3, 0, 2, 1]; // unlock order: SW, SE, W, E, NW, NE (front first)

function sectorOf(h: Axial): number {
  const { x, z } = hexToWorld(h);
  let a = (Math.atan2(-z, x) * 180) / Math.PI;
  if (a < 0) a += 360;
  return Math.floor(((a + 30) % 360) / 60);
}

export function regionOf(h: Axial): number {
  const d = hexDist(h);
  if (d <= 3) return 0;
  const s = SECTOR_ORDER.indexOf(sectorOf(h));
  return d <= 5 ? 1 + s : 7 + s;
}

const RIVER_START: Axial = { q: 6, r: -7 };
// SW = 4, SE = 5. A gentle meander from the northern mountains, around the castle walls, to the southern sea.
const RIVER_MOVES = [4, 5, 4, 5, 4, 4, 5, 4, 5, 5, 4, 5, 4, 5];
const ROAD_PATHS: Axial[][] = [
  [{ q: -1, r: 1 }, { q: -2, r: 2 }, { q: -3, r: 3 }, { q: -4, r: 4 }, { q: -5, r: 5 }, { q: -6, r: 6 }],
  [{ q: -3, r: 3 }, { q: -4, r: 3 }, { q: -5, r: 3 }, { q: -6, r: 3 }],
  [{ q: -3, r: 3 }, { q: -3, r: 4 }, { q: -3, r: 5 }, { q: -3, r: 6 }],
  [{ q: 0, r: -1 }, { q: 0, r: -2 }, { q: 0, r: -3 }, { q: -1, r: -3 }, { q: -1, r: -4 }, { q: -1, r: -5 }, { q: -2, r: -5 }],
];
/** Ring of wall tiles around the keep (distance 2). The river forms the eastern moat. */
export const WALL_RING = 2;
const WALL_ORDER: Axial[] = [
  { q: -2, r: 2 }, { q: 0, r: -2 }, { q: -1, r: 2 }, { q: -2, r: 1 }, { q: 1, r: -2 }, { q: -1, r: -1 }, { q: 0, r: 2 }, { q: -2, r: 0 }, { q: 2, r: -2 },
];
const REGION0_PLOTS: Axial[] = [
  { q: 0, r: 1 }, { q: -1, r: 0 }, { q: 1, r: 0 }, { q: -2, r: 3 }, { q: -3, r: 1 }, { q: 0, r: 3 }, { q: -2, r: -1 }, { q: 2, r: 1 },
];

let cached: KingdomMap | null = null;

export function buildMap(): KingdomMap {
  if (cached) return cached;
  const R = 7;
  const cells = new Map<string, Cell>();
  const isLand = (h: Axial): boolean => {
    const d = hexDist(h);
    if (d <= 6) return true;
    if (d === 7) return hash2(h.q, h.r, 7) > 0.3;
    if (d === 8) return hash2(h.q, h.r, 11) > 0.8;
    return false;
  };

  // River path
  const river: Axial[] = [RIVER_START];
  for (const m of RIVER_MOVES) river.push(add(river[river.length - 1], DIRS[m]));
  const riverSet = new Set(river.map(key));
  const roadSet = new Set<string>();
  const roads: Axial[] = [];
  for (const p of ROAD_PATHS) for (const h of p) if (!roadSet.has(key(h))) { roadSet.add(key(h)); roads.push(h); }

  for (let q = -R - 1; q <= R + 1; q++) {
    for (let r = -R - 1; r <= R + 1; r++) {
      const h = { q, r };
      const k = key(h);
      if (!isLand(h) && !riverSet.has(k) && !roadSet.has(k)) continue;
      cells.set(k, { q, r, kind: 'grass', region: regionOf(h), tile: 'hex_grass', rot: 0, decor: [] });
    }
  }
  // Mountain source behind the river start
  const source = add(RIVER_START, DIRS[1]);
  cells.set(key(source), { ...source, kind: 'decor', region: regionOf(source), tile: 'hex_grass', rot: 0, decor: [{ model: 'mountain_B_grass_trees', rot: 0, scale: 1, dx: 0, dz: 0 }] });
  cells.get('0,0')!.kind = 'castle';

  // Rivers: edges toward previous/next river cell (or off-map neighbour for the ends).
  const dirIndex = (a: Axial, b: Axial): number => DIRS.findIndex((d) => d.q === b.q - a.q && d.r === b.r - a.r);
  river.forEach((h, i) => {
    const prev = i > 0 ? river[i - 1] : source;
    const next = i < river.length - 1 ? river[i + 1] : add(h, DIRS[RIVER_MOVES[RIVER_MOVES.length - 1]]);
    const edges = [dirIndex(h, prev), dirIndex(h, next)];
    const t = pickTile('river', edges)!;
    const c = cells.get(key(h))!;
    let model = t.model;
    if (model === 'hex_river_A' && hash2(h.q, h.r, 3) > 0.5) model = 'hex_river_A_curvy';
    Object.assign(c, { kind: 'river' as CellKind, tile: model, rot: (t.rot * Math.PI) / 3, riverEdges: edges });
  });

  // Roads: connect to neighbouring road cells and the castle.
  const roadLinks: [string, string][] = [];
  for (const h of roads) {
    const edges: number[] = [];
    DIRS.forEach((d, i) => {
      const n = add(h, d);
      const nk = key(n);
      if (roadSet.has(nk) || nk === '0,0') {
        edges.push(i);
        if (key(h) < nk || nk === '0,0') roadLinks.push([key(h), nk]);
      }
    });
    // Road ends at the coast: open toward the sea for a natural look.
    const t = pickTile('road', edges) ?? { model: 'hex_road_A', rot: 0 };
    const c = cells.get(key(h))!;
    Object.assign(c, { kind: 'road' as CellKind, tile: t.model, rot: (t.rot * Math.PI) / 3 });
  }
  const linkSet = new Set<string>();
  const uniqLinks = roadLinks.filter(([a, b]) => { const k2 = [a, b].sort().join('|'); if (linkSet.has(k2)) return false; linkSet.add(k2); return true; });

  // Regions
  const regions: Region[] = [];
  for (let i = 0; i < 13; i++) regions.push({ id: i, center: { x: 0, z: 0 }, cells: [], plots: [] });
  for (const c of cells.values()) regions[c.region].cells.push(key(c));
  for (const reg of regions) {
    let sx = 0, sz = 0;
    for (const k of reg.cells) { const c = cells.get(k)!; const w = hexToWorld(c); sx += w.x; sz += w.z; }
    reg.center = { x: sx / Math.max(1, reg.cells.length), z: sz / Math.max(1, reg.cells.length) };
  }

  // Plots: inner ring inside the walls + a few per region.
  const plots: Plot[] = [];
  const watermill = { q: 1, r: -1, edge: 0 };
  const reserved = new Set([key(watermill), key({ q: -1, r: 3 }), key({ q: -4, r: 5 }), key({ q: -5, r: 2 })]);
  const addPlot = (c: Cell): void => {
    c.kind = 'plot';
    c.plot = plots.length;
    plots.push({ id: plots.length, q: c.q, r: c.r, region: c.region });
    regions[c.region].plots.push(c.plot);
  };
  // Walls: like roads, each wall tile connects to its neighbours on the ring (or the river moat).
  const ringSet = new Set<string>();
  for (const c of cells.values()) if (hexDist(c) === WALL_RING) ringSet.add(key(c));
  const walls: KingdomMap['walls'] = [];
  for (const h of WALL_ORDER) {
    const edges: number[] = [];
    DIRS.forEach((d, i) => { if (ringSet.has(key(add(h, d)))) edges.push(i); });
    const gate = roadSet.has(key(h));
    const t = pickWall(edges, gate);
    walls.push({ q: h.q, r: h.r, model: t.model, rot: (t.rot * Math.PI) / 3, gate });
    const c = cells.get(key(h))!;
    if (!gate) c.kind = 'decor';
  }
  for (const h of REGION0_PLOTS) addPlot(cells.get(key(h))!);
  for (const reg of regions) {
    if (reg.id === 0) continue;
    const free = reg.cells
      .map((k) => cells.get(k)!)
      .filter((c) => c.kind === 'grass' && hexDist(c) <= 7 && !reserved.has(key(c)))
      .sort((a, b) => hexDist(a) - hexDist(b) || hash2(a.q, a.r, 5) - hash2(b.q, b.r, 5));
    // Prefer cells next to roads/rivers, then spread.
    const want = reg.id <= 6 ? 4 : 4;
    const picked: Cell[] = [];
    for (const c of free) {
      if (picked.length >= want) break;
      if (picked.some((p) => hexDist(p, c) < 2) && free.length - picked.length > want) continue;
      picked.push(c);
    }
    for (const c of picked.sort((a, b) => hexDist(a) - hexDist(b))) addPlot(c);
  }

  // Decoration for the remaining grass cells.
  const wm = cells.get(key(watermill))!;
  wm.kind = 'decor';
  for (const c of cells.values()) {
    if (c.kind !== 'grass') continue;
    const d = hexDist(c);
    const n = hash2(c.q, c.r, 1);
    const n2 = hash2(c.q, c.r, 2);
    const rot = Math.floor(hash2(c.q, c.r, 9) * 6) * (Math.PI / 3);
    const north = c.r <= -3;
    let model: string | null;
    if (d >= 7 && north && n > 0.35) model = n2 > 0.5 ? 'mountain_A_grass_trees' : (n2 > 0.25 ? 'mountain_C_grass_trees' : 'mountain_B_grass');
    else if (d >= 5 && n > 0.75) model = n2 > 0.5 ? 'hills_A_trees' : 'hills_C_trees';
    else if (n > 0.42) model = ['trees_A_large', 'trees_B_large', 'trees_A_medium', 'trees_B_medium'][Math.floor(n2 * 4)];
    else if (n > 0.3) model = ['trees_A_small', 'trees_B_small', 'tree_single_A', 'tree_single_B'][Math.floor(n2 * 4)];
    else if (n > 0.22) model = ['rock_single_A', 'rock_single_C', 'hill_single_A', 'hill_single_B'][Math.floor(n2 * 4)];
    else model = null;
    if (d <= 3) model = n > 0.55 ? 'tree_single_B' : (n > 0.3 ? 'trees_B_small' : (n > 0.2 ? 'rock_single_C' : null));
    if (model) {
      c.kind = 'decor';
      c.decor.push({ model, rot, scale: 1, dx: 0, dz: 0 });
    }
  }
  // Cosy details near roads: barrels, crates, a well and a small church.
  const extra: [Axial, Decor[]][] = [
    [{ q: -1, r: 3 }, [{ model: 'building_well', rot: 0.5, scale: 1, dx: 0, dz: 0 }]],
    [{ q: -4, r: 5 }, [{ model: 'building_church', rot: Math.PI / 3, scale: 1, dx: 0, dz: 0 }]],
    [{ q: -5, r: 2 }, [{ model: 'building_tavern', rot: -Math.PI / 6, scale: 0.9, dx: 0, dz: 0 }]],
  ];
  for (const [h, ds] of extra) {
    const c = cells.get(key(h));
    if (c && (c.kind === 'decor' || c.kind === 'grass')) { c.kind = 'decor'; c.decor = ds; }
  }

  cached = { cells, regions, plots, river, roads, roadLinks: uniqLinks, watermill, walls, radius: R };
  return cached;
}
