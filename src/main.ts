import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import './style.css';
import * as THREE from 'three';
import { AdPacer } from './game/ads';
import { BUILDABLE, RESOURCES, type Bundle, type BuildingType } from './game/economy';
import { formatNumber } from './game/format';
import { heroDef, type HeroId } from './game/heroes';
import { buildMap, hexToWorld, worldToHex, key, hexDist } from './game/map';
import { loadFrom, saveTo, safeLocalStorage, type KeyValueStore } from './game/save';
import * as G from './game/state';
import type { GameState, OfflineReport } from './game/state';
import { detectLang, setLang, t, type Key } from './i18n';
import { Platform } from './platform/sdk';
import { Audio } from './audio/audio';
import { ModelLibrary } from './render/assets';
import { CameraRig } from './render/camera';
import { World } from './render/world';
import { composeBuilding } from './render/buildingVisuals';
import { AdaptiveQuality, TIERS, type QualityTier } from './render/quality';
import { UI, mainRes, type ScreenPoint } from './ui/ui';
import { coverState } from './cover';

declare const __CRAZYGAMES__: boolean;

const params = new URLSearchParams(location.search);
const COVER = params.has('cover');
const E2E = params.has('e2e');

class App {
  state!: GameState;
  private store: KeyValueStore | null = safeLocalStorage();
  private platform = new Platform();
  private audio = new Audio();
  private renderer!: THREE.WebGLRenderer;
  private rig!: CameraRig;
  private world!: World;
  private ui!: UI;
  private quality!: AdaptiveQuality;
  private pacer = new AdPacer(Date.now());
  private thumbs = new Map<BuildingType, string>();
  private lastFrame = 0;
  private lastRender = 0;
  private uiTimer = 0;
  private saveTimer = 0;
  private running = false;
  private raf = 0;
  private offline: OfflineReport | null = null;
  private clock = 0;
  private raycaster = new THREE.Raycaster();
  private reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  frames = 0;

  async start(): Promise<void> {
    const wantSdk = __CRAZYGAMES__ || params.has('cg');
    await this.platform.init(wantSdk);
    this.platform.loadingStart();
    const now = Date.now();
    if (COVER) this.state = coverState(now);
    else {
      const ds = this.platform.dataStore;
      this.state = (ds ? loadFrom(ds, now) : null) ?? loadFrom(this.store, now) ?? G.newGame(now);
      if (E2E) this.state = G.newGame(now);
    }
    setLang(this.state.settings.lang === 'auto' ? detectLang() : this.state.settings.lang);
    setLoadingText(t('ui.loading'));

    const startTier = this.state.settings.quality === 'high' ? 2 : this.state.settings.quality === 'low' ? 0 : COVER ? 2 : AdaptiveQuality.initialIndex();
    this.initRenderer(TIERS[startTier]);
    const lib = await ModelLibrary.load(`${import.meta.env.BASE_URL}assets/kingdom.glb`, (p) => setLoadingProgress(p));
    const tier = TIERS[startTier];
    this.world = new World(lib, { villagers: tier.name === 'low' ? 5 : 10, smoke: tier.name === 'low' ? 32 : 64 });
    this.world.reducedMotion = this.reducedMotion;
    this.quality = new AdaptiveQuality(startTier, (q) => this.applyQuality(q));
    this.quality.auto = this.state.settings.quality === 'auto' && !COVER && !E2E;
    this.applyQuality(TIERS[startTier]);
    this.makeThumbnails();

    // Offline progress: finish upgrades that completed while away, then report earnings.
    this.offline = COVER ? null : G.offlineEarnings(this.state, now);
    G.tick(this.state, now, 0);
    this.world.setUnlocked(this.state.regions, false);
    this.world.sync(this.state, now);

    this.ui = new UI(this.actions());
    this.audio.setSfx(this.state.settings.sfx);
    this.audio.setMusic(this.state.settings.music);
    this.platform.onAdState = (running) => this.audio.setAdMuted(running);
    this.platform.onMuteChange = (m) => this.audio.setAdMuted(m);

    this.rig.onTap = (x, y) => this.onTap(x, y);
    this.rig.focus(0, 0.9, window.innerWidth > window.innerHeight ? 18 : 13, true);
    window.addEventListener('pointerdown', () => this.audio.unlock(), { capture: true });
    window.addEventListener('keydown', () => this.audio.unlock(), { capture: true });

    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', () => this.save());
    window.addEventListener('resize', () => this.resize());
    this.resize();

    if (COVER) this.setupCover();
    hideLoading();
    this.platform.loadingStop();
    if (this.offline && !E2E) this.ui.showWelcome(this.offline);
    this.running = true;
    this.lastFrame = performance.now();
    this.loop(this.lastFrame);
    if (!COVER) this.platform.gameplayStart();
    this.installTestHooks();
  }

  // ---------- Rendering ----------
  private initRenderer(tier: QualityTier): void {
    const canvas = document.getElementById('scene') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: tier.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: COVER || E2E });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral tone mapping keeps the pack's colours (ACES pushes greens toward olive).
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.running = false; });
    canvas.addEventListener('webglcontextrestored', () => location.reload());
    this.rig = new CameraRig(canvas);
  }

  private applyQuality(q: QualityTier): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.world.setShadowQuality(q.shadow);
    this.resize();
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.rig.resize(w, h);
    this.world?.setPointScale(this.renderer.domElement.height * 1.1);
  }

  private loop = (ts: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const cap = COVER ? 60 : this.quality.tier.fpsCap;
    if (ts - this.lastRender < 1000 / cap - 2) return;
    const dt = Math.min(0.25, (ts - this.lastFrame) / 1000);
    this.lastFrame = ts;
    this.lastRender = ts;
    this.frame(dt);
  };

  private frame(dt: number): void {
    const now = Date.now();
    this.clock += dt;
    this.quality.sample(dt);
    if (!COVER) {
      const ev = G.tick(this.state, now, dt);
      for (const b of ev.finished) this.onFinished(b);
      for (const h of ev.heroes) this.onHero(h);
    }
    this.world.update(dt, this.clock, this.state, now);
    this.rig.update(dt);
    this.world.updateFog(this.rig.distance);
    if (this.world.consumeShadowDirty()) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.world.scene, this.rig.camera);
    this.frames++;
    this.ui.updateLabels();
    this.uiTimer -= dt;
    if (this.uiTimer <= 0) {
      this.uiTimer = 0.1;
      this.ui.update();
    }
    this.saveTimer += dt;
    if (this.saveTimer > 10) { this.saveTimer = 0; this.save(); }
  }

  private project(v: THREE.Vector3): ScreenPoint {
    const p = v.clone().project(this.rig.camera);
    const w = window.innerWidth, h = window.innerHeight;
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, visible: p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2 };
  }

  private makeThumbnails(): void {
    const size = 160;
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a5b, 2.0));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    sun.position.set(-3, 6, 4);
    scene.add(sun);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const buf = new Uint8Array(size * size * 4);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const types: BuildingType[] = ['castle', 'walls', ...BUILDABLE];
    const prevTone = this.renderer.toneMapping;
    for (const type of types) {
      const obj = type === 'walls' ? this.world.lib.clone('wall_corner_A_gate') : composeBuilding(this.world.lib, type, type === 'castle' ? 4 : 6).group;
      obj.rotation.y = type === 'walls' ? -Math.PI / 3 : 0;
      scene.add(obj);
      const box = new THREE.Box3().setFromObject(obj);
      const c = box.getCenter(new THREE.Vector3());
      const r = box.getSize(new THREE.Vector3()).length() * 0.5;
      const d = r / Math.sin(THREE.MathUtils.degToRad(15)) * 0.92;
      cam.position.set(c.x + d * 0.45, c.y + d * 0.55, c.z + d * 0.7);
      cam.lookAt(c);
      this.renderer.setRenderTarget(rt);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear();
      this.renderer.render(scene, cam);
      this.renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
      ctx.putImageData(img, 0, 0);
      this.thumbs.set(type, canvas.toDataURL('image/png'));
      scene.remove(obj);
    }
    this.renderer.toneMapping = prevTone;
    this.renderer.setRenderTarget(null);
    rt.dispose();
  }

  // ---------- Input ----------
  private onTap(x: number, y: number): void {
    if (this.ui.modalOpen) return;
    this.audio.unlock();
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.rig.camera);
    const hits = this.raycaster.intersectObjects(this.world.pickTargets(), true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        if (o.userData.buildingId !== undefined) return this.openBuilding(o.userData.buildingId as number);
        if (o.userData.plot !== undefined) return this.openPlot(o.userData.plot as number);
        if (o.userData.walls) return this.openBuilding(G.walls(this.state).id);
        o = o.parent;
      }
    }
    const ground = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ground)) return;
    const hx = worldToHex(ground.x, ground.z);
    const cell = buildMap().cells.get(key(hx));
    if (!cell) { this.ui.closeSheet(); return; }
    if (!this.state.regions.includes(cell.region)) {
      const nr = G.nextRegion(this.state);
      if (nr !== null) { this.ui.openSheet({ kind: 'region', region: nr }); this.focusRegion(nr); }
      return;
    }
    if (cell.kind === 'castle') return this.openBuilding(G.castle(this.state).id);
    if (hexDist(cell) === 2 && buildMap().walls.some((w) => w.q === cell.q && w.r === cell.r)) return this.openBuilding(G.walls(this.state).id);
    if (cell.plot !== undefined) return this.openPlot(cell.plot);
    this.ui.closeSheet();
  }

  private openBuilding(id: number): void {
    const b = this.state.buildings.find((x) => x.id === id);
    if (!b) return;
    // Tapping a building with resources ready collects them first: quick and satisfying.
    if (b.level > 0 && b.upgradeEnd === 0 && Math.floor(b.pending[mainRes(b)]) >= 1) {
      const got = G.collect(this.state, id);
      const anchor = this.world.labelAnchor(id);
      if (anchor) this.ui.flyResources(got, this.project(anchor));
      return;
    }
    this.audio.tap();
    this.ui.openSheet({ kind: 'building', id });
  }

  private openPlot(plot: number): void {
    const b = G.buildingOnPlot(this.state, plot);
    if (b) return this.openBuilding(b.id);
    this.audio.tap();
    this.ui.openSheet({ kind: 'plot', plot });
  }

  private focusPlot(plot: number): void {
    const p = this.world.plotPosition(plot);
    this.rig.focus(p.x, p.z + 1, Math.min(this.rig.zoomWidth, 16));
    const b = G.buildingOnPlot(this.state, plot);
    if (b) this.ui.openSheet({ kind: 'building', id: b.id });
  }

  private focusRegion(r: number): void {
    const c = buildMap().regions[r].center;
    this.rig.focus(c.x * 0.8, c.z * 0.8 + 1, Math.max(this.rig.zoomWidth, 20));
  }

  // ---------- Game events ----------
  private onFinished(b: G.Building): void {
    this.audio.complete();
    if (b.type === 'castle') {
      this.ui.toast(`${t('b.castle')} · ${t('ui.level', { n: b.level })}`, 'castle');
      this.platform.happytime();
    }
    this.save();
  }

  private onHero(id: HeroId): void {
    this.audio.hero();
    this.ui.toast(t('ui.heroUnlocked', { name: t(`h.${id}` as Key) }), 'heroes');
    void heroDef(id);
    this.platform.happytime();
  }

  private async maybeMidgame(): Promise<void> {
    const now = Date.now();
    if (!this.pacer.canShowMidgame(now) || !this.platform.available) return;
    this.pacer.markShown(now);
    await this.platform.midgame();
  }

  private save(): void {
    if (COVER || !this.state) return;
    this.state.lastSeen = Date.now();
    saveTo(this.store, this.state);
    const ds = this.platform.dataStore;
    if (ds) saveTo(ds, this.state);
  }

  private onVisibility = (): void => {
    if (document.hidden) {
      this.save();
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.audio.setHidden(true);
      this.platform.gameplayStop();
    } else {
      const now = Date.now();
      const rep = G.offlineEarnings(this.state, now);
      if (rep) {
        G.tick(this.state, now, 0);
        this.offline = rep;
        this.ui.showWelcome(rep);
      } else {
        G.tick(this.state, now, Math.max(0, (now - this.state.lastSeen) / 1000));
      }
      this.audio.setHidden(false);
      this.running = true;
      this.lastFrame = performance.now();
      this.loop(this.lastFrame);
      this.platform.gameplayStart();
    }
  };

  // ---------- Actions for the UI ----------
  private actions() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const app = this;
    return {
      state: () => app.state,
      now: () => Date.now(),
      project(kind: 'building' | 'plot' | 'region', id: number): ScreenPoint | null {
        let v: THREE.Vector3 | null;
        if (kind === 'building') v = app.world.labelAnchor(id);
        else if (kind === 'plot') v = app.world.plotPosition(id).setY(0.35);
        else v = app.world.regionAnchor(id);
        return v ? app.project(v) : null;
      },
      build(type: BuildingType, plot: number) {
        const r = G.build(app.state, type, plot, Date.now());
        if (r.ok) { app.audio.build(); app.save(); }
        return r;
      },
      upgrade(id: number) {
        const r = G.startUpgrade(app.state, id, Date.now());
        if (r.ok) { app.audio.build(); app.save(); }
        return r;
      },
      collect(id: number): Bundle { return G.collect(app.state, id); },
      unlockRegion(r: number) {
        const res = G.unlockRegion(app.state, r);
        if (res.ok) {
          app.world.setUnlocked(app.state.regions, true);
          app.audio.unlockLand();
          app.ui.toast(t('ui.landUnlocked'), 'sparkle');
          app.focusRegion(r);
          app.platform.happytime();
          app.save();
          setTimeout(() => void app.maybeMidgame(), 2600);
        }
        return res;
      },
      claimQuest() {
        const got = G.claimQuest(app.state, Date.now());
        if (got) {
          app.save();
          if (app.state.quest.index % 3 === 0) setTimeout(() => void app.maybeMidgame(), 1500);
        }
        return got;
      },
      levelHero(id: HeroId) {
        const r = G.levelHero(app.state, id);
        if (r.ok) { app.audio.hero(); app.save(); }
        return r;
      },
      async watchBoost() {
        const ok = await app.platform.rewarded();
        app.pacer.markShown(Date.now());
        if (ok) { G.activateBoost(app.state, Date.now()); app.state.stats.adsWatched++; app.audio.complete(); app.save(); }
      },
      async watchFinish(id: number) {
        const ok = await app.platform.rewarded();
        app.pacer.markShown(Date.now());
        if (ok) { G.finishUpgradeNow(app.state, id, Date.now()); app.state.stats.adsWatched++; }
      },
      async takeOffline(double: boolean) {
        const rep = app.offline;
        if (!rep) { app.ui.hideModal(); return; }
        let factor = 1;
        if (double) {
          const ok = await app.platform.rewarded();
          app.pacer.markShown(Date.now());
          if (ok) { factor = 2; app.state.stats.adsWatched++; }
        }
        app.offline = null;
        G.applyOffline(app.state, rep, factor);
        const gained: Bundle = {};
        for (const r of RESOURCES) if (rep.earnings[r]) gained[r] = rep.earnings[r] * factor;
        app.ui.hideModal();
        app.ui.flyResources(gained, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
        app.save();
        if (!double) setTimeout(() => void app.maybeMidgame(), 1200);
      },
      newEra() {
        const n = G.startNewEra(app.state, Date.now());
        if (!n) return;
        app.state = n;
        app.world.setUnlocked(n.regions, false);
        app.world.sync(n, Date.now());
        app.platform.happytime();
        app.audio.unlockLand();
        app.rig.focus(0, 0.9, 13);
        app.save();
        setTimeout(() => void app.maybeMidgame(), 2000);
      },
      setSetting(k: 'sfx' | 'music' | 'lang' | 'quality', v: string | boolean) {
        const st = app.state.settings;
        if (k === 'sfx') { st.sfx = !!v; app.audio.setSfx(st.sfx); }
        if (k === 'music') { st.music = !!v; app.audio.setMusic(st.music); }
        if (k === 'lang') { st.lang = v as 'en' | 'fr' | 'auto'; setLang(st.lang === 'auto' ? detectLang() : st.lang); app.ui.translate(); }
        if (k === 'quality') {
          st.quality = v as 'auto' | 'high' | 'low';
          app.quality.auto = st.quality === 'auto';
          app.quality.set(st.quality === 'high' ? 2 : st.quality === 'low' ? 0 : AdaptiveQuality.initialIndex());
        }
        app.save();
      },
      reset() {
        app.state = G.newGame(Date.now(), { settings: { ...app.state.settings } });
        app.world.setUnlocked(app.state.regions, false);
        app.world.sync(app.state, Date.now());
        app.rig.focus(0, 0.9, 13);
        app.save();
      },
      focusPlot: (plot: number) => app.focusPlot(plot),
      focusRegion: (r: number) => app.focusRegion(r),
      questGo: () => app.questGo(),
      thumbnail: (type: BuildingType) => app.thumbs.get(type) ?? '',
      sound(name: 'tap' | 'collect' | 'error') { app.audio[name](); },
      sheetChanged(open: boolean) {
        if (open && app.ui?.currentSheet?.kind === 'heroes') app.ui.markHeroesSeen();
      },
    };
  }

  private questGo(): void {
    const s = this.state;
    const g = G.currentQuest(s).goal;
    const emptyPlot = (): number | null => {
      const used = new Set(s.buildings.map((b) => b.plot));
      const plots = buildMap().plots.filter((p) => s.regions.includes(p.region) && !used.has(p.id));
      return plots.length ? plots[0].id : null;
    };
    const best = (type: BuildingType): G.Building | undefined => s.buildings.filter((b) => b.type === type).sort((a, b) => b.level - a.level)[0];
    const openPlotFor = (): void => {
      const p = emptyPlot();
      if (p !== null) { this.focusPlot(p); this.ui.openSheet({ kind: 'plot', plot: p }); }
      else { const nr = G.nextRegion(s); if (nr !== null) { this.focusRegion(nr); this.ui.openSheet({ kind: 'region', region: nr }); } }
    };
    switch (g.kind) {
      case 'build': return openPlotFor();
      case 'level': {
        const b = best(g.building);
        if (b && b.level > 0) { this.focusPlot(b.plot); this.ui.openSheet({ kind: 'building', id: b.id }); }
        else openPlotFor();
        return;
      }
      case 'collect': {
        const b = s.buildings.filter((x) => x.level > 0).sort((a, c) => c.pending[g.res] - a.pending[g.res])[0];
        if (b) this.focusPlot(b.plot);
        this.ui.closeSheet();
        return;
      }
      case 'regions': {
        const nr = G.nextRegion(s);
        if (nr !== null) { this.focusRegion(nr); this.ui.openSheet({ kind: 'region', region: nr }); }
        return;
      }
      case 'population': {
        const b = best('house');
        if (b) { this.focusPlot(b.plot); this.ui.openSheet({ kind: 'building', id: b.id }); } else openPlotFor();
        return;
      }
      case 'heroes': this.ui.openSheet({ kind: 'heroes' }); return;
    }
  }

  // ---------- Cover rendering ----------
  private setupCover(): void {
    this.ui.setHidden(true);
    const w = window.innerWidth, h = window.innerHeight;
    const aspect = w / h;
    this.rig.pitchOverride = aspect > 1.2 ? 36 : 42;
    if (aspect > 1.2) this.rig.focus(0.5, 3.5, 19, true);
    else if (aspect < 0.8) this.rig.focus(0, 0.2, 19, true);
    else this.rig.focus(0.3, 0.8, 22, true);
    this.rig.update(0);
    if (params.get('title') !== '0') {
      const el = document.getElementById('cover-title')!;
      el.classList.remove('hidden');
    }
  }

  // ---------- Test hooks (used by Playwright and cover rendering) ----------
  private installTestHooks(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const app = this;
    (window as unknown as { __IK: unknown }).__IK = {
      ready: true,
      get frames() { return app.frames; },
      state: () => JSON.parse(JSON.stringify(app.state)),
      drawCalls: () => app.renderer.info.render.calls,
      triangles: () => app.renderer.info.render.triangles,
      plotScreen(plot: number) {
        const p = app.world.plotPosition(plot).setY(0.05);
        return app.project(p);
      },
      focusPlot: (plot: number) => { const p = app.world.plotPosition(plot); app.rig.focus(p.x, p.z, 14, true); },
      samplePixels() {
        const gl = app.renderer.getContext();
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const px = new Uint8Array(4);
        const colors = new Set<string>();
        for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) {
          gl.readPixels(Math.floor((w * i) / 6), Math.floor((h * j) / 6), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          colors.add(`${px[0] >> 4},${px[1] >> 4},${px[2] >> 4}`);
        }
        return colors.size;
      },
      tier: () => app.quality.tier.name,
      format: formatNumber,
      hexToWorld,
    };
  }
}

// ---------- Loading screen ----------
function setLoadingProgress(p: number): void {
  const bar = document.querySelector<HTMLElement>('#loading .bar i');
  if (bar) bar.style.width = `${Math.round(10 + p * 85)}%`;
}
function setLoadingText(s: string): void {
  const el = document.querySelector('#loading p');
  if (el) el.textContent = s;
}
function hideLoading(): void {
  const el = document.getElementById('loading');
  if (!el) return;
  el.classList.add('done');
  setTimeout(() => el.remove(), 700);
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

if (!hasWebGL()) {
  setLoadingText('WebGL is not available on this device.');
} else {
  new App().start().catch((e) => {
    console.error(e);
    setLoadingText('Something went wrong while loading. Please refresh.');
  });
}
