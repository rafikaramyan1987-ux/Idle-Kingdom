import { BUILDABLE, BUILDINGS, RESOURCES, regionCastleReq, regionCost, upgradeCost, maxLevel, canAfford, type Bundle, type BuildingType, type Res } from '../game/economy';
import { formatDuration, formatNumber } from '../game/format';
import { HEROES, HERO_MAX_LEVEL, heroLevelCost, type HeroDef, type HeroId } from '../game/heroes';
import { buildMap } from '../game/map';
import { questAt, type QuestGoal } from '../game/quests';
import {
  buildingOnPlot, buildingRate, builders, activeUpgrades, canBuild, canLevelHero, canStartEra, canUnlockRegion, canUpgrade, castle, countOf,
  currentQuest, goalProgress, heroLevel, nextRegion, population, questDone, questReward, starsOnNewEra, storageCap, totalRates, upgradeDuration,
  type ActionResult, type Building, type GameState, type OfflineReport,
} from '../game/state';
import { ERA_CASTLE_LEVEL, REGION_COUNT, STAR_BONUS } from '../game/economy';
import { getLang, t, type Key } from '../i18n';
import { icon, type IconName } from './icons';

export interface ScreenPoint { x: number; y: number; visible: boolean }

export interface UIActions {
  state(): GameState;
  now(): number;
  project(kind: 'building' | 'plot' | 'region', id: number): ScreenPoint | null;
  build(type: BuildingType, plot: number): ActionResult;
  upgrade(id: number): ActionResult;
  collect(id: number): Bundle;
  unlockRegion(r: number): ActionResult;
  claimQuest(): Bundle | null;
  levelHero(id: HeroId): ActionResult;
  watchBoost(): Promise<void>;
  watchFinish(id: number): Promise<void>;
  takeOffline(double: boolean): Promise<void>;
  newEra(): void;
  setSetting(k: 'sfx' | 'music' | 'lang' | 'quality', v: string | boolean): void;
  reset(): void;
  focusPlot(plot: number): void;
  focusRegion(r: number): void;
  questGo(): void;
  thumbnail(type: BuildingType): string;
  sound(name: 'tap' | 'collect' | 'error'): void;
  sheetChanged(open: boolean): void;
}

const resIcon = (r: Res): IconName => r;
const bName = (b: BuildingType): string => t(`b.${b}` as Key);

function costChips(cost: Bundle, have: Record<Res, number>): string {
  return RESOURCES.filter((r) => cost[r])
    .map((r) => `<span class="chip ${have[r] + 1e-9 >= cost[r]! ? '' : 'missing'}">${icon(resIcon(r))}${formatNumber(cost[r]!)}</span>`)
    .join('');
}

function bundleChips(b: Bundle, plus = true): string {
  return RESOURCES.filter((r) => b[r]).map((r) => `<span class="chip good">${icon(resIcon(r))}${plus ? '+' : ''}${formatNumber(b[r]!)}</span>`).join('');
}

function rateChips(b: Bundle): string {
  return RESOURCES.filter((r) => b[r]).map((r) => `<span class="chip">${icon(resIcon(r))}${formatNumber(b[r]! * 60)}/m</span>`).join('');
}

export function questText(g: QuestGoal): string {
  switch (g.kind) {
    case 'build': return g.count > 1 ? t('q.buildN', { n: g.count, b: bName(g.building) }) : t('q.build', { b: bName(g.building) });
    case 'level': return t('q.level', { b: bName(g.building), n: g.level });
    case 'collect': return t('q.collect', { n: formatNumber(g.amount), r: t(`res.${g.res}` as Key).toLowerCase() });
    case 'regions': return t('q.regions', { n: g.count });
    case 'population': return t('q.population', { n: g.count });
    case 'heroes': return t('q.heroes', { n: g.count });
  }
}

function questIcon(g: QuestGoal): IconName {
  if (g.kind === 'collect') return g.res;
  if (g.kind === 'population') return 'pop';
  if (g.kind === 'heroes') return 'heroes';
  if (g.kind === 'regions') return 'sparkle';
  return 'hammer';
}

function milestoneText(h: HeroDef): string {
  const m = h.unlock;
  switch (m.kind) {
    case 'level': return t('m.level', { b: bName(m.building), n: m.level });
    case 'built': return t('m.built', { b: bName(m.building) });
    case 'regions': return t('m.regions', { n: m.count });
    case 'era': return t('m.era');
  }
}

function heroBonusText(h: HeroDef, lv: number): string {
  const parts: string[] = [];
  const L = Math.max(1, lv);
  if (h.special === 'autoCollect') parts.push(t('ui.autoCollect'));
  if (h.special === 'builder') parts.push(t('ui.builder'));
  if (h.special === 'stars') parts.push(t('ui.starsBonus'));
  if (h.bonus) {
    const p = Math.round(h.bonus.perLevel * L * 100);
    parts.push(h.bonus.res === 'all' ? t('ui.bonusAll', { p }) : t('ui.bonus', { p, res: t(`res.${h.bonus.res}` as Key).toLowerCase() }));
  }
  return parts.join(' · ');
}

type SheetKind =
  | { kind: 'plot'; plot: number }
  | { kind: 'building'; id: number }
  | { kind: 'region'; region: number }
  | { kind: 'kingdom' } | { kind: 'heroes' } | { kind: 'quests' } | { kind: 'options' } | { kind: 'credits' };

interface Label { el: HTMLElement; sig: string; kind: 'building' | 'plot' | 'region'; id: number }

export class UI {
  readonly root: HTMLElement;
  private resEls = new Map<Res, HTMLElement>();
  private resVals = new Map<Res, string>();
  private popEl!: HTMLElement;
  private boostEl!: HTMLElement;
  private starsEl!: HTMLElement;
  private questEl!: HTMLElement;
  private questSig = '';
  private labelsEl!: HTMLElement;
  private labels = new Map<string, Label>();
  private sheetEl!: HTMLElement;
  private sheetBody!: HTMLElement;
  private sheetSig = '';
  private sheet: SheetKind | null = null;
  private modalEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private navEl!: HTMLElement;
  private resetArmed = 0;
  hidden = false;

  constructor(private a: UIActions) {
    this.root = document.getElementById('ui')!;
    this.root.innerHTML = `
      <div class="labels" id="labels"></div>
      <header class="topbar">
        <div class="resbar">${RESOURCES.map((r) => `<div class="res" data-res="${r}">${icon(r)}<b>0</b></div>`).join('')}</div>
        <div class="subbar">
          <div class="pill pop">${icon('pop')}<b>0</b></div>
          <div class="pill stars hidden">${icon('star')}<b>0</b></div>
          <button class="pill boost" data-action="boost">${icon('boost')}<b></b></button>
        </div>
      </header>
      <div class="toasts" id="toasts"></div>
      <footer class="bottom">
        <div class="quest" id="quest"></div>
        <nav class="nav" id="nav">
          ${(['kingdom', 'heroes', 'quests', 'options'] as const).map((n) => `<button data-nav="${n}" class="${n === 'kingdom' ? 'active' : ''}">${icon(n === 'kingdom' ? 'castle' : n)}<span data-i18n="nav.${n}"></span><i class="dot hidden"></i></button>`).join('')}
        </nav>
      </footer>
      <div class="sheet-backdrop" id="sheet-backdrop"></div>
      <section class="sheet" id="sheet" aria-modal="true" role="dialog"><div class="grab"></div><button class="sheet-close" data-action="close" aria-label="close">${icon('close')}</button><div class="sheet-body" id="sheet-body"></div></section>
      <div class="modal hidden" id="modal"></div>`;
    for (const r of RESOURCES) this.resEls.set(r, this.root.querySelector(`[data-res="${r}"] b`)!);
    this.popEl = this.root.querySelector('.pill.pop b')!;
    this.starsEl = this.root.querySelector('.pill.stars')!;
    this.boostEl = this.root.querySelector('.pill.boost')!;
    this.questEl = this.root.querySelector('#quest')!;
    this.labelsEl = this.root.querySelector('#labels')!;
    this.sheetEl = this.root.querySelector('#sheet')!;
    this.sheetBody = this.root.querySelector('#sheet-body')!;
    this.modalEl = this.root.querySelector('#modal')!;
    this.toastEl = this.root.querySelector('#toasts')!;
    this.navEl = this.root.querySelector('#nav')!;
    this.root.addEventListener('click', this.onClick);
    this.root.querySelector('#sheet-backdrop')!.addEventListener('click', () => this.closeSheet());
    this.installSheetSwipe();
    this.translate();
  }

  translate(): void {
    this.root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n as Key); });
    this.questSig = '';
    this.sheetSig = '';
    for (const l of this.labels.values()) l.sig = '';
  }

  // ---------- Events ----------
  private onClick = (e: MouseEvent): void => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action],[data-nav],[data-label]');
    if (!el) return;
    const s = this.a.state();
    if (el.dataset.nav) {
      this.a.sound('tap');
      const n = el.dataset.nav as 'kingdom' | 'heroes' | 'quests' | 'options';
      if (this.sheet?.kind === n) this.closeSheet();
      else this.openSheet({ kind: n } as SheetKind);
      return;
    }
    if (el.dataset.label) {
      const [kind, id] = el.dataset.label.split(':');
      if (kind === 'building') {
        const got = this.a.collect(Number(id));
        if (Object.keys(got).length) this.flyResources(got, el);
      } else if (kind === 'plot') this.openSheet({ kind: 'plot', plot: Number(id) });
      else if (kind === 'region') this.openSheet({ kind: 'region', region: Number(id) });
      else if (kind === 'upgrading') this.openSheet({ kind: 'building', id: Number(id) });
      return;
    }
    const action = el.dataset.action!;
    const arg = el.dataset.arg ?? '';
    const fail = (r: ActionResult): void => {
      if (!r.ok) {
        this.a.sound('error');
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
      }
    };
    switch (action) {
      case 'close': this.closeSheet(); break;
      case 'build': {
        const [type, plot] = arg.split(':');
        const r = this.a.build(type as BuildingType, Number(plot));
        fail(r);
        if (r.ok) this.closeSheet();
        break;
      }
      case 'upgrade': fail(this.a.upgrade(Number(arg))); break;
      case 'collectB': {
        const got = this.a.collect(Number(arg));
        if (Object.keys(got).length) this.flyResources(got, el);
        break;
      }
      case 'finish': void this.a.watchFinish(Number(arg)); break;
      case 'unlock': {
        const r = this.a.unlockRegion(Number(arg));
        fail(r);
        if (r.ok) this.closeSheet();
        break;
      }
      case 'claim': {
        const got = this.a.claimQuest();
        if (got) this.flyResources(got, el);
        break;
      }
      case 'questGo': this.a.questGo(); break;
      case 'hero': fail(this.a.levelHero(arg as HeroId)); break;
      case 'boost': void this.a.watchBoost(); break;
      case 'era': this.a.newEra(); this.closeSheet(); break;
      case 'focus': this.closeSheet(); this.a.focusPlot(Number(arg)); break;
      case 'setting': {
        const [k, v] = arg.split('=');
        this.a.setSetting(k as 'sfx', v === 'true' ? true : v === 'false' ? false : v);
        this.sheetSig = '';
        break;
      }
      case 'credits': this.openSheet({ kind: 'credits' }); break;
      case 'reset':
        if (Date.now() - this.resetArmed < 4000) { this.a.reset(); this.closeSheet(); }
        else { this.resetArmed = Date.now(); el.textContent = t('ui.resetConfirm'); }
        break;
      case 'offline1': void this.a.takeOffline(false); break;
      case 'offline2': void this.a.takeOffline(true); break;
    }
    if (action !== 'close') this.a.sound('tap');
    void s;
  };

  private installSheetSwipe(): void {
    let y0 = -1;
    const grab = this.sheetEl.querySelector('.grab') as HTMLElement;
    grab.addEventListener('pointerdown', (e) => { y0 = e.clientY; grab.setPointerCapture(e.pointerId); });
    grab.addEventListener('pointermove', (e) => {
      if (y0 < 0) return;
      const dy = Math.max(0, e.clientY - y0);
      this.sheetEl.style.transform = `translateY(${dy}px)`;
    });
    const end = (e: PointerEvent): void => {
      if (y0 < 0) return;
      const dy = e.clientY - y0;
      y0 = -1;
      this.sheetEl.style.transform = '';
      if (dy > 70) this.closeSheet();
    };
    grab.addEventListener('pointerup', end);
    grab.addEventListener('pointercancel', end);
  }

  // ---------- Sheets ----------
  openSheet(s: SheetKind): void {
    this.sheet = s;
    this.sheetSig = '';
    this.root.classList.add('sheet-open');
    this.navEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.nav === s.kind || (b.dataset.nav === 'kingdom' && !['heroes', 'quests', 'options'].includes(s.kind))));
    this.renderSheet();
    this.a.sheetChanged(true);
  }

  closeSheet(): void {
    if (!this.sheet) return;
    this.sheet = null;
    this.root.classList.remove('sheet-open');
    this.navEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.nav === 'kingdom'));
    this.a.sheetChanged(false);
  }

  get sheetOpen(): boolean { return this.sheet !== null; }

  private setSheet(html: string): void {
    if (html === this.sheetSig) return;
    this.sheetSig = html;
    const scroll = this.sheetBody.scrollTop;
    this.sheetBody.innerHTML = html;
    this.sheetBody.scrollTop = scroll;
  }

  private renderSheet(): void {
    const sh = this.sheet;
    if (!sh) return;
    const s = this.a.state();
    switch (sh.kind) {
      case 'plot': return this.setSheet(this.plotSheet(s, sh.plot));
      case 'building': return this.setSheet(this.buildingSheet(s, sh.id));
      case 'region': return this.setSheet(this.regionSheet(s, sh.region));
      case 'kingdom': return this.setSheet(this.kingdomSheet(s));
      case 'heroes': return this.setSheet(this.heroesSheet(s));
      case 'quests': return this.setSheet(this.questsSheet(s));
      case 'options': return this.setSheet(this.optionsSheet(s));
      case 'credits': return this.setSheet(this.creditsSheet());
    }
  }

  private plotSheet(s: GameState, plot: number): string {
    const existing = buildingOnPlot(s, plot);
    if (existing) { this.sheet = { kind: 'building', id: existing.id }; return this.buildingSheet(s, existing.id); }
    const cards = BUILDABLE.map((type) => {
      const def = BUILDINGS[type];
      const cost = upgradeCost(type, 0);
      const check = canBuild(s, type);
      const locked = !check.ok && check.reason === 'locked';
      const limit = !check.ok && check.reason === 'limit';
      const disabled = !check.ok;
      const note = locked ? t('ui.needCastle', { n: def.unlockCastle }) : limit ? t('ui.limit') : !check.ok && check.reason === 'builders' ? t('ui.builders') : '';
      const prod = rateChips(Object.fromEntries(Object.entries(def.produces).map(([k, v]) => [k, v])) as Bundle);
      return `<button class="card build-card ${disabled ? 'disabled' : ''} ${locked ? 'locked' : ''}" data-action="build" data-arg="${type}:${plot}" data-build="${type}">
        <img class="thumb" src="${this.a.thumbnail(type)}" alt="" />
        <div class="card-main"><div class="card-title">${bName(type)}</div>
        <div class="chips small">${prod || (def.population ? `<span class="chip">${icon('pop')}+${def.population}</span>` : `<span class="chip">${icon('sparkle')}+${Math.round((def.globalBonus ?? 0) * 100)}%</span>`)}</div>
        <div class="chips">${locked ? `<span class="chip">${icon('lock')}${note}</span>` : costChips(cost, s.res)}</div>
        ${note && !locked ? `<div class="note">${note}</div>` : ''}</div></button>`;
    }).join('');
    return `<h2>${t('ui.chooseBuilding')}</h2><div class="cards">${cards}</div>`;
  }

  private buildingSheet(s: GameState, id: number): string {
    const b = s.buildings.find((x) => x.id === id);
    if (!b) return '';
    const now = this.a.now();
    const lv = b.level;
    const cap = b.type === 'castle' ? 99 : maxLevel(b.type, castle(s).level);
    const check = canUpgrade(s, b);
    const cost = upgradeCost(b.type, lv);
    const cur = buildingRate(s, b, now, false);
    const nextB: Building = { ...b, level: lv + 1 };
    const next = buildingRate(s, nextB, now, false);
    const def = BUILDINGS[b.type];
    let effect = rateChips(cur);
    let nextEffect = rateChips(next);
    if (def.population) {
      effect += `<span class="chip">${icon('pop')}${def.population * lv}</span>`;
      nextEffect += `<span class="chip">${icon('pop')}${def.population * (lv + 1)}</span>`;
    }
    if (def.globalBonus) {
      effect += `<span class="chip">${icon('sparkle')}+${Math.round(def.globalBonus * lv * 100)}%</span>`;
      nextEffect += `<span class="chip">${icon('sparkle')}+${Math.round(def.globalBonus * (lv + 1) * 100)}%</span>`;
    }
    const pendingTotal = RESOURCES.reduce((a, r) => a + Math.floor(b.pending[r]), 0);
    let action: string;
    if (b.upgradeEnd > 0) {
      action = `<div class="progress-row"><div class="bar"><i data-live="bar:${b.id}"></i></div><span class="timer" data-live="timer:${b.id}"></span></div>
        <button class="btn ad" data-action="finish" data-arg="${b.id}">${icon('play')}${t('ui.finishNow')}</button>`;
    } else if (!check.ok && check.reason === 'maxLevel') {
      action = `<div class="note center">${t('ui.max')} · ${t('ui.needCastle', { n: castle(s).level + 1 })}</div>`;
    } else if (!check.ok && check.reason === 'locked') {
      action = `<div class="note center">${icon('lock')} ${t('ui.needCastle', { n: def.unlockCastle })}</div>`;
    } else {
      const label = lv === 0 ? t('ui.build') : t('ui.upgrade');
      action = `<div class="chips center">${costChips(cost, s.res)}<span class="chip">${icon('clock')}${formatDuration(upgradeDuration(s, b))}</span></div>
        <button class="btn go ${check.ok ? '' : 'disabled'}" data-action="upgrade" data-arg="${b.id}">${icon('up')}${label}</button>
        ${!check.ok && check.reason === 'builders' ? `<div class="note center">${t('ui.builders')} (${activeUpgrades(s)}/${builders(s)})</div>` : ''}`;
    }
    const collectBtn = pendingTotal > 0 && b.upgradeEnd === 0 ? `<button class="btn soft" data-action="collectB" data-arg="${b.id}">${icon(mainRes(b))}${t('ui.collect')}</button>` : '';
    return `<div class="sheet-head"><img class="thumb big" src="${this.a.thumbnail(b.type)}" alt=""/><div><h2>${bName(b.type)}</h2>
      <div class="lv">${t('ui.level', { n: lv })}<small> / ${cap}</small></div><p class="desc">${t(`bd.${b.type}` as Key)}</p></div></div>
      <div class="compare"><div><small>${t('ui.production')}</small><div class="chips">${effect || '—'}</div></div><div class="arrow">${icon('up')}</div><div><small>${t('ui.next')}</small><div class="chips">${nextEffect}</div></div></div>
      ${action}${collectBtn}`;
  }

  private regionSheet(s: GameState, region: number): string {
    const check = canUnlockRegion(s, region);
    const req = regionCastleReq(region);
    const lockedCastle = castle(s).level < req;
    return `<div class="sheet-head center-col"><div class="big-icon">${icon('sparkle')}</div><h2>${t('ui.unlockLand')}</h2><p class="desc">${t('ui.landDesc')}</p></div>
      <div class="chips center">${lockedCastle ? `<span class="chip missing">${icon('lock')}${t('ui.needCastle', { n: req })}</span>` : ''}${costChips(regionCost(region), s.res)}</div>
      <button class="btn go ${check.ok ? '' : 'disabled'}" data-action="unlock" data-arg="${region}">${icon('sparkle')}${t('ui.unlock')}</button>`;
  }

  private kingdomSheet(s: GameState): string {
    const now = this.a.now();
    const rates = totalRates(s, now);
    const c = castle(s);
    const eraStars = starsOnNewEra(s);
    const list = s.buildings
      .filter((b) => b.type !== 'castle' && b.type !== 'walls' && b.level > 0)
      .sort((x, y) => x.type.localeCompare(y.type) || y.level - x.level)
      .map((b) => `<button class="mini" data-action="focus" data-arg="${b.plot}"><img src="${this.a.thumbnail(b.type)}" alt=""/><span>${t('ui.level', { n: b.level })}</span></button>`)
      .join('');
    const w = s.buildings.find((b) => b.type === 'walls')!;
    return `<h2>${t('ui.kingdomTitle')}</h2>
      <div class="row-cards">
        <button class="card" data-action="focus" data-arg="-2"><img class="thumb" src="${this.a.thumbnail('castle')}" alt=""/><div class="card-main"><div class="card-title">${bName('castle')}</div><div class="lv">${t('ui.level', { n: c.level })}</div></div></button>
        <button class="card" data-action="focus" data-arg="-1"><img class="thumb" src="${this.a.thumbnail('walls')}" alt=""/><div class="card-main"><div class="card-title">${bName('walls')}</div><div class="lv">${t('ui.level', { n: w.level })}</div></div></button>
      </div>
      <h3>${t('ui.totalRate')}</h3><div class="chips">${rateChips(rates)}<span class="chip">${icon('pop')}${population(s)}</span></div>
      <h3>${t('ui.lands', { a: s.regions.length, b: REGION_COUNT })} · ${t('ui.buildings')}</h3><div class="minis">${list || '—'}</div>
      <div class="era-card"><div class="era-title">${icon('star')}${t('ui.era', { n: s.era + 1 })}</div>
        ${s.stars ? `<div class="note">${t('ui.stars', { n: s.stars, p: Math.round(s.stars * STAR_BONUS * 100) })}</div>` : ''}
        ${canStartEra(s) ? `<p class="desc">${t('ui.newEraDesc', { n: Math.max(1, eraStars) })}</p><button class="btn gold" data-action="era">${icon('star')}${t('ui.newEra')}</button>` : `<p class="desc">${t('ui.newEraReq', { n: ERA_CASTLE_LEVEL })}</p>`}
      </div>`;
  }

  private heroesSheet(s: GameState): string {
    const cards = HEROES.map((h) => {
      const lv = heroLevel(s, h.id);
      const locked = lv === 0;
      const isNew = s.newHeroes.includes(h.id);
      const check = canLevelHero(s, h.id);
      const btn = locked ? `<div class="note">${icon('lock')}${milestoneText(h)}</div>`
        : lv >= HERO_MAX_LEVEL ? `<div class="note">${t('ui.max')}</div>`
          : `<button class="btn small ${check.ok ? 'go' : 'disabled'}" data-action="hero" data-arg="${h.id}">${icon('up')}${t('ui.heroLevelUp')}<span class="chips inline">${costChips(heroLevelCost(lv), s.res)}</span></button>`;
      return `<div class="hero ${locked ? 'locked' : ''}" style="--hc:${h.color}">
        <div class="portrait"><span>${h.emoji}</span>${isNew ? `<i class="new">${t('ui.heroNew')}</i>` : ''}</div>
        <div class="hero-main"><div class="card-title">${t(`h.${h.id}` as Key)} ${locked ? '' : `<small>${t('ui.level', { n: lv })}</small>`}</div>
        <div class="hero-sub">${t(`ht.${h.id}` as Key)}</div><div class="hero-bonus">${heroBonusText(h, lv)}</div>${btn}</div></div>`;
    }).join('');
    return `<h2>${t('ui.heroesTitle')}</h2><div class="heroes">${cards}</div>`;
  }

  private questsSheet(s: GameState): string {
    const q = currentQuest(s);
    const p = goalProgress(s, q.goal);
    const done = questDone(s);
    const upcoming = [1, 2, 3].map((i) => questAt(s.quest.index + i)).map((x) => `<li>${icon(questIcon(x.goal))}${questText(x.goal)}</li>`).join('');
    return `<h2>${t('nav.quests')}</h2>
      <div class="quest-big"><div class="q-icon">${icon(questIcon(q.goal))}</div><div class="q-main"><div class="q-title">${questText(q.goal)}</div>
      <div class="bar"><i style="width:${Math.min(100, (p.value / p.target) * 100)}%"></i></div><div class="q-prog">${formatNumber(Math.min(p.value, p.target))} / ${formatNumber(p.target)}</div></div></div>
      <div class="chips center"><small>${t('ui.reward')}</small>${bundleChips(questReward(s, this.a.now()))}</div>
      ${done ? `<button class="btn gold" data-action="claim">${icon('check')}${t('ui.claim')}</button>` : `<button class="btn soft" data-action="questGo">${t('ui.go')}</button>`}
      <ul class="upcoming">${upcoming}</ul><div class="note center">${t('ui.questsDone', { n: s.quest.index })}</div>`;
  }

  private optionsSheet(s: GameState): string {
    const st = s.settings;
    const seg = (k: string, opts: [string, string][], cur: string): string => `<div class="seg">${opts.map(([v, label]) => `<button class="${cur === v ? 'on' : ''}" data-action="setting" data-arg="${k}=${v}">${label}</button>`).join('')}</div>`;
    return `<h2>${t('ui.optionsTitle')}</h2>
      <div class="opt">${icon('sound')}<span>${t('ui.sound')}</span>${seg('sfx', [['true', t('ui.on')], ['false', t('ui.off')]], String(st.sfx))}</div>
      <div class="opt">${icon('music')}<span>${t('ui.music')}</span>${seg('music', [['true', t('ui.on')], ['false', t('ui.off')]], String(st.music))}</div>
      <div class="opt">${icon('globe')}<span>${t('ui.language')}</span>${seg('lang', [['auto', t('ui.auto')], ['en', 'EN'], ['fr', 'FR']], s.settings.lang)}</div>
      <div class="opt">${icon('sparkle')}<span>${t('ui.graphics')}</span>${seg('quality', [['auto', t('ui.auto')], ['high', t('ui.high')], ['low', t('ui.low')]], st.quality)}</div>
      <div class="opt-links"><button class="btn soft small" data-action="credits">${t('ui.credits')}</button><button class="btn danger small" data-action="reset">${t('ui.reset')}</button></div>`;
  }

  private creditsSheet(): string {
    return `<h2>${t('ui.credits')}</h2><div class="credits">
      <p><b>3D models</b>: KayKit Medieval Hexagon Pack by Kay Lousberg (kaylousberg.com) — CC0 1.0.</p>
      <p><b>Font</b>: Fredoka by Milena Brandão & Hafontia — SIL Open Font License 1.1.</p>
      <p><b>Engine</b>: three.js (MIT). Sounds and music are synthesized in the browser.</p></div>`;
  }

  // ---------- Modal ----------
  showWelcome(rep: OfflineReport): void {
    this.modalEl.innerHTML = `<div class="modal-card pop-in"><div class="sun">${icon('castle')}</div><h2>${t('ui.welcomeBack')}</h2>
      <p class="desc">${t('ui.awayFor', { t: formatDuration(rep.seconds) })}</p><div class="chips center big">${bundleChips(rep.earnings)}</div>
      <div class="btn-row"><button class="btn soft" data-action="offline1">${t('ui.take')}</button><button class="btn ad" data-action="offline2">${icon('play')}${t('ui.double')}</button></div>
      <div class="note center">${t('ui.cap')}</div></div>`;
    this.modalEl.classList.remove('hidden');
  }

  hideModal(): void {
    this.modalEl.classList.add('hidden');
    this.modalEl.innerHTML = '';
  }

  get modalOpen(): boolean { return !this.modalEl.classList.contains('hidden'); }

  // ---------- Toasts & effects ----------
  toast(text: string, ic: IconName = 'sparkle'): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `${icon(ic)}<span></span>`;
    el.querySelector('span')!.textContent = text;
    this.toastEl.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3200);
  }

  flyResources(b: Bundle, from: HTMLElement | { x: number; y: number }): void {
    const r0 = from instanceof HTMLElement ? from.getBoundingClientRect() : { left: from.x, top: from.y, width: 0, height: 0 };
    const sx = r0.left + r0.width / 2, sy = r0.top + r0.height / 2;
    let delay = 0;
    for (const r of RESOURCES) {
      if (!b[r]) continue;
      const target = this.resEls.get(r)!.parentElement!.getBoundingClientRect();
      const n = Math.min(5, 1 + Math.floor(Math.log10(b[r]! + 1)));
      for (let i = 0; i < n; i++) {
        const el = document.createElement('div');
        el.className = 'fly';
        el.innerHTML = icon(r);
        el.style.left = `${sx}px`;
        el.style.top = `${sy}px`;
        document.body.appendChild(el);
        const dx = target.left + 14 - sx, dy = target.top + target.height / 2 - sy;
        const jx = (Math.random() - 0.5) * 60, jy = -30 - Math.random() * 40;
        el.animate(
          [{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: `translate(calc(-50% + ${jx}px), calc(-50% + ${jy}px)) scale(1.1)`, opacity: 1, offset: 0.3 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.7)`, opacity: 1 }],
          { duration: 700 + i * 60, delay: delay + i * 50, easing: 'cubic-bezier(.5,0,.4,1)', fill: 'both' },
        ).onfinish = () => {
          el.remove();
          const pill = this.resEls.get(r)!.parentElement!;
          pill.classList.remove('bump');
          void pill.offsetWidth;
          pill.classList.add('bump');
        };
      }
      delay += 80;
    }
    // Floating "+N" text
    const main = RESOURCES.find((r) => b[r]);
    if (main) {
      const tx = document.createElement('div');
      tx.className = 'float-num';
      tx.textContent = `+${formatNumber(b[main]!)}`;
      tx.style.left = `${sx}px`;
      tx.style.top = `${sy}px`;
      document.body.appendChild(tx);
      setTimeout(() => tx.remove(), 1000);
    }
    this.a.sound('collect');
  }

  // ---------- Per-frame update ----------
  update(): void {
    const s = this.a.state();
    const now = this.a.now();
    for (const r of RESOURCES) {
      const v = formatNumber(s.res[r]);
      if (this.resVals.get(r) !== v) { this.resVals.set(r, v); this.resEls.get(r)!.textContent = v; }
    }
    const pop = String(population(s));
    if (this.popEl.textContent !== pop) this.popEl.textContent = pop;
    this.starsEl.classList.toggle('hidden', s.stars <= 0);
    const starTxt = String(s.stars);
    if (this.starsEl.querySelector('b')!.textContent !== starTxt) this.starsEl.querySelector('b')!.textContent = starTxt;
    const boostLeft = (s.boostEnd - now) / 1000;
    const boostTxt = boostLeft > 0 ? `x2 ${formatDuration(boostLeft)}` : t('ui.boost');
    const bEl = this.boostEl.querySelector('b')!;
    if (bEl.textContent !== boostTxt) bEl.textContent = boostTxt;
    this.boostEl.classList.toggle('active', boostLeft > 0);
    // Nav badges
    const heroDot = this.navEl.querySelector('[data-nav="heroes"] .dot')!;
    heroDot.classList.toggle('hidden', s.newHeroes.length === 0);
    const questDot = this.navEl.querySelector('[data-nav="quests"] .dot')!;
    questDot.classList.toggle('hidden', !questDone(s));
    this.updateQuest(s);
    if (this.sheet) {
      this.renderSheet();
      this.updateLive(s, now);
    }
  }

  private updateQuest(s: GameState): void {
    const q = currentQuest(s);
    const p = goalProgress(s, q.goal);
    const done = p.value >= p.target;
    const sig = `${s.quest.index}:${Math.min(p.value, p.target)}:${done}:${getLang()}`;
    if (sig === this.questSig) return;
    this.questSig = sig;
    this.questEl.classList.toggle('done', done);
    this.questEl.innerHTML = `<div class="q-icon">${icon(questIcon(q.goal))}</div><div class="q-main"><div class="q-title">${questText(q.goal)}</div>
      <div class="bar"><i style="width:${Math.min(100, (p.value / p.target) * 100)}%"></i></div></div>
      ${done ? `<button class="btn gold small" data-action="claim">${t('ui.claim')}</button>` : `<button class="btn soft small" data-action="questGo">${t('ui.go')}</button>`}`;
  }

  private updateLive(s: GameState, now: number): void {
    this.sheetBody.querySelectorAll<HTMLElement>('[data-live]').forEach((el) => {
      const [kind, id] = el.dataset.live!.split(':');
      const b = s.buildings.find((x) => x.id === Number(id));
      if (!b || b.upgradeEnd <= 0) return;
      const total = Math.max(1, b.upgradeEnd - b.upgradeStart);
      const k = Math.min(1, (now - b.upgradeStart) / total);
      if (kind === 'bar') el.style.width = `${k * 100}%`;
      else el.textContent = formatDuration((b.upgradeEnd - now) / 1000);
    });
  }

  /** Floating labels above buildings, empty plots and the next locked land. */
  updateLabels(): void {
    if (this.hidden) return;
    const s = this.a.state();
    const now = this.a.now();
    const wanted = new Map<string, { kind: Label['kind']; id: number; html: string; cls: string; action: string }>();
    for (const b of s.buildings) {
      if (b.upgradeEnd > 0) {
        const left = Math.max(0, (b.upgradeEnd - now) / 1000);
        wanted.set(`b${b.id}`, { kind: 'building', id: b.id, html: `${icon('hammer')}<b>${formatDuration(left)}</b>`, cls: 'lbl timer', action: `upgrading:${b.id}` });
        continue;
      }
      if (b.level <= 0) continue;
      const r = mainRes(b);
      const v = Math.floor(b.pending[r]);
      if (v >= 1) {
        const full = b.pending[r] >= storageCap(s, b, r, now) - 0.5;
        wanted.set(`b${b.id}`, { kind: 'building', id: b.id, html: `${icon(r)}<b>+${formatNumber(v)}</b>`, cls: `lbl collect ${full ? 'full' : ''}`, action: `building:${b.id}` });
      }
    }
    const map = buildMap();
    const used = new Set(s.buildings.map((b) => b.plot));
    const anyAffordable = BUILDABLE.some((tp) => canBuild(s, tp).ok);
    // Only a few "+" markers at a time (closest to the castle) to keep the view calm.
    const free = map.plots.filter((p) => s.regions.includes(p.region) && !used.has(p.id));
    for (const p of free.slice(0, 3)) {
      wanted.set(`p${p.id}`, { kind: 'plot', id: p.id, html: icon('plus'), cls: `lbl plot ${anyAffordable ? 'ready' : ''}`, action: `plot:${p.id}` });
    }
    const nr = nextRegion(s);
    if (nr !== null) {
      const ok = canUnlockRegion(s, nr).ok;
      const cost = regionCost(nr);
      const main = (Object.keys(cost) as Res[])[0];
      wanted.set(`r${nr}`, { kind: 'region', id: nr, html: `${icon(ok ? 'sparkle' : 'lock')}<b>${t('ui.unlockLand')}</b><small>${icon(main)}${formatNumber(cost[main]!)}</small>`, cls: `lbl region ${ok ? 'ready' : ''}`, action: `region:${nr}` });
    }
    for (const [k, l] of this.labels) {
      if (!wanted.has(k)) { l.el.remove(); this.labels.delete(k); }
    }
    for (const [k, w] of wanted) {
      let l = this.labels.get(k);
      if (!l) {
        const el = document.createElement('button');
        el.dataset.label = w.action;
        this.labelsEl.appendChild(el);
        l = { el, sig: '', kind: w.kind, id: w.id };
        this.labels.set(k, l);
        el.classList.add('appear');
      }
      const sig = w.html + w.cls;
      if (l.sig !== sig) {
        l.sig = sig;
        l.el.innerHTML = w.html;
        l.el.className = w.cls + (l.el.classList.contains('appear') ? ' appear' : '');
        l.el.dataset.label = w.action;
        if (w.kind === 'plot') l.el.dataset.plot = String(w.id);
      }
      const pt = this.a.project(w.kind, w.id);
      if (!pt || !pt.visible) { l.el.style.visibility = 'hidden'; continue; }
      l.el.style.visibility = '';
      // Keep labels fully on screen (half label width ≈ 70px for the widest ones).
      const half = w.kind === 'region' ? 80 : 34;
      const x = Math.min(window.innerWidth - half, Math.max(half, pt.x));
      const tr = `translate3d(${x.toFixed(1)}px, ${pt.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      if (l.el.style.transform !== tr) l.el.style.transform = tr;
    }
  }

  setHidden(h: boolean): void {
    this.hidden = h;
    this.root.classList.toggle('ui-hidden', h);
  }

  get questGoal(): QuestGoal { return currentQuest(this.a.state()).goal; }

  markHeroesSeen(): void {
    this.a.state().newHeroes = [];
  }

  get currentSheet(): SheetKind | null { return this.sheet; }
  countOf(type: BuildingType): number { return countOf(this.a.state(), type); }
  canAfford(b: Bundle): boolean { return canAfford(this.a.state().res, b); }
}

export function mainRes(b: Building): Res {
  const p = BUILDINGS[b.type].produces;
  let best: Res = 'gold';
  let v = -1;
  for (const r of RESOURCES) if ((p[r] ?? 0) > v) { v = p[r] ?? 0; best = r; }
  return best;
}
