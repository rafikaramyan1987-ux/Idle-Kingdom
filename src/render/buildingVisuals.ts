import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BType } from '../game/defs';
import type { ModelLibrary } from './assets';

type Piece = [model: string, x: number, z: number, rotDeg?: number, scale?: number];

interface Recipe { main: string; scale: number; pieces: Piece[]; fences?: number[]; smoke?: [number, number, number][]; mainX?: number; mainZ?: number }

/** Castle visibly grows with its level; the barn with its upgrades. */
export function tierOf(type: BType, level: number): number {
  if (type === 'castle') return Math.min(5, level);
  if (type === 'barn') return Math.min(3, 1 + Math.floor((level - 1) / 2));
  return 1;
}

const FLAGS = (h: number): Piece[] => [['flag', -0.85, 0.55, 90, h], ['flag', 0.85, 0.55, 90, h]];

const RECIPES: Partial<Record<BType, Recipe[]>> = {
  castle: [
    { main: 'building_castle', scale: 1.3, pieces: [] },
    { main: 'building_castle', scale: 1.36, pieces: FLAGS(3) },
    { main: 'building_castle', scale: 1.42, pieces: [...FLAGS(3.2), ['barrel', 0.85, 0.8, 0, 1.3], ['crate_A_big', -0.85, 0.8, 20, 1.1]] },
    { main: 'building_castle', scale: 1.48, pieces: [...FLAGS(3.4), ['flag', 0, -1.05, 90, 3.4], ['barrel', 0.85, 0.8, 0, 1.3]] },
    { main: 'building_castle', scale: 1.55, pieces: [...FLAGS(3.8), ['flag', -0.85, -0.7, 90, 3.8], ['flag', 0.85, -0.7, 90, 3.8]] },
  ],
  barn: [
    { main: 'building_home_B', scale: 1.0, pieces: [['crate_A_big', 0.6, 0.45, 15, 1.2], ['sack', -0.6, 0.5, 0, 1.4], ['barrel', 0.7, -0.1, 0, 1.2]], fences: [4, 5] },
    { main: 'building_home_B', scale: 1.1, pieces: [['crate_A_big', 0.6, 0.45, 15, 1.2], ['crate_B_big', 0.72, 0.05, 0, 1.1], ['sack', -0.6, 0.5, 0, 1.4], ['resource_lumber', -0.62, -0.2, 30, 1]], fences: [3, 4, 5] },
    { main: 'building_home_B', scale: 1.2, pieces: [['crate_A_big', 0.6, 0.45, 15, 1.2], ['crate_B_big', 0.72, 0.05, 0, 1.1], ['sack', -0.6, 0.5, 0, 1.4], ['resource_lumber', -0.62, -0.2, 30, 1], ['flag', 0.0, 0.8, 90, 2.6]], fences: [2, 3, 4, 5] },
  ],
  orders: [{ main: 'tent', scale: 1.2, pieces: [['crate_open', 0.5, 0.45, 20, 1.3], ['crate_long_A', -0.45, 0.5, -10, 1], ['sack', 0.65, -0.1, 0, 1.3], ['barrel', -0.65, -0.05, 0, 1.2], ['flag', 0.0, 0.75, 90, 2.4]] }],
  bakery: [{ main: 'building_windmill', scale: 0.95, pieces: [['sack', 0.62, 0.42, 20, 1.4], ['sack', 0.5, 0.6, 50, 1.3], ['barrel', -0.62, 0.4, 0, 1.2]] }],
  lumber: [{ main: 'building_lumbermill', scale: 0.92, pieces: [['resource_lumber', -0.5, 0.5, 30, 1.1], ['tree_single_A_cut', 0.6, 0.55, 0, 1], ['resource_lumber', 0.6, -0.5, -40, 1]] }],
  mine: [{ main: 'building_mine', scale: 0.92, pieces: [['resource_stone', 0.55, 0.5, 10, 1.1], ['wheelbarrow', -0.5, 0.6, 40, 1.3]] }],
  forge: [{ main: 'building_blacksmith', scale: 1.0, pieces: [['weaponrack', -0.55, 0.5, 30, 1.2], ['barrel', 0.62, 0.5, 0, 1.2], ['bucket_water', 0.45, 0.68, 0, 1.3]], smoke: [[0.3, 0.98, -0.05]] }],
  kitchen: [{ main: 'building_tavern', scale: 0.9, pieces: [['barrel', 0.62, 0.48, 0, 1.2], ['crate_open', -0.6, 0.45, 20, 1.2]], smoke: [[0.2, 1.3, -0.2]] }],
  barracks: [{ main: 'building_barracks', scale: 0.9, pieces: [['weaponrack', 0.62, 0.45, -20, 1.2], ['target', -0.62, 0.45, 30, 1.0], ['flag', 0.72, -0.1, 90, 2.6]] }],
  market: [{ main: 'building_market', scale: 0.95, pieces: [['crate_open', 0.55, 0.55, 20, 1.2], ['sack', -0.6, 0.5, 0, 1.3], ['barrel', 0.75, 0.0, 0, 1.2]] }],
  dairy: [{ main: 'building_home_A', scale: 1.0, pieces: [['bucket_water', 0.45, 0.55, 0, 1.4], ['barrel', 0.6, 0.3, 0, 1.2], ['barrel', -0.55, 0.45, 0, 1.2]], fences: [5], smoke: [[0.22, 1.0, -0.1]] }],
  weaver: [{ main: 'building_home_B', scale: 0.95, pieces: [['tent', -0.45, 0.45, 30, 0.5], ['crate_long_C', 0.55, 0.5, 0, 1], ['flag', 0.7, -0.2, 90, 2.4]] }],
  coop: [{ main: 'tent', scale: 0.55, mainX: -0.45, mainZ: -0.35, pieces: [['sack', 0.55, -0.45, 0, 1.2], ['bucket_empty', -0.1, -0.6, 0, 1.4]], fences: [0, 1, 2, 3, 4, 5] }],
  pasture: [{ main: 'tent', scale: 0.62, mainX: -0.45, mainZ: -0.4, pieces: [['bucket_water', 0.5, -0.5, 0, 1.4], ['sack', 0.65, -0.25, 0, 1.2]], fences: [0, 1, 2, 3, 4, 5] }],
  sheep: [{ main: 'tent', scale: 0.62, mainX: -0.45, mainZ: -0.4, pieces: [['barrel', 0.55, -0.45, 0, 1.2]], fences: [0, 1, 2, 3, 4, 5] }],
  field: [{ main: 'building_dirt', scale: 0.86, pieces: [], fences: [4, 5] }],
};

export interface BuildingVisual {
  group: THREE.Object3D;
  spinners: { obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; speed: number }[];
  smoke: THREE.Vector3[];
  height: number;
}

function spinAxis(obj: THREE.Object3D): 'x' | 'y' | 'z' {
  const box = new THREE.Box3();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox!); }
  });
  const s = box.getSize(new THREE.Vector3());
  if (s.x <= s.y && s.x <= s.z) return 'x';
  if (s.z <= s.y) return 'z';
  return 'y';
}

export function collectSpinners(root: THREE.Object3D, out: BuildingVisual['spinners']): void {
  root.traverse((o) => {
    const n = o.name;
    if (/fan/.test(n)) out.push({ obj: o, axis: spinAxis(o), speed: 1.2 });
    else if (/wheel/.test(n) && !/wheelbarrow/.test(n)) out.push({ obj: o, axis: spinAxis(o), speed: -0.9 });
    else if (/saw/.test(n)) out.push({ obj: o, axis: spinAxis(o), speed: 6 });
  });
}

export function composeBuilding(lib: ModelLibrary, type: BType, level: number, castleModel = 'building_castle'): BuildingVisual {
  const group = new THREE.Group();
  const spinners: BuildingVisual['spinners'] = [];
  const smoke: THREE.Vector3[] = [];
  const list = RECIPES[type];
  if (!list) return { group, spinners, smoke, height: 1 };
  const recipe = list[Math.min(list.length, tierOf(type, level)) - 1];
  const main = lib.clone(type === 'castle' ? castleModel : recipe.main);
  main.scale.setScalar(recipe.scale);
  main.position.set(recipe.mainX ?? 0, 0, recipe.mainZ ?? 0);
  group.add(main);
  for (const [model, x, z, rot = 0, scale = 1] of recipe.pieces) {
    if (!lib.has(model)) continue;
    const o = lib.clone(model);
    o.position.set(x, 0, z);
    o.rotation.y = (rot * Math.PI) / 180;
    o.scale.setScalar(scale);
    group.add(o);
  }
  for (const e of recipe.fences ?? []) {
    const o = lib.clone('fence_wood_straight');
    o.rotation.y = ((e - 3) * Math.PI) / 3;
    o.scale.set(1, 1, 0.98);
    group.add(o);
  }
  collectSpinners(group, spinners);
  group.updateMatrixWorld(true);
  for (const [x, y, z] of recipe.smoke ?? []) smoke.push(main.localToWorld(new THREE.Vector3(x, y, z)));
  const box = new THREE.Box3().setFromObject(main);
  mergeStatic(group, spinners.map((s) => s.obj), lib.material);
  return { group, spinners, smoke, height: box.max.y };
}

function floatAttr(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, size: number): THREE.BufferAttribute {
  const out = new Float32Array(a.count * size);
  for (let i = 0; i < a.count; i++) {
    out[i * size] = a.getX(i);
    if (size > 1) out[i * size + 1] = a.getY(i);
    if (size > 2) out[i * size + 2] = a.getZ(i);
  }
  return new THREE.BufferAttribute(out, size);
}

/** Merges all static meshes sharing the atlas material into one draw call (spinners and flags stay separate). */
export function mergeStatic(group: THREE.Object3D, keep: THREE.Object3D[], material: THREE.Material): void {
  const meshes: THREE.Mesh[] = [];
  const isKept = (o: THREE.Object3D): boolean => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (keep.includes(p)) return true;
    return false;
  };
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material === material && !isKept(m)) meshes.push(m);
  });
  if (meshes.length < 2) return;
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const geos = meshes.map((m) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', floatAttr(m.geometry.getAttribute('position'), 3));
    g.setAttribute('normal', floatAttr(m.geometry.getAttribute('normal'), 3));
    g.setAttribute('uv', floatAttr(m.geometry.getAttribute('uv'), 2));
    if (m.geometry.index) g.setIndex(Array.from(m.geometry.index.array));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    return g;
  });
  const allIndexed = geos.every((g) => g.index);
  const merged = mergeGeometries(allIndexed ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  geos.forEach((g) => g.dispose());
  if (!merged) return;
  for (const m of meshes) m.parent?.remove(m);
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.merged = true;
  group.add(mesh);
}

export function constructionVisual(lib: ModelLibrary, progress: number): THREE.Object3D {
  const name = progress < 0.34 ? 'building_stage_A' : progress < 0.67 ? 'building_stage_B' : 'building_stage_C';
  const o = lib.clone(name);
  o.scale.setScalar(1.15);
  return o;
}
