import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingType } from '../game/economy';
import type { ModelLibrary } from './assets';

/** Visual tier from level: buildings visibly evolve at these levels. */
export function tierOf(type: BuildingType, level: number): number {
  const steps = type === 'castle' ? [1, 2, 4, 6, 9] : [1, 3, 6, 10, 15];
  let t = 0;
  for (const s of steps) if (level >= s) t++;
  return Math.max(1, t);
}

type Piece = [model: string, x: number, z: number, rotDeg?: number, scale?: number];

interface Recipe { main: string; scale: number; pieces: Piece[]; fences?: number[]; smoke?: [number, number, number][] }

const edgeFence = (edge: number): Piece => ['fence_wood_straight', 0, 0, (edge - 3) * 60, 1];

const RECIPES: Record<Exclude<BuildingType, 'walls'>, Recipe[]> = {
  farm: [
    { main: 'building_grain', scale: 0.72, pieces: [] },
    { main: 'building_grain', scale: 0.82, pieces: [['sack', 0.62, 0.42, 20, 1.3]], fences: [4, 5] },
    { main: 'building_grain', scale: 0.84, pieces: [['building_windmill', 0.42, -0.42, -30, 0.55], ['sack', 0.62, 0.42, 20, 1.3], ['barrel', -0.62, 0.38, 0, 1.2]], fences: [4, 5] },
    { main: 'building_grain', scale: 0.86, pieces: [['building_windmill', 0.42, -0.42, -30, 0.62], ['sack', 0.62, 0.42, 20, 1.3], ['barrel', -0.62, 0.38, 0, 1.2], ['wheelbarrow', -0.2, 0.62, 60, 1.3]], fences: [3, 4, 5] },
    { main: 'building_grain', scale: 0.88, pieces: [['building_windmill', 0.4, -0.4, -30, 0.72], ['sack', 0.62, 0.42, 20, 1.3], ['barrel', -0.62, 0.38, 0, 1.2], ['wheelbarrow', -0.2, 0.62, 60, 1.3], ['flag', -0.55, -0.45, 90, 2.4]], fences: [2, 3, 4, 5] },
  ],
  lumber: [
    { main: 'building_lumbermill', scale: 0.72, pieces: [] },
    { main: 'building_lumbermill', scale: 0.78, pieces: [['resource_lumber', -0.5, 0.5, 30, 1.1]] },
    { main: 'building_lumbermill', scale: 0.84, pieces: [['resource_lumber', -0.5, 0.5, 30, 1.1], ['tree_single_A_cut', 0.55, 0.55, 0, 1], ['tree_single_B_cut', -0.62, -0.25, 0, 1], ['resource_lumber', 0.6, -0.5, -40, 1]] },
    { main: 'building_lumbermill', scale: 0.9, pieces: [['resource_lumber', -0.5, 0.5, 30, 1.1], ['tree_single_A_cut', 0.55, 0.55, 0, 1], ['tree_single_B_cut', -0.62, -0.25, 0, 1], ['resource_lumber', 0.6, -0.5, -40, 1], ['wheelbarrow', 0.05, 0.7, -70, 1.3], ['crate_long_A', -0.15, -0.65, 10, 1]] },
    { main: 'building_lumbermill', scale: 0.95, pieces: [['resource_lumber', -0.5, 0.5, 30, 1.1], ['tree_single_A_cut', 0.55, 0.55, 0, 1], ['trees_B_small', -0.55, -0.5, 0, 0.55], ['resource_lumber', 0.6, -0.5, -40, 1], ['wheelbarrow', 0.05, 0.7, -70, 1.3], ['flag', 0.7, 0.05, 90, 2.4]] },
  ],
  mine: [
    { main: 'building_mine', scale: 0.72, pieces: [] },
    { main: 'building_mine', scale: 0.78, pieces: [['resource_stone', 0.55, 0.5, 10, 1.1]] },
    { main: 'building_mine', scale: 0.84, pieces: [['resource_stone', 0.55, 0.5, 10, 1.1], ['wheelbarrow', -0.5, 0.6, 40, 1.3], ['crate_A_big', 0.7, -0.1, 15, 1]] },
    { main: 'building_mine', scale: 0.88, pieces: [['resource_stone', 0.55, 0.5, 10, 1.1], ['wheelbarrow', -0.5, 0.6, 40, 1.3], ['crate_A_big', 0.7, -0.1, 15, 1], ['resource_stone', -0.7, 0.05, -30, 1], ['bucket_empty', 0.25, 0.75, 0, 1.4]] },
    { main: 'building_mine', scale: 0.92, pieces: [['resource_stone', 0.55, 0.5, 10, 1.1], ['wheelbarrow', -0.5, 0.6, 40, 1.3], ['crate_A_big', 0.7, -0.1, 15, 1], ['resource_stone', -0.7, 0.05, -30, 1], ['flag', 0.72, 0.4, 90, 2.4]] },
  ],
  house: [
    { main: 'building_home_A', scale: 0.85, pieces: [], smoke: [[0.22, 0.95, -0.1]] },
    { main: 'building_home_A', scale: 0.92, pieces: [['barrel', 0.5, 0.45, 0, 1.2], ['bucket_water', 0.62, 0.25, 0, 1.3]], smoke: [[0.22, 1.0, -0.1]], fences: [5] },
    { main: 'building_home_B', scale: 0.9, pieces: [['barrel', 0.55, 0.45, 0, 1.2], ['crate_A_small', -0.55, 0.45, 20, 1.3]], smoke: [[0.0, 1.3, -0.35]], fences: [5] },
    { main: 'building_home_B', scale: 0.82, pieces: [['building_home_A', -0.45, 0.42, 30, 0.62], ['barrel', 0.6, 0.45, 0, 1.2]], smoke: [[0.0, 1.2, -0.3]], fences: [4, 5] },
    { main: 'building_tavern', scale: 0.8, pieces: [['building_home_A', -0.55, 0.45, 30, 0.55], ['barrel', 0.62, 0.48, 0, 1.2], ['flag', 0.7, -0.2, 90, 2.4]], smoke: [[0.2, 1.25, -0.2]], fences: [4, 5] },
  ],
  market: [
    { main: 'building_market', scale: 0.72, pieces: [] },
    { main: 'building_market', scale: 0.78, pieces: [['crate_open', 0.55, 0.55, 20, 1.2], ['sack', -0.6, 0.5, 0, 1.3]] },
    { main: 'building_market', scale: 0.82, pieces: [['crate_open', 0.55, 0.55, 20, 1.2], ['sack', -0.6, 0.5, 0, 1.3], ['tent', -0.1, -0.68, 0, 0.6]] },
    { main: 'building_market', scale: 0.86, pieces: [['crate_open', 0.55, 0.55, 20, 1.2], ['sack', -0.6, 0.5, 0, 1.3], ['tent', -0.1, -0.68, 0, 0.6], ['barrel', 0.75, 0.0, 0, 1.2], ['crate_long_B', 0.0, 0.7, 0, 1]] },
    { main: 'building_market', scale: 0.9, pieces: [['crate_open', 0.55, 0.55, 20, 1.2], ['sack', -0.6, 0.5, 0, 1.3], ['tent', -0.1, -0.68, 0, 0.6], ['barrel', 0.75, 0.0, 0, 1.2], ['crate_long_B', 0.0, 0.7, 0, 1], ['flag', -0.75, -0.1, 90, 2.4]] },
  ],
  forge: [
    { main: 'building_blacksmith', scale: 0.82, pieces: [], smoke: [[0.28, 0.85, -0.05]] },
    { main: 'building_blacksmith', scale: 0.86, pieces: [['weaponrack', -0.55, 0.5, 30, 1.2]], smoke: [[0.28, 0.9, -0.05]] },
    { main: 'building_blacksmith', scale: 0.9, pieces: [['weaponrack', -0.55, 0.5, 30, 1.2], ['barrel', 0.62, 0.5, 0, 1.2], ['bucket_water', 0.45, 0.68, 0, 1.3]], smoke: [[0.29, 0.94, -0.05]] },
    { main: 'building_blacksmith', scale: 0.94, pieces: [['weaponrack', -0.55, 0.5, 30, 1.2], ['barrel', 0.62, 0.5, 0, 1.2], ['bucket_water', 0.45, 0.68, 0, 1.3], ['resource_stone', -0.65, -0.3, 0, 0.9], ['crate_B_big', 0.7, -0.4, 10, 1]], smoke: [[0.3, 0.98, -0.05]] },
    { main: 'building_blacksmith', scale: 1.0, pieces: [['weaponrack', -0.55, 0.5, 30, 1.2], ['barrel', 0.62, 0.5, 0, 1.2], ['bucket_water', 0.45, 0.68, 0, 1.3], ['resource_stone', -0.65, -0.3, 0, 0.9], ['flag', -0.1, -0.75, 90, 2.4]], smoke: [[0.32, 1.04, -0.05]] },
  ],
  castle: [
    { main: 'building_castle', scale: 1.32, pieces: [] },
    { main: 'building_castle', scale: 1.24, pieces: [['flag', -0.85, 0.5, 90, 3], ['flag', 0.85, 0.5, 90, 3]] },
    { main: 'building_castle', scale: 1.28, pieces: [['flag', -0.85, 0.5, 90, 3], ['flag', 0.85, 0.5, 90, 3], ['barrel', 0.7, 0.75, 0, 1.2], ['crate_A_big', -0.72, 0.75, 20, 1]] },
    { main: 'building_castle', scale: 1.2, pieces: [['flag', -0.85, 0.5, 90, 3.4], ['flag', 0.85, 0.5, 90, 3.4], ['flag', 0, -0.95, 90, 3.4], ['barrel', 0.7, 0.75, 0, 1.2], ['crate_A_big', -0.72, 0.75, 20, 1]] },
    { main: 'building_castle', scale: 1.36, pieces: [['flag', -0.85, 0.5, 90, 3.8], ['flag', 0.85, 0.5, 90, 3.8], ['flag', -0.8, -0.6, 90, 3.8], ['flag', 0.8, -0.6, 90, 3.8], ['barrel', 0.7, 0.8, 0, 1.2]] },
  ],
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
    if (m.isMesh) {
      m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox!);
    }
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

export function composeBuilding(lib: ModelLibrary, type: BuildingType, level: number): BuildingVisual {
  const group = new THREE.Group();
  const spinners: BuildingVisual['spinners'] = [];
  const smoke: THREE.Vector3[] = [];
  if (type === 'walls') return { group, spinners, smoke, height: 1.2 };
  const tier = tierOf(type, level);
  const recipe = RECIPES[type][tier - 1];
  const main = lib.clone(recipe.main);
  main.scale.setScalar(recipe.scale);
  group.add(main);
  for (const [model, x, z, rot = 0, scale = 1] of recipe.pieces) {
    const o = lib.clone(model);
    o.position.set(x, 0, z);
    o.rotation.y = (rot * Math.PI) / 180;
    o.scale.setScalar(scale);
    group.add(o);
  }
  for (const e of recipe.fences ?? []) {
    const [model, x, z, rot = 0] = edgeFence(e);
    const o = lib.clone(model);
    o.position.set(x, 0, z);
    o.rotation.y = (rot * Math.PI) / 180;
    o.scale.set(1, 1, 0.98);
    group.add(o);
  }
  collectSpinners(group, spinners);
  group.updateMatrixWorld(true);
  // Smoke emitters and height in building space (computed before merging).
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
