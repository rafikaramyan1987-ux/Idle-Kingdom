// Small procedural farm life: crops growing on fields and animals wandering in their pens.
// (The CC0 KayKit packs have no farm animals or vegetables, so these are simple code-built shapes.)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });

function colored(g: THREE.BufferGeometry, color: string, m?: THREE.Matrix4): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g.clone();
  if (m) geo.applyMatrix4(m);
  const c = new THREE.Color(color);
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  geo.deleteAttribute('uv');
  return geo;
}

const T = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

const box = new THREE.BoxGeometry(1, 1, 1);
const ball = new THREE.IcosahedronGeometry(0.5, 1);
const cone = new THREE.ConeGeometry(0.5, 1, 6);

function build(parts: [THREE.BufferGeometry, string, THREE.Matrix4][]): THREE.BufferGeometry {
  return mergeGeometries(parts.map(([g, c, m]) => colored(g, c, m)))!;
}

const GEO = {
  chicken: build([
    [ball, '#fbfaf5', T(0, 0.11, 0, 0.18, 0.16, 0.22)],
    [ball, '#fbfaf5', T(0, 0.2, 0.09, 0.1, 0.11, 0.1)],
    [box, '#e23b2e', T(0, 0.27, 0.1, 0.02, 0.05, 0.06)],
    [cone, '#f2a531', T(0, 0.2, 0.15, 0.03, 0.05, 0.03).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))],
    [box, '#f2a531', T(0.04, 0.02, 0, 0.02, 0.05, 0.02)],
    [box, '#f2a531', T(-0.04, 0.02, 0, 0.02, 0.05, 0.02)],
  ]),
  cow: build([
    [box, '#f4f1ea', T(0, 0.26, 0, 0.24, 0.2, 0.42)],
    [box, '#2f2a28', T(0.07, 0.3, 0.06, 0.12, 0.13, 0.14)],
    [box, '#2f2a28', T(-0.08, 0.25, -0.1, 0.1, 0.1, 0.12)],
    [box, '#f4f1ea', T(0, 0.34, 0.27, 0.16, 0.15, 0.14)],
    [box, '#f2a3a8', T(0, 0.3, 0.35, 0.12, 0.07, 0.04)],
    [box, '#d9cfc0', T(0.07, 0.43, 0.25, 0.03, 0.05, 0.03)],
    [box, '#d9cfc0', T(-0.07, 0.43, 0.25, 0.03, 0.05, 0.03)],
    ...[[0.08, 0.14], [-0.08, 0.14], [0.08, -0.14], [-0.08, -0.14]].map(([x, z]) => [box, '#4a403a', T(x, 0.08, z, 0.05, 0.16, 0.05)] as [THREE.BufferGeometry, string, THREE.Matrix4]),
  ]),
  sheep: build([
    [ball, '#f7f5ef', T(0, 0.24, 0, 0.3, 0.24, 0.38)],
    [ball, '#f7f5ef', T(0.08, 0.3, 0.06, 0.18, 0.16, 0.18)],
    [ball, '#f7f5ef', T(-0.07, 0.3, -0.08, 0.18, 0.16, 0.18)],
    [box, '#3a3433', T(0, 0.3, 0.22, 0.11, 0.12, 0.12)],
    ...[[0.07, 0.1], [-0.07, 0.1], [0.07, -0.1], [-0.07, -0.1]].map(([x, z]) => [box, '#3a3433', T(x, 0.07, z, 0.04, 0.14, 0.04)] as [THREE.BufferGeometry, string, THREE.Matrix4]),
  ]),
  corn: build([
    [cone, '#4f9a3c', T(0, 0.22, 0, 0.09, 0.44, 0.09)],
    [box, '#f4c542', T(0.04, 0.2, 0.02, 0.04, 0.12, 0.04)],
  ]),
  carrot: build([
    [cone, '#58a83e', T(0, 0.08, 0, 0.1, 0.16, 0.1)],
    [cone, '#f08a2c', T(0, 0.02, 0, 0.06, 0.06, 0.06).multiply(new THREE.Matrix4().makeRotationX(Math.PI))],
  ]),
  cotton: build([
    [cone, '#4f8a3c', T(0, 0.12, 0, 0.05, 0.24, 0.05)],
    [ball, '#ffffff', T(0, 0.24, 0, 0.11, 0.1, 0.11)],
    [ball, '#ffffff', T(0.05, 0.19, 0.02, 0.08, 0.08, 0.08)],
  ]),
  wheat: build([
    [cone, '#d9b54a', T(0, 0.14, 0, 0.05, 0.28, 0.05)],
    [cone, '#e8c55a', T(0.05, 0.12, 0.02, 0.04, 0.24, 0.04)],
    [cone, '#cfa93f', T(-0.04, 0.13, -0.03, 0.04, 0.26, 0.04)],
  ]),
};

export type CropKind = 'wheat' | 'corn' | 'carrot' | 'cotton';
export type AnimalKind = 'chicken' | 'cow' | 'sheep';

/** Rows of plants on a field (instanced). `setGrowth(0..1)` scales them up. */
export class CropPatch {
  readonly mesh: THREE.InstancedMesh;
  private base: THREE.Matrix4[] = [];
  growth = -1;
  constructor(kind: CropKind) {
    const pts: [number, number][] = [];
    for (let r = -2; r <= 2; r++) for (let c = -3; c <= 3; c++) {
      const x = c * 0.2 + (r % 2) * 0.1, z = r * 0.22;
      if (Math.abs(x) * 0.5 + Math.abs(z) * 0.87 < 0.62 && Math.abs(x) < 0.7) pts.push([x, z]);
    }
    this.mesh = new THREE.InstancedMesh(GEO[kind], vcMat, pts.length);
    pts.forEach(([x, z], i) => this.base.push(new THREE.Matrix4().makeTranslation(x, 0.02, z).multiply(new THREE.Matrix4().makeRotationY(i * 1.3))));
    this.mesh.castShadow = true;
    this.setGrowth(0.2);
  }

  setGrowth(g: number): void {
    const k = Math.round(Math.max(0.15, Math.min(1, g)) * 20) / 20;
    if (k === this.growth) return;
    this.growth = k;
    const s = new THREE.Matrix4();
    this.base.forEach((m, i) => {
      s.makeScale(0.6 + 0.4 * k, k, 0.6 + 0.4 * k);
      this.mesh.setMatrixAt(i, m.clone().multiply(s));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** A few animals wandering inside a hex pen. */
export class AnimalPen {
  readonly group = new THREE.Group();
  private animals: { mesh: THREE.Mesh; x: number; z: number; tx: number; tz: number; wait: number; phase: number }[] = [];
  busy = false;
  constructor(kind: AnimalKind, count: number) {
    const geo = GEO[kind];
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, vcMat);
      mesh.castShadow = true;
      const a = (i / count) * Math.PI * 2;
      const x = Math.cos(a) * 0.35 + 0.15, z = Math.sin(a) * 0.3 + 0.15;
      mesh.position.set(x, 0, z);
      this.group.add(mesh);
      this.animals.push({ mesh, x, z, tx: x, tz: z, wait: Math.random() * 2, phase: Math.random() * 6 });
    }
  }

  update(dt: number, t: number): void {
    for (const a of this.animals) {
      a.wait -= dt;
      if (a.wait <= 0) {
        a.wait = 1.5 + Math.random() * 3;
        const r = Math.random() * 0.5, ang = Math.random() * Math.PI * 2;
        a.tx = 0.15 + Math.cos(ang) * r;
        a.tz = 0.15 + Math.sin(ang) * r * 0.8;
      }
      const dx = a.tx - a.x, dz = a.tz - a.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.02) {
        const step = Math.min(d, dt * 0.18);
        a.x += (dx / d) * step;
        a.z += (dz / d) * step;
        a.mesh.rotation.y = Math.atan2(dx, dz);
        a.mesh.position.y = Math.abs(Math.sin(t * 9 + a.phase)) * 0.02;
      } else {
        // Pecking / grazing while fed.
        a.mesh.rotation.x = this.busy ? Math.max(0, Math.sin(t * 3 + a.phase)) * 0.25 : 0;
        a.mesh.position.y = 0;
      }
      a.mesh.position.x = a.x;
      a.mesh.position.z = a.z;
    }
  }
}

export const animalOf = (type: string): AnimalKind | null => (type === 'coop' ? 'chicken' : type === 'pasture' ? 'cow' : type === 'sheep' ? 'sheep' : null);
