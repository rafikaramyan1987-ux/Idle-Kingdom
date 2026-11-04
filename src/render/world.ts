import * as THREE from 'three';
import { COURTYARD, buildMap, hexToWorld, key, type Cell } from '../game/map';
import type { Building, GameState } from '../game/state';
import { CASTLE_PLOT, WALLS_PLOT, nextRegion } from '../game/state';
import { BUILDINGS, DECOR, SKINS, campEnemies, heroDef, type BType, type HeroId } from '../game/defs';
import { AnimalPen, CropPatch, animalOf, type CropKind } from './farmLife';
import type { Character, CharacterLibrary } from './characters';
import { ModelLibrary } from './assets';
import { composeBuilding, constructionVisual, mergeStatic, tierOf, type BuildingVisual } from './buildingVisuals';
import { Birds, RegionClouds, Smoke, Villagers, createOcean, fogTexture } from './effects';
import { hash2, hexDist } from '../game/map';

const LOCKED_COLOR = new THREE.Color(0.86, 0.9, 1.0);
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
  crop: CropPatch | null;
  cropMain?: THREE.Object3D;
  pen: AnimalPen | null;
  working: boolean;
  type: BType;
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
  private spinnerOwner = new Map<BuildingVisual['spinners'][number], BuildingView>();
  private campGroup = new THREE.Group();
  private campChars: Character[] = [];
  private campKey = '';
  private ruinsGroup = new THREE.Group();
  private ruinsKey = '';
  private chestGroup = new THREE.Group();
  private chestKey = '';
  private decorGroup = new THREE.Group();
  private decorKey = '';
  private cartGroup = new THREE.Group();
  private cartShown = false;
  private cartT = 0;
  private heroChars: Character[] = [];
  private heroKey = '';
  private towerSpots: THREE.Vector3[] = [];
  private battleActive = false;
  private battleRegion: number | null = null;
  visitorPos: THREE.Vector3 | null = null;
  chars: CharacterLibrary | null = null;
  private shadowDirty = true;
  private fogTex = fogTexture();
  reducedMotion = false;

  constructor(lib: ModelLibrary, quality: { villagers: number; smoke: number }) {
    this.lib = lib;
    const sky = new THREE.Color('#5aa9e6');
    const horizon = new THREE.Color('#bfe5f6');
    this.scene.background = skyTexture(sky, horizon);
    this.scene.fog = new THREE.Fog(horizon, 60, 160);

    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5f7f48, 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d2, 3.1);
    this.sun.position.set(-20, 22, 6);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -19; sc.right = 19; sc.top = 19; sc.bottom = -19; sc.near = 1; sc.far = 70;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 4;
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
      // Clouds only drift over the outer rim of locked land; inner locked tiles stay visible (tinted).
      const cells = reg.cells
        .map((k) => map.cells.get(k)!)
        .filter((c) => hexDist(c) >= 6)
        .map((c) => { const w = hexToWorld(c); return { x: w.x, z: w.z, seed: hash2(c.q, c.r, 21) }; });
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

  cellPosition(q: number, r: number): THREE.Vector3 {
    const w = hexToWorld({ q, r });
    return new THREE.Vector3(w.x, 0, w.z);
  }

  /** Rebuilds visuals whose type / tier / construction stage / crop changed. */
  sync(s: GameState, now: number): void {
    const seen = new Set<number>();
    for (const b of s.buildings) {
      seen.add(b.id);
      if (b.type === 'walls') { this.syncWalls(b.level); continue; }
      const building = b.buildEnd > 0;
      const stage = building ? Math.floor(buildProgress(b, now) * 3) : -1;
      const crop = b.type === 'field' ? (b.jobs[0]?.recipe ?? b.ready[0] ?? '') : '';
      const lvl = b.type === 'castle' ? b.level : b.type === 'barn' ? s.barnLevel : 1;
      const vkey = `${b.type}:${tierOf(b.type, lvl)}:${building ? 0 : 1}:${stage}:${crop}:${b.type === 'castle' ? s.skin : ''}`;
      let v = this.views.get(b.id);
      if (!v) {
        const root = new THREE.Group();
        root.position.copy(this.plotPosition(b.plot));
        root.userData.buildingId = b.id;
        root.userData.plot = b.plot;
        this.scene.add(root);
        v = { id: b.id, key: '', root, visual: null, pos: root.position.clone(), bounce: 0, smokeTimer: Math.random() * 2, crop: null, pen: null, working: false, type: b.type };
        this.views.set(b.id, v);
      }
      v.working = b.jobs.length > 0 && b.buildEnd === 0;
      if (v.pen) v.pen.busy = v.working;
      if (v.crop) {
        const j = b.jobs[0];
        v.crop.setGrowth(j ? (now - j.start) / Math.max(1, j.end - j.start) : b.ready.length ? 1 : 0);
      }
      if (v.key !== vkey) {
        const old = v.key.split(':');
        const finished = v.key !== '' && old[2] === '0' && !building;
        const tierUp = v.key !== '' && old[1] !== String(tierOf(b.type, lvl));
        this.rebuildView(v, b, s, now, lvl, crop);
        if ((finished || tierUp) && !this.reducedMotion) {
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
    this.syncExtras(s);
    this.refreshSpinners();
  }

  private rebuildView(v: BuildingView, b: Building, s: GameState, now: number, lvl: number, crop: string): void {
    v.root.traverse((o) => { if (o.userData.merged) (o as THREE.Mesh).geometry.dispose(); });
    v.root.clear();
    v.visual = null;
    v.crop = null;
    v.pen = null;
    if (b.buildEnd > 0) {
      v.root.add(constructionVisual(this.lib, buildProgress(b, now)));
    } else {
      v.visual = composeBuilding(this.lib, b.type, lvl, SKINS[s.skin]);
      v.root.add(v.visual.group);
      if (b.type === 'field' && crop) {
        if (crop === 'wheat') {
          const grain = this.lib.clone('building_grain');
          grain.scale.setScalar(0.78);
          const patch = new CropPatch('wheat');
          patch.mesh.visible = false;
          v.crop = patch;
          v.root.add(grain);
          v.cropMain = grain;
        } else {
          v.crop = new CropPatch(crop as CropKind);
          v.root.add(v.crop.mesh);
        }
      }
      const animal = animalOf(b.type);
      if (animal) {
        v.pen = new AnimalPen(animal, BUILDINGS[b.type].slots + (s.extraSlots[b.type] ?? 0));
        v.root.add(v.pen.group);
      }
    }
    // Small per-plot variety; the castle and barn face the camera.
    v.root.rotation.y = b.plot < 0 || b.type === 'field' || animalOf(b.type) ? 0 : ((b.plot * 37) % 5 - 2) * 0.1;
  }

  private syncWalls(level: number): void {
    const map = buildMap();
    const n = level <= 0 ? 0 : Math.min(map.walls.length, level + 1);
    const flags = level >= 5;
    const towers = Math.min(4, level);
    const k = `${n}:${flags}:${towers}`;
    if (k === this.wallsKey) return;
    const grew = this.wallsKey !== '' && n > Number(this.wallsKey.split(':')[0]);
    this.wallsKey = k;
    this.wallsGroup.traverse((o) => { if (o.userData.merged) (o as THREE.Mesh).geometry.dispose(); });
    this.wallsGroup.clear();
    this.towerSpots = [];
    map.walls.slice(0, n).forEach((w, i) => {
      const p = hexToWorld(w);
      const o = this.lib.clone(w.model);
      o.position.set(p.x, 0, p.z);
      o.rotation.y = w.rot;
      this.wallsGroup.add(o);
      if (flags && (w.gate || i % 2 === 0)) {
        const f = this.lib.clone('flag');
        f.position.set(p.x, 1.05, p.z);
        f.scale.setScalar(2.6);
        this.wallsGroup.add(f);
      }
      if (grew && i === n - 1 && !this.reducedMotion) this.smoke.burst(new THREE.Vector3(p.x, 0.3, p.z), 10);
    });
    // Defence towers on the wall ring (they shoot at raiders).
    const towerCells = map.walls.filter((w) => !w.gate).slice(0, towers);
    for (const w of towerCells) {
      const p = hexToWorld(w);
      const t = this.lib.clone('building_tower_base');
      t.scale.setScalar(0.55);
      t.position.set(p.x, 0.25, p.z);
      this.wallsGroup.add(t);
      this.towerSpots.push(new THREE.Vector3(p.x, 0, p.z));
    }
    this.wallsGroup.updateMatrixWorld(true);
    mergeStatic(this.wallsGroup, [], this.lib.material);
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

  /** Camps, ruins, chests, decorations, the cart, heroes in the courtyard and visiting heroes. */
  private syncExtras(s: GameState): void {
    const map = buildMap();
    // Enemy camp of the next region.
    const nr = nextRegion(s);
    const campKey = `${nr}:${this.chars?.ready ? 1 : 0}:${this.battleActive && this.battleRegion === nr ? 1 : 0}`;
    if (campKey !== this.campKey) {
      this.campKey = campKey;
      this.campGroup.clear();
      this.campChars = [];
      const c = nr !== null ? map.camps[nr] : null;
      if (c) {
        const p = this.cellPosition(c.q, c.r);
        this.campGroup.position.copy(p);
        this.campGroup.userData.camp = nr;
        const tent = this.lib.clone('tent');
        tent.scale.setScalar(0.8);
        tent.position.set(0.35, 0, -0.35);
        const rack = this.lib.clone('weaponrack');
        rack.position.set(-0.5, 0, -0.3);
        rack.scale.setScalar(1.3);
        const fire = this.lib.clone('resource_lumber');
        fire.position.set(0, 0, 0.15);
        fire.scale.setScalar(0.7);
        this.campGroup.add(tent, rack, fire);
        if (this.chars?.ready && !(this.battleActive && this.battleRegion === nr)) {
          const kinds = ['skeleton_warrior', 'skeleton_minion', 'skeleton_mage'];
          const n = Math.min(3, campEnemies(nr!).length);
          const toCastle = Math.atan2(-p.x, -p.z);
          for (let i = 0; i < n; i++) {
            const ch = this.chars.spawn(kinds[i % kinds.length]);
            if (!ch) continue;
            ch.root.scale.setScalar(0.52);
            ch.root.position.set(-0.4 + i * 0.4, 0, 0.35 - (i % 2) * 0.2);
            ch.root.rotation.y = toCastle;
            this.campGroup.add(ch.root);
            this.campChars.push(ch);
          }
        }
        this.campGroup.traverse((o) => { o.userData.camp = nr; });
        if (!this.campGroup.parent) this.scene.add(this.campGroup);
      }
      this.shadowDirty = true;
    }
    // Ruins in unlocked land (restored ones become a small tower).
    const ruinsKey = map.ruins.map((r) => `${r.region}:${s.regions.includes(r.region) ? 1 : 0}:${s.ruinsDone.includes(r.region) ? 1 : 0}`).join('|');
    if (ruinsKey !== this.ruinsKey) {
      this.ruinsKey = ruinsKey;
      this.ruinsGroup.clear();
      for (const r of map.ruins) {
        const done = s.ruinsDone.includes(r.region);
        const o = this.lib.clone(done ? 'building_tower_B' : 'building_destroyed');
        o.position.copy(this.cellPosition(r.q, r.r));
        o.scale.setScalar(done ? 0.8 : 1);
        o.traverse((c) => { c.userData.ruins = r.region; });
        this.ruinsGroup.add(o);
      }
      if (!this.ruinsGroup.parent) this.scene.add(this.ruinsGroup);
      this.shadowDirty = true;
    }
    // Chests
    const chestKey = s.chests.map((c) => c.id).join(',');
    if (chestKey !== this.chestKey) {
      this.chestKey = chestKey;
      this.chestGroup.clear();
      for (const c of s.chests) {
        const o = this.lib.clone(c.big ? 'crate_A_big' : 'crate_B_small');
        o.scale.setScalar(c.big ? 1.6 : 2.2);
        o.position.copy(this.cellPosition(c.q, c.r)).add(new THREE.Vector3(0.35, 0, 0.3));
        o.traverse((x) => { x.userData.chest = c.id; });
        o.userData.base = o.position.clone();
        this.chestGroup.add(o);
      }
      if (!this.chestGroup.parent) this.scene.add(this.chestGroup);
    }
    // Decorations
    const decorKey = s.decor.map((d) => `${d.id}@${d.q},${d.r}`).join('|');
    if (decorKey !== this.decorKey) {
      this.decorKey = decorKey;
      this.decorGroup.clear();
      for (const d of s.decor) {
        const o = this.lib.clone(DECOR[d.id].model);
        o.position.copy(this.cellPosition(d.q, d.r)).add(new THREE.Vector3(-0.35, 0, 0.35));
        if (d.id === 'flags') o.scale.setScalar(3);
        this.decorGroup.add(o);
      }
      if (!this.decorGroup.parent) this.scene.add(this.decorGroup);
      this.shadowDirty = true;
    }
    // Cart parked on the road by the order board.
    const hasCart = !!s.cart;
    if (hasCart !== this.cartShown) {
      this.cartShown = hasCart;
      this.cartGroup.clear();
      if (hasCart) {
        const cart = this.lib.clone('wheelbarrow');
        cart.scale.setScalar(3.2);
        for (const [m, x, z] of [['crate_A_small', 0.05, -0.05], ['sack', -0.1, 0.15], ['barrel', 0.1, 0.2]] as const) {
          const o = this.lib.clone(m);
          o.position.set(x, 0.55, z);
          o.scale.setScalar(1.1);
          cart.add(o);
          o.scale.setScalar(1.1 / 3.2);
          o.position.set(x / 3.2, 0.17, z / 3.2);
        }
        cart.traverse((o) => { o.userData.cart = true; });
        this.cartGroup.add(cart);
        this.cartT = 0;
        if (!this.cartGroup.parent) this.scene.add(this.cartGroup);
      }
    }
    // Heroes relaxing in the castle courtyard; a visitor waits at the gate.
    if (this.chars?.ready) {
      const ids = this.battleActive ? [] : (Object.keys(s.heroes) as HeroId[]);
      const heroKey = ids.join(',') + `|${s.visitor?.hero ?? ''}`;
      if (heroKey !== this.heroKey) {
        this.heroKey = heroKey;
        for (const h of this.heroChars) this.scene.remove(h.root);
        this.heroChars = [];
        const spots = [...COURTYARD.map((c) => this.cellPosition(c.q, c.r)), new THREE.Vector3(-0.9, 0, 1.9), new THREE.Vector3(0.9, 0, 1.9)];
        ids.forEach((id, i) => {
          const ch = this.chars!.spawn(heroDef(id).model);
          if (!ch) return;
          ch.root.scale.setScalar(0.58);
          ch.root.position.copy(spots[i % spots.length]).add(new THREE.Vector3(0.2, 0, 0.35));
          ch.root.rotation.y = 0.3 - i * 0.4;
          ch.root.traverse((o) => { o.userData.hero = id; });
          this.scene.add(ch.root);
          this.heroChars.push(ch);
        });
        if (s.visitor) {
          const ch = this.chars.spawn(heroDef(s.visitor.hero).model);
          if (ch) {
            const g = buildMap().walls.find((w) => w.gate)!;
            ch.root.scale.setScalar(0.6);
            ch.root.position.copy(this.cellPosition(g.q - 1, g.r + 1)).add(new THREE.Vector3(0.3, 0, 0));
            ch.root.rotation.y = 2.4;
            ch.root.traverse((o) => { o.userData.visitor = true; });
            ch.play('cheer');
            this.scene.add(ch.root);
            this.heroChars.push(ch);
            this.visitorPos = ch.root.position.clone();
          }
        } else this.visitorPos = null;
      }
    }
  }

  private refreshSpinners(): void {
    this.spinners = this.spinners.filter((s) => isInScene(s.obj));
    for (const v of this.views.values()) {
      for (const sp of v.visual?.spinners ?? []) if (!this.spinners.includes(sp)) { this.spinners.push(sp); this.spinnerOwner.set(sp, v); }
    }
  }

  /** Where to anchor HTML bubbles above a building. */
  labelAnchor(id: number): THREE.Vector3 | null {
    const v = this.views.get(id);
    if (!v) return null;
    const h = v.visual ? Math.min(2.6, v.visual.height) : 1.0;
    return v.pos.clone().setY(Math.max(0.8, h + 0.2));
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
    this.pickables.push(this.wallsGroup, this.campGroup, this.ruinsGroup, this.chestGroup, this.cartGroup);
    for (const h of this.heroChars) this.pickables.push(h.root);
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

  setBattle(active: boolean, region: number | null): void {
    this.battleActive = active;
    this.battleRegion = region;
    this.heroKey = '';
    this.campKey = '';
  }

  get towers(): THREE.Vector3[] { return this.towerSpots; }

  update(dt: number, t: number, s: GameState, now: number): void {
    this.lib.shared.time.value = t;
    const motion = this.reducedMotion ? 0.25 : 1;
    for (const sp of this.spinners) {
      const owner = this.spinnerOwner.get(sp);
      if (owner && !owner.working) continue;
      sp.obj.rotation[sp.axis] += sp.speed * dt * motion;
    }
    for (const [r, f] of this.regionFade) {
      f.t = Math.min(1, f.t + dt / 1.6);
      const c = LOCKED_COLOR.clone().lerp(WHITE, easeOut(f.t));
      this.setRegionColor(r, c);
      if (f.t >= 1) this.regionFade.delete(r);
    }
    for (const fx of this.regionFx.values()) fx.update(dt, t, this.reducedMotion);
    for (const v of this.views.values()) {
      if (v.bounce > 0) {
        v.bounce = Math.max(0, v.bounce - dt * 1.6);
        const k = v.bounce;
        const sc = 1 + Math.sin(k * Math.PI * 3) * 0.12 * k;
        v.root.scale.set(sc, 2 - sc, sc);
      } else v.root.scale.set(1, 1, 1);
      if (v.cropMain && v.crop) v.cropMain.scale.set(0.78, 0.25 + 0.75 * Math.max(0, v.crop.growth), 0.78);
      if (v.pen) v.pen.update(dt * motion, t);
      if (v.visual && v.visual.smoke.length && !this.reducedMotion && (v.working || v.type === 'dairy')) {
        v.smokeTimer -= dt;
        if (v.smokeTimer <= 0) {
          v.smokeTimer = 0.7 + Math.random() * 0.5;
          for (const sp of v.visual.smoke) this.smoke.emit(v.root.localToWorld(sp.clone()));
        }
      }
    }
    for (const c of this.chestGroup.children) {
      const b = c.userData.base as THREE.Vector3;
      c.position.y = b.y + Math.abs(Math.sin(t * 3 + b.x)) * 0.08;
      c.rotation.y = Math.sin(t * 1.5 + b.z) * 0.3;
    }
    if (this.cartShown && this.cartGroup.children[0]) {
      this.cartT = Math.min(1, this.cartT + dt / 4);
      const from = this.cellPosition(-6, 6), to = this.cellPosition(-4, 4).add(new THREE.Vector3(0.3, 0, -0.2));
      const cart = this.cartGroup.children[0];
      cart.position.lerpVectors(from, to, easeOut(this.cartT));
      cart.rotation.y = Math.atan2(to.x - from.x, to.z - from.z) + Math.PI;
    }
    for (const ch of this.campChars) ch.update(dt * motion);
    for (const ch of this.heroChars) {
      if (!ch.busy && ch.current_name !== 'idle') ch.play('idle', 0.4);
      ch.update(dt * motion);
    }
    this.sync(s, now);
    if (!this.reducedMotion) this.birds.update(t);
    this.villagers.update(this.reducedMotion ? dt * 0.4 : dt, t);
    this.smoke.update(dt);
  }

  /** Keep distance fog behind the island whatever the zoom, so unlocked land is never hazy. */
  updateFog(cameraDistance: number): void {
    const f = this.scene.fog as THREE.Fog;
    f.near = cameraDistance + 22;
    f.far = cameraDistance + 120;
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

function buildProgress(b: Building, now: number): number {
  if (b.buildEnd <= 0) return 1;
  const total = Math.max(1, b.buildEnd - b.buildStart);
  return Math.min(1, Math.max(0, (now - b.buildStart) / total));
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
