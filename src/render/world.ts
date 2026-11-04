import * as THREE from 'three';
import { buildMap, hexToWorld, key, type Cell } from '../game/map';
import type { Building, GameState } from '../game/state';
import { CASTLE_PLOT, WALLS_PLOT } from '../game/state';
import { ModelLibrary } from './assets';
import { composeBuilding, constructionVisual, tierOf, type BuildingVisual } from './buildingVisuals';
import { Birds, RegionClouds, Smoke, Villagers, createOcean, fogTexture } from './effects';
import { hash2 } from '../game/map';

const LOCKED_COLOR = new THREE.Color(0.58, 0.64, 0.74);
const WHITE = new THREE.Color(1, 1, 1);

interface InstanceRef { mesh: THREE.InstancedMesh; index: number }

interface BuildingView {
  id: number;
  key: string;
  root: THREE.Group;
  visual: BuildingVisual | null;
  pos: THREE.Vector3;
  bounce: number;
  smokeTimer: number;
}


export class World {
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  readonly lib: ModelLibrary;
  readonly smoke: Smoke;
  private hemi: THREE.HemisphereLight;
  private regionInstances = new Map<number, InstanceRef[]>();
  private regionFade = new Map<number, { t: number }>();
  private regionFx = new Map<number, RegionClouds>();
  private views = new Map<number, BuildingView>();
  private plotMarkers = new Map<number, THREE.Object3D>();
  private wallsGroup = new THREE.Group();
  private wallsKey = '';
  private spinners: BuildingVisual['spinners'] = [];
  private birds: Birds;
  private villagers: Villagers;
  private unlocked = new Set<number>([0]);
  private pickables: THREE.Object3D[] = [];
  private shadowDirty = true;
  private fogTex = fogTexture();
  reducedMotion = false;

  constructor(lib: ModelLibrary, quality: { villagers: number; smoke: number }) {
    this.lib = lib;
    const sky = new THREE.Color('#8fcbea');
    const horizon = new THREE.Color('#d6eef2');
    this.scene.background = skyTexture(sky, horizon);
    this.scene.fog = new THREE.Fog(horizon, 55, 130);

    this.hemi = new THREE.HemisphereLight(0xe4f2ff, 0x6f8a5c, 1.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffeccc, 2.5);
    this.sun.position.set(-14, 24, 12);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -19; sc.right = 19; sc.top = 19; sc.bottom = -19; sc.near = 1; sc.far = 70;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);

    this.scene.add(createOcean(lib.shared.time, horizon));
    this.buildTerrain();
    this.buildWatermill();
    this.buildRegionFx();
    this.smoke = new Smoke(quality.smoke);
    this.scene.add(this.smoke.points);
    this.birds = new Birds();
    this.scene.add(this.birds.group);
    this.villagers = new Villagers(quality.villagers, () => {
      const c = lib.clone('wheelbarrow');
      c.scale.setScalar(1.3);
      c.traverse((o) => { o.castShadow = false; });
      return c;
    });
    this.villagers.setAllowed((k) => {
      const c = buildMap().cells.get(k);
      return !!c && this.unlocked.has(c.region);
    });
    this.scene.add(this.villagers.group);
    this.scene.add(this.wallsGroup);
  }

  // ---------- Terrain ----------
  private buildTerrain(): void {
    const map = buildMap();
    type Entry = { cell: Cell; matrix: THREE.Matrix4 };
    const byModel = new Map<string, Entry[]>();
    const push = (model: string, cell: Cell, m: THREE.Matrix4): void => {
      if (!byModel.has(model)) byModel.set(model, []);
      byModel.get(model)!.push({ cell, matrix: m });
    };
    const tmp = new THREE.Object3D();
    for (const cell of map.cells.values()) {
      const w = hexToWorld(cell);
      tmp.position.set(w.x, 0, w.z);
      tmp.rotation.set(0, cell.rot, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      push(cell.tile, cell, tmp.matrix.clone());
      for (const d of cell.decor) {
        tmp.position.set(w.x + d.dx, 0, w.z + d.dz);
        tmp.rotation.set(0, d.rot, 0);
        tmp.scale.setScalar(d.scale);
        tmp.updateMatrix();
        push(d.model, cell, tmp.matrix.clone());
      }
    }
    for (const [model, entries] of byModel) {
      for (const part of this.lib.parts(model)) {
        const mesh = new THREE.InstancedMesh(part.geometry, this.lib.material, entries.length);
        mesh.castShadow = !model.startsWith('hex_');
        mesh.receiveShadow = true;
        entries.forEach((e, i) => {
          mesh.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(e.matrix, part.matrix));
          mesh.setColorAt(i, e.cell.region === 0 ? WHITE : LOCKED_COLOR);
          const list = this.regionInstances.get(e.cell.region) ?? [];
          list.push({ mesh, index: i });
          this.regionInstances.set(e.cell.region, list);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        this.scene.add(mesh);
      }
    }
  }

  private buildWatermill(): void {
    const map = buildMap();
    const wm = map.watermill;
    const w = hexToWorld(wm);
    const o = this.lib.clone('building_watermill');
    const a = wm.edge * 60;
    o.rotation.y = ((a - 270) * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.cos((a * Math.PI) / 180), 0, -Math.sin((a * Math.PI) / 180));
    o.position.set(w.x + dir.x * 0.32, 0, w.z + dir.z * 0.32);
    o.scale.setScalar(1.05);
    this.scene.add(o);
    const spinners: BuildingVisual['spinners'] = [];
    o.traverse((c) => { if (/wheel/.test(c.name)) spinners.push({ obj: c, axis: 'x', speed: -0.8 }); });
    this.spinners.push(...spinners);
  }

  private buildRegionFx(): void {
    const map = buildMap();
    const big = this.lib.parts('cloud_big'), small = this.lib.parts('cloud_small');
    for (const reg of map.regions) {
      if (reg.id === 0) continue;
      const cells = reg.cells.map((k) => { const c = map.cells.get(k)!; const w = hexToWorld(c); return { x: w.x, z: w.z, seed: hash2(c.q, c.r, 21) }; });
      const fx = new RegionClouds(cells, big, small, this.lib.cloudMaterial, this.fogTex);
      this.scene.add(fx.group);
      this.regionFx.set(reg.id, fx);
    }
  }

  /** Sync unlocked regions. New unlocks fade in with the clouds drifting away. */
  setUnlocked(regions: number[], animate: boolean): void {
    for (const r of regions) {
      if (this.unlocked.has(r)) continue;
      this.unlocked.add(r);
      this.regionFade.set(r, { t: animate && !this.reducedMotion ? 0 : 1 });
      const fx = this.regionFx.get(r);
      if (fx) { fx.clearing = true; if (!animate || this.reducedMotion) fx.fade = 1; }
    }
    // Re-lock (new era).
    for (const r of [...this.unlocked]) {
      if (!regions.includes(r)) {
        this.unlocked.delete(r);
        this.setRegionColor(r, LOCKED_COLOR);
        this.regionFx.get(r)?.reset();
      }
    }
    this.shadowDirty = true;
  }

  private setRegionColor(r: number, c: THREE.Color): void {
    const refs = this.regionInstances.get(r) ?? [];
    for (const ref of refs) {
      ref.mesh.setColorAt(ref.index, c);
      if (ref.mesh.instanceColor) ref.mesh.instanceColor.needsUpdate = true;
    }
  }

  // ---------- Buildings ----------
  plotPosition(plot: number): THREE.Vector3 {
    if (plot === CASTLE_PLOT) return new THREE.Vector3(0, 0, 0);
    if (plot === WALLS_PLOT) {
      const g = buildMap().walls[0];
      const w = hexToWorld(g);
      return new THREE.Vector3(w.x, 0, w.z);
    }
    const p = buildMap().plots[plot];
    const w = hexToWorld(p);
    return new THREE.Vector3(w.x, 0, w.z);
  }

  /** Rebuilds visuals whose level / tier / construction stage changed. */
  sync(s: GameState, now: number): void {
    const seen = new Set<number>();
    for (const b of s.buildings) {
      seen.add(b.id);
      if (b.type === 'walls') { this.syncWalls(b.level); continue; }
      const stage = b.level === 0 && b.upgradeEnd > 0 ? Math.floor(progress(b, now) * 3) : -1;
      const vkey = `${b.type}:${tierOf(b.type, b.level)}:${b.level > 0 ? 1 : 0}:${stage}:${b.upgradeEnd > 0 ? 1 : 0}`;
      let v = this.views.get(b.id);
      if (!v) {
        const root = new THREE.Group();
        root.position.copy(this.plotPosition(b.plot));
        root.userData.buildingId = b.id;
        root.userData.plot = b.plot;
        this.scene.add(root);
        v = { id: b.id, key: '', root, visual: null, pos: root.position.clone(), bounce: 0, smokeTimer: Math.random() * 2 };
        this.views.set(b.id, v);
      }
      if (v.key !== vkey) {
        const wasBuilt = v.key !== '' && v.key.split(':')[2] === '0' && b.level > 0;
        const tierUp = v.key !== '' && v.key.split(':')[1] !== String(tierOf(b.type, b.level));
        this.rebuildView(v, b, now);
        if ((wasBuilt || tierUp) && !this.reducedMotion) {
          v.bounce = 1;
          this.smoke.burst(v.pos.clone().setY(0.2), 12);
        }
        v.key = vkey;
        this.shadowDirty = true;
      }
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.scene.remove(v.root);
        this.views.delete(id);
      }
    }
    this.syncPlotMarkers(s);
    this.refreshSpinners();
  }

  private rebuildView(v: BuildingView, b: Building, now: number): void {
    v.root.clear();
    v.visual = null;
    if (b.level === 0) {
      v.root.add(constructionVisual(this.lib, progress(b, now)));
    } else {
      v.visual = composeBuilding(this.lib, b.type, b.level);
      v.root.add(v.visual.group);
      if (b.upgradeEnd > 0) {
        const sc = this.lib.clone('ladder');
        sc.position.set(0.55, 0, 0.55);
        sc.rotation.y = 0.6;
        sc.scale.setScalar(1.4);
        const cr = this.lib.clone('resource_lumber');
        cr.position.set(-0.6, 0, 0.6);
        v.root.add(sc, cr);
      }
    }
    // Rotate buildings to face the camera (south) a little, with per-plot variety.
    v.root.rotation.y = b.plot < 0 ? 0 : ((b.plot * 37) % 5 - 2) * 0.12;
  }

  private syncWalls(level: number): void {
    const map = buildMap();
    const n = level <= 0 ? 0 : Math.min(map.walls.length, level + 1);
    const flags = level >= 6;
    const k = `${n}:${flags}`;
    if (k === this.wallsKey) return;
    const grew = this.wallsKey !== '' && n > Number(this.wallsKey.split(':')[0]);
    this.wallsKey = k;
    this.wallsGroup.clear();
    map.walls.slice(0, n).forEach((w, i) => {
      const p = hexToWorld(w);
      const o = this.lib.clone(w.model);
      o.position.set(p.x, 0, p.z);
      o.rotation.y = w.rot;
      o.userData.walls = true;
      this.wallsGroup.add(o);
      if (flags && (w.gate || i % 2 === 0)) {
        const f = this.lib.clone('flag');
        f.position.set(p.x, 1.05, p.z);
        f.scale.setScalar(2.6);
        this.wallsGroup.add(f);
      }
      if (grew && i === n - 1 && !this.reducedMotion) this.smoke.burst(new THREE.Vector3(p.x, 0.3, p.z), 10);
    });
    this.wallsGroup.traverse((o) => { o.userData.walls = true; });
    this.shadowDirty = true;
  }

  private syncPlotMarkers(s: GameState): void {
    const map = buildMap();
    const used = new Set(s.buildings.map((b) => b.plot));
    for (const p of map.plots) {
      const want = this.unlocked.has(p.region) && !used.has(p.id);
      const has = this.plotMarkers.get(p.id);
      if (want && !has) {
        const o = this.lib.clone('building_dirt');
        o.scale.setScalar(0.78);
        const w = hexToWorld(p);
        o.position.set(w.x, 0.005, w.z);
        o.userData.plot = p.id;
        o.traverse((c) => { c.castShadow = false; c.userData.plot = p.id; });
        this.scene.add(o);
        this.plotMarkers.set(p.id, o);
      } else if (!want && has) {
        this.scene.remove(has);
        this.plotMarkers.delete(p.id);
      }
    }
  }

  private refreshSpinners(): void {
    this.spinners = this.spinners.filter((s) => isInScene(s.obj));
    for (const v of this.views.values()) {
      for (const sp of v.visual?.spinners ?? []) if (!this.spinners.includes(sp)) this.spinners.push(sp);
    }
  }

  /** Where to anchor HTML labels above a building. */
  labelAnchor(id: number): THREE.Vector3 | null {
    const v = this.views.get(id);
    if (!v) return null;
    const h = v.visual ? v.visual.height * (v.visual.group.children[0]?.scale.x ?? 1) : 1.0;
    return v.pos.clone().setY(Math.max(0.9, h + 0.25));
  }

  regionAnchor(region: number): THREE.Vector3 {
    const c = buildMap().regions[region].center;
    return new THREE.Vector3(c.x, 2.4, c.z);
  }

  /** Objects for raycasting taps. */
  pickTargets(): THREE.Object3D[] {
    this.pickables.length = 0;
    for (const v of this.views.values()) this.pickables.push(v.root);
    for (const m of this.plotMarkers.values()) this.pickables.push(m);
    this.pickables.push(this.wallsGroup);
    return this.pickables;
  }

  consumeShadowDirty(): boolean {
    const d = this.shadowDirty;
    this.shadowDirty = false;
    return d;
  }

  markShadowDirty(): void {
    this.shadowDirty = true;
  }

  isUnlocked(region: number): boolean {
    return this.unlocked.has(region);
  }

  update(dt: number, t: number, s: GameState, now: number): void {
    this.lib.shared.time.value = t;
    const motion = this.reducedMotion ? 0.25 : 1;
    for (const sp of this.spinners) sp.obj.rotation[sp.axis] += sp.speed * dt * motion;
    // Region unlock fades
    for (const [r, f] of this.regionFade) {
      f.t = Math.min(1, f.t + dt / 1.6);
      const c = LOCKED_COLOR.clone().lerp(WHITE, easeOut(f.t));
      this.setRegionColor(r, c);
      if (f.t >= 1) this.regionFade.delete(r);
    }
    for (const fx of this.regionFx.values()) fx.update(dt, t, this.reducedMotion);
    // Buildings: bounce, smoke, construction progress
    for (const v of this.views.values()) {
      if (v.bounce > 0) {
        v.bounce = Math.max(0, v.bounce - dt * 1.6);
        const k = v.bounce;
        const sc = 1 + Math.sin(k * Math.PI * 3) * 0.12 * k;
        v.root.scale.set(sc, 2 - sc, sc);
      } else v.root.scale.set(1, 1, 1);
      if (v.visual && v.visual.smoke.length && !this.reducedMotion) {
        v.smokeTimer -= dt;
        if (v.smokeTimer <= 0) {
          v.smokeTimer = 0.7 + Math.random() * 0.5;
          for (const sp of v.visual.smoke) {
            const p = sp.clone();
            v.visual.group.children[0].localToWorld(p);
            this.smoke.emit(p);
          }
        }
      }
    }
    this.sync(s, now);
    if (!this.reducedMotion) this.birds.update(t);
    this.villagers.update(this.reducedMotion ? dt * 0.4 : dt, t);
    this.smoke.update(dt);
  }

  setPointScale(px: number): void {
    this.smoke.setScale(px);
    for (const fx of this.regionFx.values()) fx.setScale(px);
  }

  setShadowQuality(size: number): void {
    if (size <= 0) {
      this.sun.castShadow = false;
    } else {
      this.sun.castShadow = true;
      if (this.sun.shadow.mapSize.x !== size) {
        this.sun.shadow.mapSize.set(size, size);
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
      }
    }
    this.shadowDirty = true;
  }
}

function progress(b: Building, now: number): number {
  if (b.upgradeEnd <= 0) return 1;
  const total = Math.max(1, b.upgradeEnd - b.upgradeStart);
  return Math.min(1, Math.max(0, (now - b.upgradeStart) / total));
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function isInScene(o: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o;
  while (p) {
    if ((p as THREE.Scene).isScene) return true;
    p = p.parent;
  }
  return false;
}

function skyTexture(top: THREE.Color, bottom: THREE.Color): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, `#${top.getHexString()}`);
  grd.addColorStop(0.65, `#${bottom.getHexString()}`);
  grd.addColorStop(1, `#${bottom.getHexString()}`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export { key };
