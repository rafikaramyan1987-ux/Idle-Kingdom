import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import './style.css';
import * as THREE from 'three';
import { AdPacer } from './game/ads';
import { Battle } from './game/battle';
import { BUILDINGS, DECOR, ENEMIES, SKINS, heroDef, type BType, type DecorId, type HeroId, type ItemId, type ResearchId, type SkinId } from './game/defs';
import { buildMap, hexToWorld, key, worldToHex } from './game/map';
import { loadFrom, saveTo, safeLocalStorage, type KeyValueStore } from './game/save';
import * as G from './game/state';
import type { GameState, OfflineReport, Result } from './game/state';
import { detectLang, setLang, t, tk } from './i18n';
import { Platform } from './platform/sdk';
import { Audio } from './audio/audio';
import { ModelLibrary } from './render/assets';
import { CameraRig } from './render/camera';
import { World } from './render/world';
import { composeBuilding } from './render/buildingVisuals';
import { CharacterLibrary } from './render/characters';
import { BattleView } from './render/battleView';
import { AdaptiveQuality, TIERS, type QualityTier } from './render/quality';
import { UI, icon, type ScreenPoint } from './ui/ui';
import { coverState } from './cover';

declare const __CRAZYGAMES__: boolean;

const params = new URLSearchParams(location.search);
const COVER = params.has('cover');
const E2E = params.has('e2e');
const OK: Result = { ok: true };
const NO: Result = { ok: false, reason: 'invalid' };

interface ActiveBattle { battle: Battle; view: BattleView; kind: 'camp' | 'raid'; region: number; speed: number; endT: number }

class App {
  state!: GameState;
  private store: KeyValueStore | null = safeLocalStorage();
  private platform = new Platform();
  private audio = new Audio();
  private renderer!: THREE.WebGLRenderer;
  private rig!: CameraRig;
  private world!: World;
  private chars = new CharacterLibrary();
  private ui!: UI;
  private quality!: AdaptiveQuality;
  private pacer = new AdPacer(Date.now());
  private thumbs = new Map<string, string>();
  private lastFrame = 0;
  private lastRender = 0;
  private uiTimer = 0;
  private saveTimer = 0;
  private running = false;
  private raf = 0;
  private clock = 0;
  private raycaster = new THREE.Raycaster();
  private reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  private active: ActiveBattle | null = null;
  private pendingRaid = false;
  private modalQueue: (() => void)[] = [];
  private timeShift = 0;
  frames = 0;

  now(): number { return Date.now() + this.timeShift; }

  async start(): Promise<void> {
    const wantSdk = __CRAZYGAMES__ || params.has('cg');
    await this.platform.init(wantSdk);
    this.platform.loadingStart();
    const now = this.now();
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
    const lib = await ModelLibrary.load(`${import.meta.env.BASE_URL}assets/kingdom.glb`, (p) => setLoadingProgress(p * 0.7));
    const tier = TIERS[startTier];
    this.world = new World(lib, { villagers: tier.name === 'low' ? 5 : 10, smoke: tier.name === 'low' ? 40 : 80 });
    this.world.reducedMotion = this.reducedMotion;
    this.quality = new AdaptiveQuality(startTier, (q) => this.applyQuality(q));
    this.quality.auto = this.state.settings.quality === 'auto' && !COVER && !E2E;
    this.applyQuality(TIERS[startTier]);
    this.makeThumbnails();

    const offline = COVER || E2E ? null : G.offlineReport(this.state, now);
    G.tick(this.state, now, 0);
    G.drainEvents();
    this.world.setUnlocked(this.state.regions, false);
    this.world.sync(this.state, now);

    this.ui = new UI(this.actions());
    this.audio.setSfx(this.state.settings.sfx);
    this.audio.setMusic(this.state.settings.music);
    this.platform.onAdState = (running) => this.audio.setAdMuted(running);
    this.platform.onMuteChange = (m) => this.audio.setAdMuted(m);

    this.rig.onTap = (x, y) => this.onTap(x, y);
    this.rig.focus(0, 1.2, window.innerWidth > window.innerHeight ? 17 : 12.5, true);
    window.addEventListener('pointerdown', () => this.audio.unlock(), { capture: true });
    window.addEventListener('keydown', () => this.audio.unlock(), { capture: true });
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', () => this.save());
    window.addEventListener('resize', () => this.resize());
    this.resize();

    // Characters stream in after the island is visible.
    const charsReady = this.chars.load(`${import.meta.env.BASE_URL}assets/chars/`, (m) => this.charMaterial(m)).then(() => {
      this.world.chars = this.chars;
      this.makeCharacterThumbnails();
    }).catch((e) => console.warn('characters failed to load', e));

    if (COVER) await charsReady;
    hideLoading();
    this.platform.loadingStop();
    if (offline) this.ui.showWelcome(offline, (double) => void this.takeOffline(offline, double));
    if (COVER) this.setupCover();
    this.running = true;
    this.lastFrame = performance.now();
    this.loop(this.lastFrame);
    if (!COVER) this.platform.gameplayStart();
    this.installTestHooks();
  }

  private charMats = new Map<THREE.Texture | null, THREE.Material>();
  private charMaterial(m: THREE.MeshStandardMaterial): THREE.Material {
    const key = m.map ?? null;
    let mat = this.charMats.get(key);
    if (!mat) {
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      mat = new THREE.MeshLambertMaterial({ map: m.map ?? null, color: m.map ? 0xffffff : m.color });
      this.charMats.set(key, mat);
    }
    return mat;
  }

  // ---------- Rendering ----------
  private initRenderer(tier: QualityTier): void {
    const canvas = document.getElementById('scene') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: tier.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: COVER || E2E });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
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
    const now = this.now();
    this.clock += dt;
    this.quality.sample(dt);
    if (!COVER) {
      G.tick(this.state, now, this.active ? 0 : dt);
      for (const e of G.drainEvents()) this.onEvent(e);
    }
    if (this.active) this.updateBattle(dt);
    this.world.update(dt, this.clock, this.state, now);
    this.rig.update(dt);
    this.world.updateFog(this.rig.distance);
    if (this.world.consumeShadowDirty()) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.world.scene, this.rig.camera);
    this.frames++;
    if (!this.active) this.ui.updateBubbles();
    this.uiTimer -= dt;
    if (this.uiTimer <= 0) {
      this.uiTimer = 0.12;
      this.ui.update();
      const raidIn = this.state.raidAt - this.state.play;
      if (!this.active && raidIn > 0 && raidIn <= 15) this.ui.banner(`💀 ${t('ui.raidIn', { t: `${Math.ceil(raidIn)}s` })}`, 'raid');
      else if (!this.active) this.ui.banner(null);
    }
    this.saveTimer += dt;
    if (this.saveTimer > 10) { this.saveTimer = 0; this.save(); }
  }

  private project(v: THREE.Vector3): ScreenPoint {
    const p = v.clone().project(this.rig.camera);
    const w = window.innerWidth, h = window.innerHeight;
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, visible: p.z < 1 && Math.abs(p.x) < 1.15 && Math.abs(p.y) < 1.15 };
  }

  // ---------- Thumbnails ----------
  private snap(obj: THREE.Object3D, size = 160, yaw = 0): string {
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a5b, 2.0));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    sun.position.set(-3, 6, 4);
    scene.add(sun);
    obj.rotation.y = yaw;
    scene.add(obj);
    obj.updateMatrixWorld(true);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() * 0.5;
    const d = (r / Math.sin(THREE.MathUtils.degToRad(15))) * 0.9;
    cam.position.set(c.x + d * 0.4, c.y + d * 0.45, c.z + d * 0.8);
    cam.lookAt(c);
    this.renderer.setRenderTarget(rt);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(scene, cam);
    const buf = new Uint8Array(size * size * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
    this.renderer.setRenderTarget(null);
    rt.dispose();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  }

  private makeThumbnails(): void {
    const lib = this.world.lib;
    for (const type of Object.keys(BUILDINGS) as BType[]) {
      if (type === 'walls' || type === 'field') continue;
      this.thumbs.set(type, this.snap(composeBuilding(lib, type, type === 'castle' ? 3 : 2).group));
    }
    const field = composeBuilding(lib, 'field', 1).group;
    const g = lib.clone('building_grain'); g.scale.setScalar(0.78); field.add(g);
    this.thumbs.set('field', this.snap(field));
    this.thumbs.set('ruins', this.snap(lib.clone('building_destroyed')));
    for (const d of Object.keys(DECOR) as DecorId[]) { const o = lib.clone(DECOR[d].model); if (d === 'flags') o.scale.setScalar(3); this.thumbs.set(`decor:${d}`, this.snap(o)); }
    for (const k of Object.keys(SKINS) as SkinId[]) this.thumbs.set(`skin:${k}`, this.snap(lib.clone(SKINS[k])));
  }

  private makeCharacterThumbnails(): void {
    for (const h of ['knight', 'ranger', 'mage', 'rogue', 'barbarian'] as HeroId[]) {
      const ch = this.chars.spawn(heroDef(h).model);
      if (ch) { ch.update(0.4); this.thumbs.set(`hero:${h}`, this.snap(ch.root, 128, 0.35)); }
    }
    for (const e of Object.keys(ENEMIES) as (keyof typeof ENEMIES)[]) {
      const ch = this.chars.spawn(ENEMIES[e].model);
      if (ch) { ch.update(0.4); this.thumbs.set(`enemy:${e}`, this.snap(ch.root, 96, -0.35)); }
    }
  }

  // ---------- Input ----------
  private onTap(x: number, y: number): void {
    if (this.ui.modalOpen || this.active) return;
    this.audio.unlock();
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.rig.camera);
    const hits = this.raycaster.intersectObjects(this.world.pickTargets(), true);
    for (const h of hits) {
      for (let o: THREE.Object3D | null = h.object; o; o = o.parent) {
        const u = o.userData;
        if (u.buildingId !== undefined) return this.tapBuilding(u.buildingId as number);
        if (u.plot !== undefined) return this.ui.open({ kind: 'plot', plot: u.plot as number });
        if (u.camp !== undefined && u.camp !== null) return this.ui.openCamp(u.camp as number);
        if (u.chest !== undefined) { void this.run('chest', u.chest as number); return; }
        if (u.ruins !== undefined) return this.ui.open({ kind: 'ruins', region: u.ruins as number });
        if (u.cart) return this.ui.open({ kind: 'orders' });
        if (u.visitor) return this.ui.showVisitor();
        if (u.hero) return this.ui.open({ kind: 'heroes' });
        if (u.walls) return this.ui.open({ kind: 'castle' });
      }
    }
    const ground = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ground)) return;
    const cell = buildMap().cells.get(key(worldToHex(ground.x, ground.z)));
    if (!cell) { this.ui.closeSheet(); return; }
    if (cell.kind === 'castle' || cell.kind === 'courtyard') return this.ui.open({ kind: 'castle' });
    if (!this.state.regions.includes(cell.region)) {
      const nr = G.nextRegion(this.state);
      if (nr !== null) { this.ui.openCamp(nr); this.focusRegion(nr); }
      return;
    }
    if (cell.plot !== undefined) return this.ui.open({ kind: 'plot', plot: cell.plot });
    this.ui.closeSheet();
  }

  private tapBuilding(id: number): void {
    const b = this.state.buildings.find((x) => x.id === id);
    if (!b) return;
    // Tapping a building with finished goods collects them right away (like the bubble).
    if (b.ready.length && b.buildEnd === 0) {
      void this.run('collect', id).then((r) => {
        if (r.ok) { const a = this.world.labelAnchor(id); if (a) this.ui.fly(this.project(a), '📦'); }
      });
      return;
    }
    this.audio.tap();
    this.ui.open({ kind: 'building', id });
  }

  private focusCell(q: number, r: number, width = 11): void {
    const w = hexToWorld({ q, r });
    this.rig.focus(w.x, w.z + 1.2, Math.min(Math.max(this.rig.zoomWidth, width), 16));
  }

  private focusRegion(r: number): void {
    const c = buildMap().camps[r];
    if (c) this.focusCell(c.q, c.r, 13);
  }

  // ---------- Events ----------
  private onEvent(e: G.GameEvent): void {
    switch (e.type) {
      case 'levelUp':
        this.audio.hero();
        this.queueModal(() => this.ui.showLevelUp(e.level, () => { this.nextModal(); void this.maybeMidgame(); }));
        this.platform.happytime();
        break;
      case 'built': this.audio.complete(); break;
      case 'ready': break;
      case 'raidWarn': this.audio.error(); break;
      case 'raid': if (this.active) this.pendingRaid = true; else this.startRaid(); break;
      case 'chest': this.ui.toast(t('ui.chestDrop'), '🎁'); break;
      case 'visitor': this.ui.toast(t('ui.visitor'), '❗'); this.audio.hero(); break;
      case 'heroJoin': this.ui.toast(t('ui.heroJoined', { name: tk(`h.${e.hero}`) }), '⚔️'); this.audio.hero(); this.platform.happytime(); break;
      case 'cartArrive': this.ui.toast(t('ui.cartArrived'), '🛒'); break;
      case 'cartLeave': this.ui.toast(t('ui.cartLeft'), '🛒'); break;
      case 'region': break;
      case 'barnFull': this.ui.toast(t('ui.barnFull'), '📦'); this.audio.error(); break;
      case 'goal': this.audio.complete(); this.ui.toast(`${t('ui.goal')} ✓ ${tk(`g.${G.GOALS[e.index].id}`)}`, '🎯'); break;
      case 'market': if (G.buildingOf(this.state, 'market')) this.ui.toast(t('ui.marketNew'), '🏪'); break;
      case 'task': this.ui.toast(t('ui.taskDone'), '📋'); break;
      case 'campSpotted': this.ui.toast(t('ui.campSpotted'), '💀'); this.audio.error(); { const nr = G.nextRegion(this.state); if (nr !== null) this.focusRegion(nr); } break;
      case 'gift': this.ui.toast(t('ui.giftT'), '🎀'); this.ui.fly({ x: window.innerWidth / 2, y: window.innerHeight * 0.45 }, '🪙', 'gold', 3); break;
      case 'order': break;
    }
  }

  private queueModal(show: () => void): void {
    this.modalQueue.push(show);
    if (!this.ui.modalOpen && !this.active) this.nextModal();
  }

  private nextModal(): void {
    if (this.ui.modalOpen || this.active) return;
    const m = this.modalQueue.shift();
    m?.();
  }

  // ---------- Battles ----------
  private startCamp(region: number, picks: HeroId[]): Result {
    if (this.active) return NO;
    const now = this.now();
    const can = G.canAttack(this.state, region, now);
    if (!can.ok) return can;
    const setup = G.campSetup(this.state, region, now, picks.length ? picks : undefined);
    if (!setup.heroes.length) return { ok: false, reason: 'busy' };
    const c = buildMap().camps[region]!;
    const campPos = this.world.cellPosition(c.q, c.r);
    const dir = campPos.clone().normalize();
    const origin = campPos.clone().addScaledVector(dir, -1.6);
    this.beginBattle(new Battle(setup), origin, dir, 'camp', region);
    return OK;
  }

  startRaidNow(): void { if (!this.active) this.startRaid(); }

  private startRaid(): void {
    const now = this.now();
    this.ui.hideModal();
    const gate = buildMap().walls.find((w) => w.gate)!;
    const g = this.world.cellPosition(gate.q, gate.r);
    const dir = g.clone().normalize();
    const origin = g.clone().addScaledVector(dir, 1.6);
    this.beginBattle(new Battle(G.raidSetup(this.state, now)), origin, dir, 'raid', 0);
  }

  private beginBattle(battle: Battle, origin: THREE.Vector3, dir: THREE.Vector3, kind: 'camp' | 'raid', region: number): void {
    this.world.setBattle(true, kind === 'camp' ? region : null);
    const view = new BattleView(battle, this.chars, origin, dir, this.world.smoke, {
      damage: (pos, dmg, crit, team) => {
        const p = this.project(pos);
        if (p.visible) this.ui.floatText(p.x + (Math.random() - 0.5) * 20, p.y, `${crit ? '💥' : ''}${dmg}`, `dmg ${team ? 'foe' : 'ally'} ${crit ? 'crit' : ''}`);
        if (crit) this.audio.tap();
      },
      shake: (k) => { if (!this.reducedMotion) this.rig.shake(k); },
      skill: () => this.audio.unlockLand(),
    }, kind === 'raid' ? this.world.towers : []);
    this.world.scene.add(view.group);
    this.active = { battle, view, kind, region, speed: 1, endT: 0 };
    this.rig.pitchOverride = 40;
    this.rig.minWidth = 5;
    this.rig.focus(origin.x, origin.z + 0.3, 5.8);
    this.rig.enabled = false;
    const heroes = battle.units.filter((u) => u.hero).map((u) => ({ unit: u.id, hero: u.hero! }));
    this.ui.battleStart(kind === 'raid' ? `💀 ${t('ui.raid')}` : `⚔️ ${t('ui.battle')}`, heroes);
    this.ui.banner(null);
    this.platform.gameplayStart();
  }

  private updateBattle(dt: number): void {
    const a = this.active!;
    let left = dt * a.speed;
    while (left > 0 && !a.battle.over) { const st = Math.min(0.05, left); a.battle.step(st); left -= st; }
    a.view.update(dt * a.speed);
    const bars = a.view.bars().map((b) => { const p = this.project(b.pos); return { id: b.id, x: p.x, y: p.y, frac: b.frac, team: b.team, hero: b.hero }; });
    const cds = a.battle.units.filter((u) => u.hero).map((u) => ({ unit: u.id, frac: u.cdMax ? u.cd / u.cdMax : 0, alive: u.alive }));
    this.ui.battleUpdate(bars, cds, a.speed);
    if (a.battle.over) {
      a.endT += dt;
      if (a.endT > 1.6) this.finishBattle();
    }
  }

  private finishBattle(): void {
    const a = this.active!;
    const now = this.now();
    this.active = null;
    a.view.dispose();
    this.ui.battleEnd();
    this.rig.enabled = true;
    this.rig.pitchOverride = null;
    this.rig.minWidth = 7;
    this.world.setBattle(false, null);
    const won = a.battle.winner === 0;
    if (a.kind === 'camp') {
      const r = G.finishCamp(this.state, a.region, a.battle, now);
      if (won && r) {
        this.audio.unlockLand();
        this.world.setUnlocked(this.state.regions, true);
        this.ui.showReward(t('ui.victory'), '🏆', `<span class="chip good">🪙+${r.gold}</span><span class="chip good">💎+${r.gems}</span><span class="chip good">⭐+${r.xp}</span>${Object.entries(r.items).map(([k, v]) => `<span class="chip good">${icon(k)}+${v}</span>`).join('')}`,
          t('ui.newLand'), () => { this.nextModal(); void this.maybeMidgame(); this.focusRegion(a.region); });
        this.platform.happytime();
      } else {
        this.audio.error();
        this.ui.showReward(t('ui.defeat'), '🩹', '', t('ui.defeatDesc'), () => this.nextModal());
      }
    } else {
      const r = G.finishRaid(this.state, a.battle, now);
      if (r.win) {
        this.audio.complete();
        this.ui.showReward(t('ui.victory'), '🛡️', `<span class="chip good">🪙+${r.gold}</span>${r.gems ? `<span class="chip good">💎+${r.gems}</span>` : ''}`, '', () => { this.nextModal(); void this.maybeMidgame(); });
      } else {
        this.ui.showReward(t('ui.defeat'), '💀', Object.entries(r.lost).map(([k, v]) => `<span class="chip missing">${icon(k)}-${v}</span>`).join(''), t('ui.raidLost'), () => this.nextModal());
      }
    }
    for (const e of G.drainEvents()) this.onEvent(e);
    this.rig.focus(0, 1.2, 12.5);
    this.save();
    if (this.pendingRaid) { this.pendingRaid = false; setTimeout(() => { if (!this.active) this.startRaid(); }, 2500); }
  }

  // ---------- Ads ----------
  private async rewarded(): Promise<boolean> {
    const ok = await this.platform.rewarded();
    this.pacer.markShown(Date.now());
    if (ok) this.state.stats.ads = G.stat(this.state, 'ads') + 1;
    return ok;
  }

  private async maybeMidgame(): Promise<void> {
    const now = Date.now();
    if (!this.pacer.canShowMidgame(now) || !this.platform.available || this.active) return;
    this.pacer.markShown(now);
    await this.platform.midgame();
  }

  private async takeOffline(rep: OfflineReport, double: boolean): Promise<void> {
    let factor = 1;
    if (double && (await this.rewarded())) factor = 2;
    G.applyOffline(this.state, rep, factor);
    this.ui.fly({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, '🪙', 'gold', 5);
    this.save();
    if (!double) setTimeout(() => void this.maybeMidgame(), 1200);
  }

  private save(): void {
    if (COVER || E2E || !this.state) return;
    this.state.lastSeen = this.now();
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
      const now = this.now();
      const rep = G.offlineReport(this.state, now);
      G.tick(this.state, now, 0);
      if (rep && rep.seconds > 120) this.ui.showWelcome(rep, (double) => void this.takeOffline(rep, double));
      this.audio.setHidden(false);
      this.running = true;
      this.lastFrame = performance.now();
      this.loop(this.lastFrame);
      this.platform.gameplayStart();
    }
  };

  // ---------- Actions (called by the UI) ----------
  async run(action: string, ...args: (string | number | boolean | string[])[]): Promise<Result> {
    const s = this.state;
    const now = this.now();
    const n = (i: number): number => Number(args[i]);
    const str = (i: number): string => String(args[i]);
    switch (action) {
      case 'start': {
        const r = G.start(s, n(0), str(1), now);
        if (r.ok) this.audio.build();
        return r;
      }
      case 'feed': return G.feedAll(s, n(0), now) > 0 ? OK : { ok: false, reason: 'items' };
      case 'collect': {
        const got = G.collect(s, n(0));
        if (!Object.keys(got).length) return { ok: false, reason: 'barn' };
        this.audio.collect();
        return OK;
      }
      case 'build': {
        const r = G.build(s, str(0) as BType, n(1), now);
        if (r.ok) { this.audio.build(); this.save(); }
        return r;
      }
      case 'finishAd': return (await this.rewarded()) && G.finishNow(s, n(0), now) ? OK : NO;
      case 'skipGems': {
        const b = s.buildings.find((x) => x.id === n(0));
        const head = b?.jobs[0];
        if (!b || !head) return NO;
        const c = G.skipCost(head.end - now);
        if (s.gems < c) return { ok: false, reason: 'gems' };
        s.gems -= c;
        G.finishNow(s, b.id, now);
        return OK;
      }
      case 'deliver': {
        const o = G.deliver(s, n(0), now);
        if (!o) return { ok: false, reason: 'items' };
        this.ui.fly({ x: window.innerWidth / 2, y: window.innerHeight * 0.6 }, '🪙', 'gold', 5);
        this.audio.complete();
        this.save();
        return OK;
      }
      case 'discard': G.discardOrder(s, n(0), now); return OK;
      case 'crate': {
        if (!G.fillCrate(s, n(0))) return { ok: false, reason: 'items' };
        this.ui.fly({ x: window.innerWidth / 2, y: window.innerHeight * 0.6 }, '🪙', 'gold', 3);
        return OK;
      }
      case 'chest': {
        const r = G.openChest(s, n(0));
        if (!r) return NO;
        this.audio.complete();
        if (r.gold) this.ui.fly({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, '🪙', 'gold', 4);
        if (r.gems) this.ui.fly({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, '💎', 'gems', 3);
        for (const k of Object.keys(r.items)) this.ui.fly({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, (icon(k).match(/>(.+)</) ?? ['', '🎁'])[1], 'barn', 2);
        return OK;
      }
      case 'restore': {
        const r = G.restoreRuins(s, n(0));
        if (r.ok) { this.audio.unlockLand(); this.ui.showReward(t('ui.ruins'), '🏰', `<span class="chip good">💎+8</span>`); }
        return r;
      }
      case 'fight': return this.startCamp(n(0), (args[1] as string[] | undefined ?? []) as HeroId[]);
      case 'cast': return this.active?.battle.requestSkill(n(0)) ? OK : NO;
      case 'battleSpeed': if (this.active) this.active.speed = this.active.speed === 1 ? 2 : 1; return OK;
      case 'recruit': {
        const r = G.recruitVisitor(s, now);
        if (r.ok) this.save();
        return r;
      }
      case 'train': return G.trainHero(s, str(0) as HeroId);
      case 'star': return G.starUp(s, str(0) as HeroId);
      case 'equip': return G.equip(s, str(0) as HeroId, str(1) as 'weapon' | 'shield');
      case 'feedHero': return G.feedHero(s, str(0) as HeroId, str(1) as 'pie' | 'stew', now);
      case 'buyOffer': return G.buyOffer(s, n(0));
      case 'sell': {
        const g = G.sell(s, str(0) as ItemId, n(1));
        if (!g) return NO;
        this.ui.fly({ x: window.innerWidth / 2, y: window.innerHeight * 0.6 }, '🪙', 'gold', 2);
        return OK;
      }
      case 'refreshAd': if (await this.rewarded()) { G.refreshMarket(s, now); return OK; } return NO;
      case 'refreshGems': if (s.gems < 3) return { ok: false, reason: 'gems' }; s.gems -= 3; G.refreshMarket(s, now); return OK;
      case 'slot': return G.buySlot(s, str(0) as BType);
      case 'boost': return G.buyBoost(s, now);
      case 'boostAd': if (await this.rewarded()) { G.activateBoost(s, now, 5); return OK; } return NO;
      case 'gemsAd': {
        const day = G.dayKey(now);
        if (s.stats[`gemAds:${day}`] >= 3) return { ok: false, reason: 'limit' };
        if (!(await this.rewarded())) return NO;
        s.stats[`gemAds:${day}`] = G.stat(s, `gemAds:${day}`) + 1;
        s.gems += 5;
        this.ui.fly({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, '💎', 'gems', 4);
        return OK;
      }
      case 'gear': return G.buyGear(s, str(0) as ItemId);
      case 'decor': return G.buyDecor(s, str(0) as DecorId);
      case 'skin': return G.buySkin(s, str(0) as SkinId);
      case 'research': return G.research(s, str(0) as ResearchId);
      case 'barnUp': return G.upgradeBarn(s);
      case 'castleUp': { const r = G.upgradeCastle(s); if (r.ok) { this.platform.happytime(); this.audio.unlockLand(); } return r; }
      case 'wallsUp': return G.upgradeWalls(s);
      case 'daily': {
        const r = G.claimDaily(s);
        if (r.ok) { this.ui.fly({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, '💎', 'gems', 5); this.audio.complete(); }
        return r;
      }
      case 'weekly': return G.claimWeekly(s) > 0 ? OK : NO;
      case 'goalGo': this.goalGo(); return OK;
      case 'setting': {
        const st = s.settings;
        const k = str(0), v = args[1];
        if (k === 'sfx') { st.sfx = v === true; this.audio.setSfx(st.sfx); }
        if (k === 'music') { st.music = v === true; this.audio.setMusic(st.music); }
        if (k === 'lang') { st.lang = String(v) as 'en' | 'fr' | 'auto'; setLang(st.lang === 'auto' ? detectLang() : st.lang); this.ui.translate(); }
        if (k === 'quality') {
          st.quality = String(v) as 'auto' | 'high' | 'low';
          this.quality.auto = st.quality === 'auto';
          this.quality.set(st.quality === 'high' ? 2 : st.quality === 'low' ? 0 : AdaptiveQuality.initialIndex());
        }
        this.save();
        return OK;
      }
      case 'reset': {
        this.state = G.newGame(now, { settings: { ...s.settings } });
        this.world.setUnlocked(this.state.regions, false);
        this.rig.focus(0, 1.2, 12.5);
        this.save();
        return OK;
      }
    }
    return NO;
  }

  private actions() {
    return {
      state: () => this.state,
      now: () => this.now(),
      project: (v: THREE.Vector3) => this.project(v),
      buildingAnchor: (id: number) => this.world.labelAnchor(id),
      cellAnchor: (q: number, r: number, h: number) => this.world.cellPosition(q, r).setY(h),
      visitorAnchor: () => this.world.visitorPos?.clone().setY(1.0) ?? null,
      run: (action: string, ...args: (string | number | boolean | string[])[]) => this.run(action, ...args),
      thumbnail: (k: string) => this.thumbs.get(k) ?? '',
      sound: (name: 'tap' | 'collect' | 'error') => this.audio[name](),
      sheetChanged: (_open: boolean) => { void _open; },
      focus: (q: number, r: number) => this.focusCell(q, r),
      plotOf: (type: BType) => this.state.buildings.find((b) => b.type === type)?.plot ?? null,
    };
  }

  private goalGo(): void {
    const s = this.state;
    const view = G.currentGoal(s);
    const goal = view.kind === 'goal' ? view.goal.id : view.kind;
    const openType = (type: BType): boolean => {
      const b = s.buildings.find((x) => x.type === type);
      if (!b) return false;
      const p = this.world.plotPosition(b.plot);
      this.rig.focus(p.x, p.z + 1.2, 11);
      this.ui.open({ kind: 'building', id: b.id });
      return true;
    };
    const emptyPlot = (): void => {
      const used = new Set(s.buildings.map((b) => b.plot));
      const p = buildMap().plots.find((x) => s.regions.includes(x.region) && !used.has(x.id));
      if (p) { this.focusCell(p.q, p.r); this.ui.open({ kind: 'plot', plot: p.id }); }
    };
    switch (goal) {
      case 'plant': case 'harvest': {
        const f = s.buildings.find((b) => b.type === 'field' && (goal === 'plant' ? !b.jobs.length : b.ready.length || b.jobs.length));
        if (f) { const p = this.world.plotPosition(f.plot); this.rig.focus(p.x, p.z + 1.2, 11); this.tapBuilding(f.id); }
        return;
      }
      case 'flour': case 'bread': openType('bakery'); return;
      case 'order': case 'levelup': this.ui.open({ kind: 'orders' }); return;
      case 'field': emptyPlot(); return;
      case 'egg': openType('coop'); return;
      case 'pie': if (!openType('kitchen')) emptyPlot(); return;
      case 'corn': { const f = s.buildings.find((b) => b.type === 'field' && !b.jobs.length && !b.ready.length) ?? s.buildings.find((b) => b.type === 'field'); if (f) { const p = this.world.plotPosition(f.plot); this.rig.focus(p.x, p.z + 1.2, 11); this.ui.open({ kind: 'building', id: f.id }); } return; }
      case 'coop': case 'mine': case 'forge': case 'barracks': case 'kitchen': if (!openType(goal as BType)) emptyPlot(); return;
      case 'sword': if (!openType('forge')) emptyPlot(); return;
      case 'soldier': if (!openType('barracks')) emptyPlot(); return;
      case 'camp': case 'camp2': { const nr = G.nextRegion(s); if (nr !== null) { this.focusRegion(nr); this.ui.openCamp(nr); } return; }
      case 'chest': { const c = s.chests[0]; if (c) this.focusCell(c.q, c.r); return; }
      case 'hero': if (s.visitor) this.ui.showVisitor(); else this.ui.open({ kind: 'heroes' }); return;
      case 'raid': this.ui.toast(t('ui.raidIn', { t: `${Math.max(0, Math.ceil(s.raidAt - s.play))}s` }), '💀'); return;
      default: this.ui.open({ kind: 'tasks' });
    }
  }

  // ---------- Cover rendering ----------
  private setupCover(): void {
    this.ui.setHidden(true);
    const w = window.innerWidth, h = window.innerHeight;
    const aspect = w / h;
    this.rig.pitchOverride = aspect > 1.2 ? 38 : 44;
    if (aspect > 1.2) this.rig.focus(-0.6, 2.4, 16, true);
    else if (aspect < 0.8) this.rig.focus(-0.6, 1.2, 15, true);
    else this.rig.focus(-0.4, 1.6, 17, true);
    this.rig.update(0);
    if (params.get('title') !== '0') document.getElementById('cover-title')!.classList.remove('hidden');
    // Freeze a camp battle mid-fight for some action on the cover.
    const nr = G.nextRegion(this.state);
    if (nr !== null && params.get('battle') === '1') {
      this.startCamp(nr, []);
      if (this.active) {
        this.ui.setHidden(true);
        for (let i = 0; i < 70; i++) this.active.battle.step(0.05);
        this.active.view.update(0.5);
        this.active.speed = 0.15;
        this.rig.enabled = true;
        if (aspect > 1.2) this.rig.focus(-0.6, 2.4, 16, true);
        else if (aspect < 0.8) this.rig.focus(-0.6, 1.2, 15, true);
        else this.rig.focus(-0.4, 1.6, 17, true);
      }
    }
  }

  // ---------- Test hooks (Playwright, covers) ----------
  private installTestHooks(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const app = this;
    (window as unknown as { __IK: unknown }).__IK = {
      ready: true,
      get frames() { return app.frames; },
      get charsReady() { return app.chars.ready; },
      state: () => JSON.parse(JSON.stringify(app.state)),
      drawCalls: () => app.renderer.info.render.calls,
      plotScreen(plot: number) { return app.project(app.world.plotPosition(plot).setY(0.05)); },
      focusPlot(plot: number) { const p = app.world.plotPosition(plot); app.rig.focus(p.x, p.z, 10, true); },
      /** Moves every running timer forward (tests only). */
      fastForward(sec: number) {
        for (const b of app.state.buildings) {
          if (b.buildEnd > 0) b.buildEnd -= sec * 1000;
          for (const j of b.jobs) { j.end -= sec * 1000; j.start -= sec * 1000; }
        }
      },
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
      startCamp: (r: number) => app.startCamp(r, []),
      /** Tests only: skip the tutorial gate and give some progress. */
      cheat(level: number) { app.state.level = Math.max(app.state.level, level); if (!app.state.goalsDone.includes('order')) app.state.goalsDone.push('order'); app.state.play = Math.max(app.state.play, G.CAMP1_AT); app.state.raidAt = app.state.play + 300; app.state.gold += 500; },
      raid: () => app.startRaidNow(),
      get battleActive() { return !!app.active; },
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
