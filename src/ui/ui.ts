import type * as THREE from 'three';
import {
  BUILDINGS, BUILD_MENU, DECOR, HEROES, ITEMS, ITEM_IDS, RECIPES, RESEARCH, SKINS, campEnemies, campLevel, heroDef, researchCost, xpForLevel,
  type BType, type Category, type DecorId, type HeroId, type ItemId, type Recipe, type ResearchId, type SkinId,
} from '../game/defs';
import { formatDuration, formatNumber } from '../game/format';
import { buildMap } from '../game/map';
import * as G from '../game/state';
import type { GameState, OfflineReport, Result } from '../game/state';
import { getLang, t, tk } from '../i18n';

export interface ScreenPoint { x: number; y: number; visible: boolean }

export interface UIActions {
  state(): GameState;
  now(): number;
  project(v: THREE.Vector3): ScreenPoint;
  buildingAnchor(id: number): THREE.Vector3 | null;
  cellAnchor(q: number, r: number, h: number): THREE.Vector3;
  visitorAnchor(): THREE.Vector3 | null;
  run(action: string, ...args: (string | number | boolean | string[])[]): Result | Promise<Result>;
  thumbnail(key: string): string;
  sound(name: 'tap' | 'collect' | 'error'): void;
  sheetChanged(open: boolean): void;
  focus(q: number, r: number): void;
  plotOf(type: BType): number | null;
}

export const icon = (item: string): string => `<span class="emo">${(ITEMS as Record<string, { icon: string }>)[item]?.icon ?? (item === 'soldier' ? '💂' : item === 'archer' ? '🏹' : '❔')}</span>`;
const GOLD = '<span class="emo">🪙</span>';
const GEM = '<span class="emo">💎</span>';
const XP = '<span class="emo">⭐</span>';
const bn = (b: BType): string => tk(`b.${b}`);
const iname = (i: string): string => tk(`i.${i}`);

function bagChips(bag: Partial<Record<string, number>>, s: GameState | null, cls = ''): string {
  return Object.entries(bag).filter(([, v]) => v).map(([k, v]) => {
    if (k === 'gold') return `<span class="chip ${s && s.gold < v! ? 'missing' : ''} ${cls}">${GOLD}${formatNumber(v!)}</span>`;
    const have = s ? G.count(s, k as ItemId) : Infinity;
    return `<span class="chip ${have < v! ? 'missing' : ''} ${cls}">${icon(k)}${s ? `${formatNumber(Math.min(have, v!))}/` : ''}${formatNumber(v!)}</span>`;
  }).join('');
}

const rewardChips = (gold: number, gems: number, xp: number, items: Partial<Record<string, number>> = {}): string =>
  `${gold ? `<span class="chip good">${GOLD}+${formatNumber(gold)}</span>` : ''}${gems ? `<span class="chip good">${GEM}+${gems}</span>` : ''}${xp ? `<span class="chip good">${XP}+${xp}</span>` : ''}${Object.entries(items).map(([k, v]) => `<span class="chip good">${icon(k)}+${v}</span>`).join('')}`;

type Sheet =
  | { kind: 'building'; id: number } | { kind: 'plot'; plot: number } | { kind: 'barn'; tab: Category } | { kind: 'orders' } | { kind: 'heroes' }
  | { kind: 'market'; tab: 'buy' | 'sell' } | { kind: 'shop'; tab: 'boosts' | 'slots' | 'gear' | 'decor' | 'skins' | 'research' } | { kind: 'castle' }
  | { kind: 'camp'; region: number; pick: HeroId[] } | { kind: 'ruins'; region: number } | { kind: 'tasks' } | { kind: 'event' } | { kind: 'options' } | { kind: 'credits' };

const NAV = [['barn', '📦'], ['orders', '📜'], ['heroes', '⚔️'], ['market', '🏪'], ['shop', '💎']] as const;

export class UI {
  readonly root: HTMLElement;
  private sheet: Sheet | null = null;
  private sheetSig = '';
  private sheetEl!: HTMLElement;
  private body!: HTMLElement;
  private bubblesEl!: HTMLElement;
  private bubbles = new Map<string, { el: HTMLElement; sig: string }>();
  private hudSig = '';
  private goalSig = '';
  private modalEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private battleEl!: HTMLElement;
  private bannerEl!: HTMLElement;
  private resetArmed = 0;
  hidden = false;
  modalAction: ((ok: boolean) => void) | null = null;

  constructor(private a: UIActions) {
    this.root = document.getElementById('ui')!;
    this.root.innerHTML = `
      <div class="bubbles" id="bubbles"></div>
      <header class="hud">
        <button class="lvl" data-action="tasks"><i class="ring"></i><b>1</b></button>
        <div class="pill gold">${GOLD}<b>0</b></div>
        <div class="pill gems">${GEM}<b>0</b></div>
        <button class="pill barn" data-nav="barn"><span class="emo">📦</span><b>0</b></button>
        <button class="round opt" data-action="options" aria-label="options">⚙️</button>
      </header>
      <div class="side left" id="side-left"></div>
      <div class="side right"><button class="side-btn" data-action="tasks"><span class="emo">📋</span><i class="mini-bar"><i></i></i></button><button class="side-btn" data-action="event"><span class="emo">🏆</span></button></div>
      <div class="banner hidden" id="banner"></div>
      <div class="toasts" id="toasts"></div>
      <footer class="bottom">
        <div class="goal" id="goal"></div>
        <nav class="nav" id="nav">${NAV.map(([k, e]) => `<button data-nav="${k}"><span class="emo">${e}</span><span class="lbl-t" data-i18n="nav.${k}"></span><i class="dot hidden"></i></button>`).join('')}</nav>
      </footer>
      <div class="sheet-backdrop" id="sheet-backdrop"></div>
      <section class="sheet" id="sheet" role="dialog" aria-modal="true"><div class="grab"></div><button class="sheet-close" data-action="close" aria-label="close">✕</button><div class="sheet-body" id="sheet-body"></div></section>
      <div class="battle-hud hidden" id="battle"></div>
      <div class="modal hidden" id="modal"></div>`;
    this.sheetEl = this.root.querySelector('#sheet')!;
    this.body = this.root.querySelector('#sheet-body')!;
    this.bubblesEl = this.root.querySelector('#bubbles')!;
    this.modalEl = this.root.querySelector('#modal')!;
    this.toastEl = this.root.querySelector('#toasts')!;
    this.battleEl = this.root.querySelector('#battle')!;
    this.bannerEl = this.root.querySelector('#banner')!;
    this.root.addEventListener('click', this.onClick);
    this.root.querySelector('#sheet-backdrop')!.addEventListener('click', () => this.closeSheet());
    this.installSwipe();
    this.translate();
  }

  translate(): void {
    this.root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { el.textContent = tk(el.dataset.i18n!); });
    this.sheetSig = '';
    this.goalSig = '';
    this.hudSig = '';
    for (const b of this.bubbles.values()) b.sig = '';
  }

  // ---------- Events ----------
  private onClick = (e: MouseEvent): void => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action],[data-nav],[data-bubble]');
    if (!el) return;
    if (el.dataset.nav) {
      this.a.sound('tap');
      const n = el.dataset.nav;
      if (this.sheet?.kind === n) { this.closeSheet(); return; }
      if (n === 'barn') this.open({ kind: 'barn', tab: 'crops' });
      else if (n === 'market') this.open({ kind: 'market', tab: 'buy' });
      else if (n === 'shop') this.open({ kind: 'shop', tab: 'boosts' });
      else this.open({ kind: n as 'orders' | 'heroes' });
      return;
    }
    if (el.dataset.bubble) { void this.bubbleAction(el.dataset.bubble, el); return; }
    const action = el.dataset.action!;
    const arg = el.dataset.arg ?? '';
    void this.handle(action, arg, el);
  };

  private async handle(action: string, arg: string, el: HTMLElement): Promise<void> {
    const s = this.a.state();
    const fail = (r: Result): void => {
      if (!r.ok) {
        this.a.sound('error');
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
        if (r.reason === 'barn') this.toast(t('ui.barnFull'), '📦');
      } else this.a.sound('tap');
      this.sheetSig = '';
    };
    const sheetFor: Record<string, () => Sheet> = {
      tasks: () => ({ kind: 'tasks' }), event: () => ({ kind: 'event' }), options: () => ({ kind: 'options' }), credits: () => ({ kind: 'credits' }), castle: () => ({ kind: 'castle' }),
    };
    if (sheetFor[action]) { this.a.sound('tap'); this.open(sheetFor[action]()); return; }
    switch (action) {
      case 'close': this.closeSheet(); return;
      case 'tab': {
        const sh = this.sheet as { tab?: string } | null;
        if (sh) sh.tab = arg;
        this.sheetSig = '';
        this.a.sound('tap');
        return;
      }
      case 'pick': {
        const sh = this.sheet;
        if (sh?.kind === 'camp') {
          const id = arg as HeroId;
          sh.pick = sh.pick.includes(id) ? sh.pick.filter((x) => x !== id) : sh.pick.length < 3 ? [...sh.pick, id] : sh.pick;
          this.sheetSig = '';
        }
        return;
      }
      case 'collect': {
        const id = Number(arg);
        const r = await this.a.run('collect', id);
        if (r.ok) this.fly(el, '📦');
        else fail(r);
        return;
      }
      case 'reset':
        if (Date.now() - this.resetArmed < 4000) { await this.a.run('reset'); this.closeSheet(); }
        else { this.resetArmed = Date.now(); el.textContent = t('ui.resetConfirm'); }
        return;
      case 'modal-ok': this.modalAction?.(true); return;
      case 'modal-no': this.modalAction?.(false); return;
    }
    const args = arg === '' ? [] : arg.split('|').map((x) => (/^-?\d+$/.test(x) ? Number(x) : x === 'true' ? true : x === 'false' ? false : x));
    if (action === 'fight') {
      const sh = this.sheet;
      if (sh?.kind === 'camp') { this.closeSheet(); await this.a.run('fight', sh.region, sh.pick); }
      return;
    }
    const r = await this.a.run(action, ...args);
    fail(r);
    if (r.ok && ['build', 'restore', 'recruit', 'dismiss', 'chest'].includes(action)) this.closeSheet();
    void s;
  }

  private async bubbleAction(spec: string, el: HTMLElement): Promise<void> {
    const [kind, a1, a2] = spec.split(':');
    const s = this.a.state();
    if (kind === 'ready') {
      const r = await this.a.run('collect', Number(a1));
      if (r.ok) this.fly(el, '📦'); else this.a.sound('error');
    } else if (kind === 'open') this.open({ kind: 'building', id: Number(a1) });
    else if (kind === 'plot') this.open({ kind: 'plot', plot: Number(a1) });
    else if (kind === 'orders') this.open({ kind: 'orders' });
    else if (kind === 'camp') this.openCamp(Number(a1));
    else if (kind === 'chest') { const r = await this.a.run('chest', Number(a1)); if (r.ok) this.fly(el, '🪙'); }
    else if (kind === 'ruins') this.open({ kind: 'ruins', region: Number(a1) });
    else if (kind === 'visitor') this.showVisitor();
    void a2;
    void s;
  }

  openCamp(region: number): void {
    const s = this.a.state();
    const pick = G.squad(s, this.a.now()).map((h) => h.id);
    this.open({ kind: 'camp', region, pick });
  }

  private installSwipe(): void {
    let y0 = -1;
    const grab = this.sheetEl.querySelector('.grab') as HTMLElement;
    grab.addEventListener('pointerdown', (e) => { y0 = e.clientY; grab.setPointerCapture(e.pointerId); });
    grab.addEventListener('pointermove', (e) => { if (y0 >= 0) this.sheetEl.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
    const end = (e: PointerEvent): void => { if (y0 < 0) return; const dy = e.clientY - y0; y0 = -1; this.sheetEl.style.transform = ''; if (dy > 70) this.closeSheet(); };
    grab.addEventListener('pointerup', end);
    grab.addEventListener('pointercancel', end);
  }

  // ---------- Sheets ----------
  open(s: Sheet): void {
    this.sheet = s;
    this.sheetSig = '';
    this.root.classList.add('sheet-open');
    this.root.querySelectorAll<HTMLElement>('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.nav === s.kind));
    this.renderSheet();
    this.a.sheetChanged(true);
  }

  closeSheet(): void {
    if (!this.sheet) return;
    this.sheet = null;
    this.root.classList.remove('sheet-open');
    this.root.querySelectorAll('#nav button').forEach((b) => b.classList.remove('active'));
    this.a.sheetChanged(false);
  }

  get sheetOpen(): boolean { return this.sheet !== null; }
  get currentSheet(): Sheet | null { return this.sheet; }

  private setSheet(html: string): void {
    if (html === this.sheetSig) return;
    this.sheetSig = html;
    const sc = this.body.scrollTop;
    this.body.innerHTML = html;
    this.body.scrollTop = sc;
  }

  private renderSheet(): void {
    const sh = this.sheet;
    if (!sh) return;
    const s = this.a.state();
    const now = this.a.now();
    let html = '';
    switch (sh.kind) {
      case 'building': html = this.buildingSheet(s, sh.id, now); break;
      case 'plot': html = this.plotSheet(s, sh.plot); break;
      case 'barn': html = this.barnSheet(s, sh.tab); break;
      case 'orders': html = this.ordersSheet(s, now); break;
      case 'heroes': html = this.heroesSheet(s, now); break;
      case 'market': html = this.marketSheet(s, sh.tab, now); break;
      case 'shop': html = this.shopSheet(s, sh.tab, now); break;
      case 'castle': html = this.castleSheet(s); break;
      case 'camp': html = this.campSheet(s, sh.region, sh.pick, now); break;
      case 'ruins': html = this.ruinsSheet(s, sh.region); break;
      case 'tasks': html = this.tasksSheet(s); break;
      case 'event': html = this.eventSheet(s, now); break;
      case 'options': html = this.optionsSheet(s); break;
      case 'credits': html = this.creditsSheet(); break;
    }
    this.setSheet(html);
    this.updateLive(s, now);
  }

  private head(title: string, sub: string, thumb: string): string {
    return `<div class="sheet-head">${thumb ? `<img class="thumb big" src="${thumb}" alt=""/>` : ''}<div><h2>${title}</h2>${sub ? `<p class="desc">${sub}</p>` : ''}</div></div>`;
  }

  private buildingSheet(s: GameState, id: number, now: number): string {
    const b = s.buildings.find((x) => x.id === id);
    if (!b) return '';
    if (b.type === 'barn') return this.barnSheet(s, 'crops');
    if (b.type === 'orders') return this.ordersSheet(s, now);
    if (b.type === 'market') return this.marketSheet(s, 'buy', now);
    if (b.type === 'castle' || b.type === 'walls') return this.castleSheet(s);
    const def = BUILDINGS[b.type];
    let html = this.head(bn(b.type), '', this.a.thumbnail(b.type));
    if (b.buildEnd > 0) {
      return html + `<div class="progress-row"><div class="bar"><i data-live="build:${b.id}"></i></div><span class="timer" data-live="buildt:${b.id}"></span></div>
        <button class="btn ad" data-action="finishAd" data-arg="${b.id}"><span class="emo">▶️</span>${t('ui.finishAd')}</button>`;
    }
    // Queue / animals / crop status
    const slotsN = def.kind === 'field' ? 1 : G.slots(s, b);
    const cells: string[] = [];
    b.jobs.forEach((j, i) => {
      const running = def.kind !== 'factory' || i === 0;
      cells.push(`<div class="slot ${running ? 'run' : ''}">${icon(G.recipe(j.recipe).out)}${running ? `<i class="sbar"><i data-live="job:${b.id}:${i}"></i></i>` : ''}</div>`);
    });
    for (const r of b.ready) cells.push(`<button class="slot ready" data-action="collect" data-arg="${b.id}">${icon(G.recipe(r).out)}<b>✓</b></button>`);
    const shown = def.kind === 'factory' ? slotsN + b.ready.length : slotsN;
    while (cells.length < shown) cells.push('<div class="slot empty"></div>');
    const head = b.jobs[0];
    if (def.kind !== 'field' || b.jobs.length || b.ready.length) html += `<div class="queue">${cells.join('')}</div>`;
    if (head) {
      html += `<div class="progress-row"><span class="timer" data-live="jobt:${b.id}"></span>
        <button class="btn ad small" data-action="finishAd" data-arg="${b.id}"><span class="emo">▶️</span>${t('ui.finishAd')}</button>
        <button class="btn soft small" data-action="skipGems" data-arg="${b.id}">${GEM}${G.skipCost(head.end - now)}</button></div>`;
    }
    if (b.ready.length) html += `<button class="btn gold" data-action="collect" data-arg="${b.id}"><span class="emo">🧺</span>${t('ui.collect')}</button>`;
    // Recipes
    const rs = G.recipesFor(b.type);
    if (def.kind === 'animal') {
      const r = rs[0];
      const free = slotsN - b.jobs.length - b.ready.length;
      html += `<div class="recipe big">${icon(r.out)}<div class="r-main"><b>${iname(r.out as string)}</b><div class="chips">${bagChips(r.inputs, s)}<span class="chip">⏱${formatDuration(G.jobTime(s, r, now))}</span></div></div>
        <button class="btn small ${free > 0 && G.hasAll(s, r.inputs) ? 'go' : 'disabled'}" data-action="feed" data-arg="${b.id}">${t('ui.feed')} (${free})</button></div>`;
    } else {
      html += `<div class="recipes">${rs.map((r) => this.recipeCard(s, b, r, now)).join('')}</div>`;
    }
    return html;
  }

  private recipeCard(s: GameState, b: G.Building, r: Recipe, now: number): string {
    const locked = s.level < r.level;
    const ok = G.canStart(s, b, r).ok;
    const verb = BUILDINGS[b.type].kind === 'field' ? t('ui.plant') : t('ui.make');
    return `<button class="recipe ${locked ? 'locked' : ok ? '' : 'disabled'}" data-action="start" data-arg="${b.id}|${r.id}" data-recipe="${r.id}">
      ${icon(r.out)}<div class="r-main"><b>${iname(r.out as string)}${r.qty > 1 ? ` ×${r.qty}` : ''}</b>
      <div class="chips small">${locked ? `<span class="chip">🔒 ${t('ui.locked', { n: r.level })}</span>` : `${bagChips(r.inputs, s)}${r.gold ? `<span class="chip">${GOLD}${r.gold}</span>` : ''}<span class="chip">⏱${formatDuration(G.jobTime(s, r, now))}</span>`}</div></div>
      <span class="r-verb">${locked ? '' : verb}</span></button>`;
  }

  private plotSheet(s: GameState, plot: number): string {
    const existing = G.buildingOnPlot(s, plot);
    if (existing) { this.sheet = { kind: 'building', id: existing.id }; return this.buildingSheet(s, existing.id, this.a.now()); }
    const cards = BUILD_MENU.map((type) => {
      const d = BUILDINGS[type];
      const c = G.canBuild(s, type);
      const cost = G.buildCost(s, type);
      const locked = !c.ok && c.reason === 'level';
      const limit = !c.ok && c.reason === 'limit';
      if (limit && type !== 'field') return '';
      const outs = G.recipesFor(type).slice(0, 4).map((r) => icon(r.out)).join('');
      return `<button class="card build-card ${c.ok ? '' : 'disabled'} ${locked ? 'locked' : ''}" data-action="build" data-arg="${type}|${plot}" data-build="${type}">
        <img class="thumb" src="${this.a.thumbnail(type)}" alt=""/><div class="card-main"><div class="card-title">${bn(type)}</div><div class="outs">${outs}</div>
        <div class="chips small">${locked ? `<span class="chip">🔒 ${t('ui.locked', { n: d.level })}</span>` : limit ? `<span class="chip">${t('ui.limit')}</span>` : bagChips(cost, s)}</div></div></button>`;
    }).join('');
    return `<h2>${t('ui.buildHere')}</h2><div class="cards">${cards}</div>`;
  }

  private barnSheet(s: GameState, tab: Category): string {
    const used = G.barnUsed(s), cap = G.barnCap(s);
    const cats: Category[] = ['crops', 'animal', 'materials', 'goods', 'gear', 'tools'];
    const items = ITEM_IDS.filter((i) => ITEMS[i].cat === tab && (G.count(s, i) > 0 || G.isUnlocked(s, i)));
    const cost = G.barnUpgradeCost(s.barnLevel);
    const ok = s.gold >= cost.gold && G.hasAll(s, { hammer: cost.hammer, nails: cost.nails, paint: cost.paint });
    return `${this.head(bn('barn'), `${t('ui.capacity')} ${used}/${cap}`, this.a.thumbnail('barn'))}
      <div class="bar cap"><i style="width:${Math.min(100, (used / cap) * 100)}%" class="${used >= cap ? 'full' : ''}"></i></div>
      <div class="tabs">${cats.map((c) => `<button class="${c === tab ? 'on' : ''}" data-action="tab" data-arg="${c}">${t(`cat.${c}` as 'cat.crops')}</button>`).join('')}</div>
      <div class="items">${items.map((i) => `<div class="item ${G.count(s, i) ? '' : 'zero'}">${icon(i)}<b>${G.count(s, i)}</b><small>${iname(i)}</small></div>`).join('') || '<p class="desc">—</p>'}</div>
      <div class="upgrade-box"><b>${t('ui.barnUpgrade')}</b><p class="desc">${t('ui.barnUpgradeDesc')}</p><div class="chips">${bagChips(cost, s)}</div>
      <button class="btn ${ok ? 'go' : 'disabled'}" data-action="barnUp">⬆ ${t('ui.upgrade')}</button></div>`;
  }

  private ordersSheet(s: GameState, now: number): string {
    const orders = s.orders.map((o) => {
      if (o.readyAt > now) return `<div class="order waiting"><span class="emo">🕊️</span><span>${t('ui.newOrder')}</span><span class="timer" data-live="order:${o.id}"></span></div>`;
      const can = G.canDeliver(s, o, now);
      return `<div class="order ${can ? 'can' : ''}"><div class="lines">${o.lines.map(([i, q]) => `<span class="need ${G.count(s, i) >= q ? 'ok' : ''}">${icon(i)}<b>${Math.min(G.count(s, i), q)}/${q}</b></span>`).join('')}</div>
        <div class="o-foot"><div class="chips">${rewardChips(o.gold, 0, o.xp, o.tool ? { [o.tool]: 1 } : {})}</div>
        <button class="btn small ${can ? 'gold' : 'disabled'}" data-action="deliver" data-arg="${o.id}" data-order="${o.id}">${t('ui.deliver')}</button><button class="trash" data-action="discard" data-arg="${o.id}" aria-label="discard">🗑️</button></div></div>`;
    }).join('');
    let cart = '';
    if (s.cart) {
      const left = Math.max(0, s.cart.leave - s.play);
      cart = `<div class="cart-box"><div class="cart-head"><span class="emo big">🛒</span><div><b>${t('ui.cart')}</b><p class="desc">${t('ui.cartDesc')}</p></div><span class="timer">${t('ui.cartLeaves', { t: formatDuration(left) })}</span></div>
        <div class="crates">${s.cart.crates.map((c, i) => `<button class="crate ${c.done ? 'done' : G.count(s, c.item) >= c.qty ? 'can' : ''}" data-action="crate" data-arg="${i}">${icon(c.item)}<b>${c.done ? '✓' : `${Math.min(G.count(s, c.item), c.qty)}/${c.qty}`}</b></button>`).join('')}</div>
        <div class="chips center"><small>${t('ui.reward')}</small>${rewardChips(0, 5, 0, { hammer: 1, nails: 1, paint: 1 })}</div></div>`;
    }
    return `${this.head(bn('orders'), '', this.a.thumbnail('orders'))}<div class="orders">${orders}</div>${cart}`;
  }

  private heroesSheet(s: GameState, now: number): string {
    const cards = HEROES.map((d) => {
      const h = s.heroes[d.id];
      if (!h) return `<div class="hero locked"><img class="portrait" src="${this.a.thumbnail(`hero:${d.id}`)}" alt=""/><div class="hero-main"><b>${tk(`h.${d.id}`)}</b><small>${tk(`role.${d.role}`)}</small><p class="desc">${t('ui.heroLocked')}</p></div></div>`;
      const hp = G.heroHp(h, now);
      const need = G.heroXpNeed(h.level);
      const canTrain = h.xp >= need && h.level < G.heroMaxLevel(s);
      const sc = G.starCost(h.stars);
      return `<div class="hero" style="--hc:${d.color}"><img class="portrait" src="${this.a.thumbnail(`hero:${d.id}`)}" alt=""/>
        <div class="hero-main"><div class="hero-title"><b>${tk(`h.${d.id}`)}</b><span class="stars">${'★'.repeat(h.stars)}${'☆'.repeat(5 - h.stars)}</span></div>
        <small>${tk(`role.${d.role}`)} · ${t('ui.level', { n: h.level })} · ⚔️ ${G.heroPower(s, d.id)}</small>
        <div class="mini-stats"><span>❤️</span><i class="bar hp"><i style="width:${hp * 100}%"></i></i><span>⭐</span><i class="bar"><i style="width:${Math.min(100, (h.xp / need) * 100)}%"></i></i></div>
        <small class="perk">✨ ${tk(`sk.${d.skill}`)} · ${t('ui.bonusProd', { p: Math.round(d.bonus.pct * h.stars * 100), b: bn(d.bonus.building) })}</small>
        <div class="hero-btns">
          <button class="btn tiny ${canTrain && s.gold >= G.heroTrainCost(h.level) ? 'go' : 'disabled'}" data-action="train" data-arg="${d.id}">⬆ ${GOLD}${G.heroTrainCost(h.level)}</button>
          ${h.weapon ? `<span class="chip good">${icon(d.weapon)}✓</span>` : `<button class="btn tiny ${G.count(s, d.weapon) ? 'go' : 'disabled'}" data-action="equip" data-arg="${d.id}|weapon">${icon(d.weapon)}${t('ui.equip')}</button>`}
          ${h.shield ? `<span class="chip good">${icon('shield')}✓</span>` : `<button class="btn tiny ${G.count(s, 'shield') ? 'go' : 'disabled'}" data-action="equip" data-arg="${d.id}|shield">${icon('shield')}</button>`}
          ${hp < 1 ? `<button class="btn tiny ${G.count(s, 'pie') ? 'go' : 'disabled'}" data-action="feedHero" data-arg="${d.id}|pie">${icon('pie')}</button><button class="btn tiny ${G.count(s, 'stew') ? 'go' : 'disabled'}" data-action="feedHero" data-arg="${d.id}|stew">${icon('stew')}</button>` : ''}
          ${h.stars < 5 ? `<button class="btn tiny ${s.gold >= sc.gold && G.count(s, 'banner') >= sc.banner ? 'gold' : 'disabled'}" data-action="star" data-arg="${d.id}">★ ${icon('banner')}${sc.banner} ${GOLD}${formatNumber(sc.gold)}</button>` : ''}
        </div></div></div>`;
    }).join('');
    return `<h2>${t('nav.heroes')}</h2><div class="army"><span class="emo">💂</span>${t('ui.troops', { s: s.troops.soldier, a: s.troops.archer })}</div><div class="heroes">${cards}</div>`;
  }

  private marketSheet(s: GameState, tab: 'buy' | 'sell', now: number): string {
    if (!G.buildingOf(s, 'market')) return `${this.head(bn('market'), t('ui.needLevel', { n: BUILDINGS.market.level }), this.a.thumbnail('market'))}${this.sellList(s)}`;
    const tabs = `<div class="tabs"><button class="${tab === 'buy' ? 'on' : ''}" data-action="tab" data-arg="buy">${t('ui.buyTab')}</button><button class="${tab === 'sell' ? 'on' : ''}" data-action="tab" data-arg="sell">${t('ui.sellTab')}</button></div>`;
    if (tab === 'sell') return `${this.head(t('ui.market'), '', this.a.thumbnail('market'))}${tabs}${this.sellList(s)}`;
    const offers = s.market.offers.map((o, i) => `<button class="offer ${o.sold ? 'sold' : ''}" data-action="buyOffer" data-arg="${i}">${icon(o.item)}<b>×${o.qty}</b><small>${iname(o.item)}</small>
      <span class="price">${o.sold ? t('ui.sold') : o.gems ? `${GEM}${o.gems}` : `${GOLD}${formatNumber(o.gold)}`}</span></button>`).join('');
    return `${this.head(t('ui.market'), '', this.a.thumbnail('market'))}${tabs}<div class="offers">${offers}</div>
      <div class="progress-row"><span class="timer">${t('ui.refreshIn', { t: formatDuration((s.market.refreshAt - now) / 1000) })}</span>
      <button class="btn ad small" data-action="refreshAd"><span class="emo">▶️</span>${t('ui.refresh')}</button><button class="btn soft small" data-action="refreshGems">${GEM}3</button></div>`;
  }

  private sellList(s: GameState): string {
    const items = ITEM_IDS.filter((i) => G.count(s, i) > 0 && ITEMS[i].cat !== 'tools');
    return `<div class="sell-list">${items.map((i) => `<div class="sell-row">${icon(i)}<b>${iname(i)}</b><span>×${G.count(s, i)}</span>
      <button class="btn tiny soft" data-action="sell" data-arg="${i}|1">${GOLD}${Math.ceil(ITEMS[i].price * 0.6)}</button>
      <button class="btn tiny gold" data-action="sell" data-arg="${i}|${Math.ceil(G.count(s, i) / 2)}">${t('ui.sellAll')}</button></div>`).join('') || '<p class="desc">—</p>'}</div>`;
  }

  private shopSheet(s: GameState, tab: string, now: number): string {
    const tabs = (['boosts', 'slots', 'gear', 'decor', 'skins', 'research'] as const).map((k) => `<button class="${k === tab ? 'on' : ''}" data-action="tab" data-arg="${k}">${t(`ui.${k}` as 'ui.boosts')}</button>`).join('');
    let body: string;
    if (tab === 'boosts') {
      const left = (s.boostUntil - now) / 1000;
      body = `<div class="shop-grid">
        <div class="shop-card"><span class="emo big">⚡</span><b>${t('ui.boost15')}</b>${left > 0 ? `<small>${t('ui.boostActive', { t: formatDuration(left) })}</small>` : ''}<button class="btn small ${s.gems >= G.BOOST_GEMS ? 'go' : 'disabled'}" data-action="boost">${GEM}${G.BOOST_GEMS}</button></div>
        <div class="shop-card"><span class="emo big">⚡</span><b>${t('ui.boost5')}</b><button class="btn small ad" data-action="boostAd"><span class="emo">▶️</span>${t('ui.use')}</button></div>
        <div class="shop-card"><span class="emo big">💎</span><b>${t('ui.freeGems')}</b><button class="btn small ad" data-action="gemsAd"><span class="emo">▶️</span>${t('ui.use')}</button></div></div>`;
    } else if (tab === 'slots') {
      body = `<div class="shop-list">${s.buildings.filter((b) => BUILDINGS[b.type].kind === 'factory' && b.buildEnd === 0).filter((b, i, a) => a.findIndex((x) => x.type === b.type) === i).map((b) => {
        const e = s.extraSlots[b.type] ?? 0;
        return `<div class="sell-row"><img class="mini-thumb" src="${this.a.thumbnail(b.type)}" alt=""/><b>${bn(b.type)}</b><span>${G.slots(s, b)} ${t('ui.queue').toLowerCase()}</span>${e < 3 ? `<button class="btn tiny ${s.gems >= G.slotCost(e) ? 'go' : 'disabled'}" data-action="slot" data-arg="${b.type}">+1 ${GEM}${G.slotCost(e)}</button>` : `<span class="chip">${t('ui.full')}</span>`}</div>`;
      }).join('')}</div>`;
    } else if (tab === 'gear') {
      body = `<div class="shop-grid">${(Object.entries(G.GEAR_PRICE) as [ItemId, number][]).map(([i, p]) => `<div class="shop-card">${icon(i)}<b>${iname(i)}</b><small>×${G.count(s, i)}</small><button class="btn small ${s.gold >= p ? 'go' : 'disabled'}" data-action="gear" data-arg="${i}">${GOLD}${p}</button></div>`).join('')}</div>`;
    } else if (tab === 'decor') {
      body = `<div class="shop-grid">${(Object.keys(DECOR) as DecorId[]).map((d) => `<div class="shop-card"><img class="mini-thumb" src="${this.a.thumbnail(`decor:${d}`)}" alt=""/><b>${tk(`d.${d}`)}</b><small>${t('ui.decorDesc', { p: Math.round(DECOR[d].beauty * 100) })}</small><button class="btn small go" data-action="decor" data-arg="${d}">${DECOR[d].gems ? `${GEM}${DECOR[d].gems}` : `${GOLD}${DECOR[d].gold}`}</button></div>`).join('')}</div>`;
    } else if (tab === 'skins') {
      body = `<div class="shop-grid">${(Object.keys(SKINS) as SkinId[]).map((k) => `<div class="shop-card ${s.skin === k ? 'on' : ''}"><img class="mini-thumb" src="${this.a.thumbnail(`skin:${k}`)}" alt=""/><b>${tk(`s.${k}`)}</b>
        <button class="btn small ${s.skin === k ? 'disabled' : 'go'}" data-action="skin" data-arg="${k}">${s.skins.includes(k) ? (s.skin === k ? '✓' : t('ui.use')) : `${GEM}${G.SKIN_GEMS}`}</button></div>`).join('')}</div>`;
    } else {
      body = `<div class="shop-list">${(Object.keys(RESEARCH) as ResearchId[]).map((r) => {
        const tier = s.research[r];
        const max = tier >= RESEARCH[r].tiers;
        const c = researchCost(tier);
        const lvl = 3 + tier * 3;
        return `<div class="sell-row research"><span class="emo">${{ farming: '🌾', industry: '⚙️', warfare: '⚔️', building: '🏗️' }[r]}</span><div class="r-main"><b>${tk(`r.${r}`)} ${'●'.repeat(tier)}${'○'.repeat(RESEARCH[r].tiers - tier)}</b><small>${tk(`rd.${r}`)}</small></div>
          ${max ? '<span class="chip good">✓</span>' : s.level < lvl ? `<span class="chip">🔒 ${t('ui.locked', { n: lvl })}</span>` : `<button class="btn tiny ${s.gold >= c.gold && s.gems >= c.gems ? 'go' : 'disabled'}" data-action="research" data-arg="${r}">${GOLD}${formatNumber(c.gold)}${c.gems ? ` ${GEM}${c.gems}` : ''}</button>`}</div>`;
      }).join('')}</div>`;
    }
    return `<h2>${t('ui.shop')}</h2><div class="tabs scroll">${tabs}</div>${body}`;
  }

  private castleSheet(s: GameState): string {
    const c = G.castle(s), w = G.walls(s);
    const cc = G.castleUpgradeCost(c.level), wc = G.wallsUpgradeCost(w.level);
    const castleCap = 1 + Math.floor(s.level / 3);
    return `${this.head(`${bn('castle')} · ${t('ui.level', { n: c.level })}`, t('ui.castleDesc', { n: G.heroMaxLevel(s) }), this.a.thumbnail('castle'))}
      <div class="chips"><span class="chip">${GOLD}${t('ui.taxes', { n: (c.level * 1.5).toFixed(1) })}</span></div>
      <div class="upgrade-box"><div class="chips">${bagChips(cc, s)}</div>${c.level >= castleCap ? `<p class="desc">🔒 ${t('ui.needLevel', { n: (c.level) * 3 })}</p>` : ''}
      <button class="btn ${c.level < castleCap && s.gold >= cc.gold && G.hasAll(s, { stone: cc.stone, wood: cc.wood, hammer: cc.hammer, nails: cc.nails }) ? 'go' : 'disabled'}" data-action="castleUp">⬆ ${t('ui.upgrade')}</button></div>
      <div class="upgrade-box"><b>${bn('walls')} · ${t('ui.level', { n: w.level })}</b><p class="desc">${t('ui.wallsDesc', { n: Math.min(4, w.level) })}</p><div class="chips">${bagChips(wc, s)}</div>
      <button class="btn ${s.gold >= wc.gold && G.hasAll(s, { stone: wc.stone, wood: wc.wood }) ? 'go' : 'disabled'}" data-action="wallsUp">⬆ ${t('ui.upgrade')}</button></div>`;
  }

  private campSheet(s: GameState, region: number, pick: HeroId[], now: number): string {
    const enemies = campEnemies(region);
    const counts = enemies.reduce((m, e) => m.set(e, (m.get(e) ?? 0) + 1), new Map<string, number>());
    const ep = G.campPower(region);
    const sp = G.squadPower(s, now, pick);
    const lvl = campLevel(region);
    const can = G.canAttack(s, region, now);
    const rw = G.campReward(region);
    const heroes = (Object.keys(s.heroes) as HeroId[]).map((id) => {
      const h = s.heroes[id]!;
      const hp = G.heroHp(h, now);
      return `<button class="pick ${pick.includes(id) ? 'on' : ''} ${hp < 0.12 ? 'disabled' : ''}" data-action="pick" data-arg="${id}"><img src="${this.a.thumbnail(`hero:${id}`)}" alt=""/><i class="bar hp"><i style="width:${hp * 100}%"></i></i><small>⚔️${G.heroPower(s, id)}</small></button>`;
    }).join('');
    return `${this.head(`${t('ui.camp')} ${region}`, t('ui.campDesc'), '')}
      <div class="enemies">${[...counts].map(([e, n]) => `<div class="enemy"><img src="${this.a.thumbnail(`enemy:${e}`)}" alt=""/><b>×${n}</b></div>`).join('')}</div>
      <div class="vs"><div><small>${t('ui.enemies')}</small><b class="bad">⚔️ ${ep}</b></div><span>VS</span><div><small>${t('ui.yourPower')}</small><b class="${sp >= ep ? 'good' : 'warn'}">⚔️ ${sp}</b></div></div>
      <p class="desc center">${t('ui.squad')} · 💂 ${t('ui.troops', { s: Math.min(3, s.troops.soldier), a: Math.min(3, s.troops.archer) })}</p>
      <div class="picks">${heroes}</div>${sp < ep ? `<p class="note warn">${t('ui.weak')}</p>` : ''}
      <div class="chips center"><small>${t('ui.reward')}</small>${rewardChips(rw.gold, rw.gems, rw.xp, rw.items)}</div>
      ${s.level < lvl ? `<p class="note center">🔒 ${t('ui.needLevel', { n: lvl })}</p>` : ''}
      <button class="btn red ${can.ok && pick.length ? '' : 'disabled'}" data-action="fight" data-camp="${region}">⚔️ ${t('ui.fight')}</button>`;
  }

  private ruinsSheet(s: GameState, region: number): string {
    const c = G.ruinsCost(region);
    return `${this.head(t('ui.ruins'), t('ui.ruinsDesc'), this.a.thumbnail('ruins'))}<div class="chips center">${bagChips(c, s)}</div>
      <div class="chips center"><small>${t('ui.reward')}</small>${rewardChips(80 + 20 * region, 8, 20 + 5 * region)}</div>
      <button class="btn ${G.hasAll(s, c) ? 'go' : 'disabled'}" data-action="restore" data-arg="${region}">🔨 ${t('ui.restore')}</button>`;
  }

  private tasksSheet(s: GameState): string {
    const pct = G.dailyPercent(s);
    return `<h2>📋 ${t('ui.tasks')}</h2><p class="desc">${t('ui.tasksDesc')}</p><div class="bar big"><i style="width:${pct}%"></i></div>
      <div class="tasks">${s.daily.tasks.map((x) => `<div class="task ${x.progress >= x.target ? 'done' : ''}"><span>${tk(`t.${x.kind}`, { n: x.target })}</span><b>${x.progress}/${x.target}</b></div>`).join('')}</div>
      <div class="chips center">${rewardChips(100 + 20 * s.level, 10, 0, { hammer: 1, nails: 1, paint: 1 })}</div>
      <button class="btn ${pct >= 100 && !s.daily.claimed ? 'gold' : 'disabled'}" data-action="daily">🎁 ${s.daily.claimed ? '✓' : t('ui.claim')}</button>`;
  }

  private eventSheet(s: GameState, now: number): string {
    const board = G.leaderboard(s, now, t('ui.you'));
    const end = (G.weekStart(now) + 7 * 86_400_000 - now) / 1000;
    return `<h2>🏆 ${t('ui.event')}</h2><p class="desc">${t('ui.eventDesc', { t: formatDuration(end) })}</p>
      ${s.weekly.pending ? `<button class="btn gold" data-action="weekly">${t('ui.weeklyReward', { n: s.weekly.pending })} · ${t('ui.claim')}</button>` : ''}
      <ol class="board">${board.map((r, i) => `<li class="${r.you ? 'you' : ''}"><span class="rank">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span><b>${r.name}</b><span>${formatNumber(r.points)}</span></li>`).join('')}</ol>`;
  }

  private optionsSheet(s: GameState): string {
    const st = s.settings;
    const seg = (k: string, opts: [string, string][], cur: string): string => `<div class="seg">${opts.map(([v, label]) => `<button class="${cur === v ? 'on' : ''}" data-action="setting" data-arg="${k}|${v}">${label}</button>`).join('')}</div>`;
    return `<h2>${t('ui.optionsTitle')}</h2>
      <div class="opt"><span class="emo">🔊</span><span>${t('ui.sound')}</span>${seg('sfx', [['true', t('ui.on')], ['false', t('ui.off')]], String(st.sfx))}</div>
      <div class="opt"><span class="emo">🎵</span><span>${t('ui.music')}</span>${seg('music', [['true', t('ui.on')], ['false', t('ui.off')]], String(st.music))}</div>
      <div class="opt"><span class="emo">🌐</span><span>${t('ui.language')}</span>${seg('lang', [['auto', t('ui.auto')], ['en', 'EN'], ['fr', 'FR']], st.lang)}</div>
      <div class="opt"><span class="emo">✨</span><span>${t('ui.graphics')}</span>${seg('quality', [['auto', t('ui.auto')], ['high', t('ui.high')], ['low', t('ui.low')]], st.quality)}</div>
      <div class="opt-links"><button class="btn soft small" data-action="credits">${t('ui.credits')}</button><button class="btn danger small" data-action="reset">${t('ui.reset')}</button></div>`;
  }

  private creditsSheet(): string {
    return `<h2>${t('ui.credits')}</h2><div class="credits">
      <p><b>3D models</b>: KayKit Medieval Hexagon Pack, Character Pack Adventurers and Skeletons by Kay Lousberg (kaylousberg.com) — CC0 1.0.</p>
      <p><b>Font</b>: Fredoka by Milena Brandão & Hafontia — SIL Open Font License 1.1.</p>
      <p><b>Engine</b>: three.js (MIT). Farm animals, crops, sounds and music are made in code.</p></div>`;
  }

  private updateLive(s: GameState, now: number): void {
    this.body.querySelectorAll<HTMLElement>('[data-live]').forEach((el) => {
      const [kind, a, b] = el.dataset.live!.split(':');
      if (kind === 'order') {
        const o = s.orders.find((x) => x.id === Number(a));
        if (o) el.textContent = formatDuration((o.readyAt - now) / 1000);
        return;
      }
      const bd = s.buildings.find((x) => x.id === Number(a));
      if (!bd) return;
      if (kind === 'build' || kind === 'buildt') {
        const k = Math.min(1, (now - bd.buildStart) / Math.max(1, bd.buildEnd - bd.buildStart));
        if (kind === 'build') el.style.width = `${k * 100}%`; else el.textContent = formatDuration((bd.buildEnd - now) / 1000);
      } else if (kind === 'job') {
        const j = bd.jobs[Number(b)];
        if (j) el.style.width = `${Math.min(100, Math.max(0, ((now - j.start) / Math.max(1, j.end - j.start)) * 100))}%`;
      } else if (kind === 'jobt') {
        const j = bd.jobs[0];
        if (j) el.textContent = formatDuration((j.end - now) / 1000);
      }
    });
  }

  // ---------- HUD ----------
  update(): void {
    const s = this.a.state();
    const now = this.a.now();
    const prev = xpForLevel(s.level), next = xpForLevel(s.level + 1);
    const pct = Math.min(100, ((s.xp - prev) / Math.max(1, next - prev)) * 100);
    const sig = `${s.level}|${Math.floor(pct)}|${formatNumber(s.gold)}|${s.gems}|${G.barnUsed(s)}/${G.barnCap(s)}|${G.dailyPercent(s)}`;
    if (sig !== this.hudSig) {
      this.hudSig = sig;
      const q = (sel: string) => this.root.querySelector<HTMLElement>(sel)!;
      q('.lvl b').textContent = String(s.level);
      q('.lvl .ring').style.setProperty('--p', `${pct}%`);
      q('.pill.gold b').textContent = formatNumber(s.gold);
      q('.pill.gems b').textContent = String(s.gems);
      q('.pill.barn b').textContent = `${G.barnUsed(s)}/${G.barnCap(s)}`;
      q('.pill.barn').classList.toggle('full', G.barnUsed(s) >= G.barnCap(s));
      q('.side-btn .mini-bar i').style.width = `${G.dailyPercent(s)}%`;
    }
    // Left side timers (boost, cart, raid)
    const left: string[] = [];
    if (s.boostUntil > now) left.push(`<div class="pill timer-pill boost">⚡ ${formatDuration((s.boostUntil - now) / 1000)}</div>`);
    if (s.cart) left.push(`<button class="pill timer-pill" data-nav="orders">🛒 ${formatDuration(s.cart.leave - s.play)}</button>`);
    const raidIn = s.raidAt - s.play;
    if (raidIn > 0 && raidIn < 60) left.push(`<div class="pill timer-pill raid">💀 ${formatDuration(raidIn)}</div>`);
    const lh = left.join('');
    const sideL = this.root.querySelector<HTMLElement>('#side-left')!;
    if (sideL.innerHTML !== lh) sideL.innerHTML = lh;
    // Nav dots
    const dot = (k: string, on: boolean) => this.root.querySelector(`[data-nav="${k}"] .dot`)!.classList.toggle('hidden', !on);
    dot('orders', s.orders.some((o) => G.canDeliver(s, o, now)) || !!s.cart?.crates.some((c) => !c.done && G.count(s, c.item) >= c.qty));
    dot('heroes', (Object.keys(s.heroes) as HeroId[]).some((id) => { const h = s.heroes[id]!; return h.xp >= G.heroXpNeed(h.level) && s.gold >= G.heroTrainCost(h.level) && h.level < G.heroMaxLevel(s); }));
    dot('barn', G.barnUsed(s) >= G.barnCap(s));
    this.root.querySelector('[data-nav="market"]')!.classList.toggle('locked', !G.buildingOf(s, 'market'));
    this.updateGoal(s);
    if (this.sheet) this.renderSheet();
  }

  private updateGoal(s: GameState): void {
    const goal = G.GOALS[s.tutorial];
    const id = goal ? goal.id : 'daily';
    const sig = `${id}|${getLang()}|${G.dailyPercent(s)}`;
    if (sig === this.goalSig) return;
    this.goalSig = sig;
    const el = this.root.querySelector<HTMLElement>('#goal')!;
    el.innerHTML = `<span class="emo g-ic">🎯</span><div class="g-main"><small>${t('ui.goal')}</small><b>${tk(`g.${id}`)}</b></div>
      ${goal ? `<span class="chip good">${GOLD}+${goal.gold}</span>` : `<span class="chip">${G.dailyPercent(s)}%</span>`}<button class="btn soft small" data-action="goalGo">${t('ui.go')}</button>`;
  }

  // ---------- Bubbles over the map ----------
  updateBubbles(): void {
    if (this.hidden) return;
    const s = this.a.state();
    const now = this.a.now();
    const want = new Map<string, { pos: THREE.Vector3 | null; html: string; cls: string; spec: string }>();
    for (const b of s.buildings) {
      const pos = this.a.buildingAnchor(b.id);
      if (b.buildEnd > 0) {
        want.set(`b${b.id}`, { pos, html: `🔨<b>${formatDuration((b.buildEnd - now) / 1000)}</b>`, cls: 'bub timer', spec: `open:${b.id}` });
      } else if (b.ready.length) {
        const outs = [...new Set(b.ready.map((r) => G.recipe(r).out))].slice(0, 3);
        want.set(`b${b.id}`, { pos, html: outs.map((o) => icon(o)).join('') + (b.ready.length > 1 ? `<i class="n">${b.ready.length}</i>` : ''), cls: 'bub ready', spec: `ready:${b.id}` });
      } else if (b.type === 'field' && !b.jobs.length && s.tutorial <= 1) {
        want.set(`b${b.id}`, { pos, html: '🌱', cls: 'bub hint', spec: `open:${b.id}` });
      } else if (b.type === 'orders' && s.orders.some((o) => G.canDeliver(s, o, now))) {
        want.set(`b${b.id}`, { pos, html: '📜<b>✓</b>', cls: 'bub ready', spec: 'orders' });
      }
    }
    const map = buildMap();
    const nr = G.nextRegion(s);
    if (nr !== null && map.camps[nr]) {
      const c = map.camps[nr]!;
      const ep = G.campPower(nr), sp = G.squadPower(s, now);
      const lock = s.level < campLevel(nr) || !G.canAttack(s, nr, now).ok;
      want.set(`camp${nr}`, { pos: this.a.cellAnchor(c.q, c.r, 1.3), html: lock ? `🔒<b>${t('ui.locked', { n: campLevel(nr) })}</b>` : `⚔️<b>${ep}</b>`, cls: `bub camp ${lock ? 'lock' : sp >= ep ? 'ok' : 'hard'}`, spec: `camp:${nr}` });
    }
    for (const c of s.chests) want.set(`chest${c.id}`, { pos: this.a.cellAnchor(c.q, c.r, 0.9), html: c.big ? '💰' : '🎁', cls: 'bub chest', spec: `chest:${c.id}` });
    for (const r of map.ruins) if (s.regions.includes(r.region) && !s.ruinsDone.includes(r.region)) want.set(`ruins${r.region}`, { pos: this.a.cellAnchor(r.q, r.r, 1.1), html: '🏚️', cls: 'bub ruins', spec: `ruins:${r.region}` });
    if (s.visitor) want.set('visitor', { pos: this.a.visitorAnchor(), html: `❗${(heroDef(s.visitor.hero).role === 'archer' ? '🏹' : heroDef(s.visitor.hero).role === 'mage' ? '🪄' : '🗡️')}`, cls: 'bub visitor', spec: 'visitor' });
    // A couple of "+" markers on empty land
    const used = new Set(s.buildings.map((b) => b.plot));
    const free = map.plots.filter((p) => s.regions.includes(p.region) && !used.has(p.id));
    const canSomething = BUILD_MENU.some((tp) => G.canBuild(s, tp).ok);
    if (canSomething) for (const p of free.slice(0, 2)) want.set(`p${p.id}`, { pos: this.a.cellAnchor(p.q, p.r, 0.35), html: '＋', cls: 'bub plot', spec: `plot:${p.id}` });

    for (const [k, b] of this.bubbles) if (!want.has(k)) { b.el.remove(); this.bubbles.delete(k); }
    for (const [k, w] of want) {
      let b = this.bubbles.get(k);
      if (!b) {
        const el = document.createElement('button');
        this.bubblesEl.appendChild(el);
        b = { el, sig: '' };
        this.bubbles.set(k, b);
      }
      const sig = w.html + w.cls + w.spec;
      if (b.sig !== sig) { b.sig = sig; b.el.innerHTML = w.html; b.el.className = `${w.cls} appear`; b.el.dataset.bubble = w.spec; }
      const pt = w.pos ? this.a.project(w.pos) : null;
      if (!pt || !pt.visible) { b.el.style.visibility = 'hidden'; continue; }
      b.el.style.visibility = '';
      const x = Math.min(window.innerWidth - 30, Math.max(30, pt.x));
      const tr = `translate3d(${x.toFixed(1)}px, ${pt.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      if (b.el.style.transform !== tr) b.el.style.transform = tr;
    }
  }

  // ---------- Banner, toasts, flying icons ----------
  banner(html: string | null, cls = ''): void {
    if (!html) { this.bannerEl.classList.add('hidden'); return; }
    this.bannerEl.className = `banner ${cls}`;
    if (this.bannerEl.innerHTML !== html) this.bannerEl.innerHTML = html;
  }

  toast(text: string, emo = '✨'): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="emo">${emo}</span><span></span>`;
    el.querySelector('span:last-child')!.textContent = text;
    this.toastEl.appendChild(el);
    while (this.toastEl.children.length > 3) this.toastEl.firstElementChild!.remove();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3200);
  }

  /** Icons fly from an element/point to the HUD target (barn, gold…). */
  fly(from: HTMLElement | { x: number; y: number }, emo: string, target: 'barn' | 'gold' | 'gems' = 'barn', n = 4): void {
    const r0 = from instanceof HTMLElement ? from.getBoundingClientRect() : { left: from.x, top: from.y, width: 0, height: 0 };
    const sx = r0.left + r0.width / 2, sy = r0.top + r0.height / 2;
    const tgt = this.root.querySelector<HTMLElement>(`.pill.${target}`)!;
    const tr = tgt.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'fly';
      el.innerHTML = `<span class="emo">${emo}</span>`;
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
      document.body.appendChild(el);
      const dx = tr.left + 16 - sx, dy = tr.top + tr.height / 2 - sy;
      const jx = (Math.random() - 0.5) * 70, jy = -30 - Math.random() * 40;
      el.animate(
        [{ transform: 'translate(-50%,-50%) scale(.5)', opacity: 0 }, { transform: `translate(calc(-50% + ${jx}px), calc(-50% + ${jy}px)) scale(1.15)`, opacity: 1, offset: 0.3 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.6)`, opacity: 1 }],
        { duration: 650 + i * 70, delay: i * 45, easing: 'cubic-bezier(.5,0,.4,1)', fill: 'both' },
      ).onfinish = () => { el.remove(); tgt.classList.remove('bump'); void tgt.offsetWidth; tgt.classList.add('bump'); };
    }
    this.a.sound('collect');
  }

  floatText(x: number, y: number, text: string, cls = ''): void {
    const el = document.createElement('div');
    el.className = `float-num ${cls}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  // ---------- Modals ----------
  showModal(html: string, onAction: ((ok: boolean) => void) | null = null): void {
    this.modalEl.innerHTML = `<div class="modal-card pop-in">${html}</div>`;
    this.modalEl.classList.remove('hidden');
    this.modalAction = (ok) => { this.hideModal(); onAction?.(ok); };
  }

  hideModal(): void {
    this.modalEl.classList.add('hidden');
    this.modalEl.innerHTML = '';
    this.modalAction = null;
  }

  get modalOpen(): boolean { return !this.modalEl.classList.contains('hidden'); }

  showWelcome(rep: OfflineReport, onPick: (double: boolean) => void): void {
    this.showModal(`<div class="m-icon">🏰</div><h2>${t('ui.welcomeBack')}</h2><p class="desc">${t('ui.awayFor', { t: formatDuration(rep.seconds) })}</p>
      <div class="chips center big"><span class="chip good">${GOLD}+${formatNumber(rep.gold)}</span></div><p class="desc">${t('ui.awayTax')}${rep.finished ? ` · ${t('ui.awayDone', { n: rep.finished })}` : ''}</p>
      <div class="btn-row"><button class="btn soft" data-action="modal-no">${t('ui.take')}</button><button class="btn ad" data-action="modal-ok"><span class="emo">▶️</span>${t('ui.double')}</button></div>`, onPick);
  }

  showLevelUp(level: number, onClose: () => void): void {
    const builds = BUILD_MENU.filter((b) => BUILDINGS[b].level === level);
    const items = ITEM_IDS.filter((i) => ITEMS[i].level === level && RECIPES.some((r) => r.out === i));
    this.showModal(`<div class="m-icon burst">⭐</div><h2>${t('ui.levelUp', { n: level })}</h2>
      <div class="chips center big">${rewardChips(20 * level, 3, 0)}</div>
      ${builds.length + items.length ? `<p class="desc">${t('ui.unlocked')}</p><div class="unlocks">${builds.map((b) => `<div><img src="${this.a.thumbnail(b)}" alt=""/><small>${bn(b)}</small></div>`).join('')}${items.map((i) => `<div>${icon(i)}<small>${iname(i)}</small></div>`).join('')}</div>` : ''}
      <button class="btn gold" data-action="modal-ok">${t('ui.awesome')}</button>`, () => onClose());
  }

  showVisitor(): void {
    const s = this.a.state();
    const v = s.visitor;
    if (!v) return;
    const d = heroDef(v.hero);
    const price = v.gold ? `${GOLD}${v.gold}` : v.gems ? `${GEM}${v.gems}` : t('ui.free');
    this.showModal(`<img class="m-portrait" src="${this.a.thumbnail(`hero:${v.hero}`)}" alt=""/><h2>${t('ui.visitor')}</h2>
      <p class="desc">${t('ui.visitorDesc', { name: tk(`h.${v.hero}`) })}</p><p class="desc"><b>${tk(`role.${d.role}`)}</b> · ✨ ${tk(`sk.${d.skill}`)}</p>
      <div class="btn-row"><button class="btn soft" data-action="modal-no">${t('ui.later')}</button><button class="btn go" data-action="modal-ok">${t('ui.recruit')} · ${price}</button></div>`,
    (ok) => { if (ok) void this.a.run('recruit'); });
  }

  showReward(title: string, emo: string, chips: string, sub = '', onClose?: () => void): void {
    this.showModal(`<div class="m-icon burst">${emo}</div><h2>${title}</h2>${sub ? `<p class="desc">${sub}</p>` : ''}<div class="chips center big">${chips}</div>
      <button class="btn gold" data-action="modal-ok">${t('ui.continue')}</button>`, () => onClose?.());
  }

  // ---------- Battle HUD ----------
  battleStart(title: string, heroes: { unit: number; hero: HeroId }[]): void {
    this.closeSheet();
    this.root.classList.add('in-battle');
    this.battleEl.classList.remove('hidden');
    this.battleEl.innerHTML = `<div class="b-title">${title}</div><div class="hp-bars" id="hpbars"></div>
      <div class="skills">${heroes.map((h) => `<button class="skill" data-action="cast" data-arg="${h.unit}" data-skill-unit="${h.unit}"><img src="${this.a.thumbnail(`hero:${h.hero}`)}" alt=""/><i class="cd"></i><small>${tk(`sk.${heroDef(h.hero).skill}`)}</small></button>`).join('')}
      <button class="speed" data-action="battleSpeed">x1</button></div>`;
  }

  battleUpdate(bars: { id: number; x: number; y: number; frac: number; team: 0 | 1; hero: boolean }[], cds: { unit: number; frac: number; alive: boolean }[], speed: number): void {
    const wrap = this.battleEl.querySelector<HTMLElement>('#hpbars');
    if (!wrap) return;
    let html = '';
    for (const b of bars) html += `<i class="hpb ${b.team ? 'foe' : 'ally'} ${b.hero ? 'hero' : ''}" style="transform:translate(${b.x.toFixed(0)}px,${b.y.toFixed(0)}px) translate(-50%,-100%)"><i style="width:${(b.frac * 100).toFixed(0)}%"></i></i>`;
    wrap.innerHTML = html;
    for (const c of cds) {
      const el = this.battleEl.querySelector<HTMLElement>(`[data-skill-unit="${c.unit}"]`);
      if (!el) continue;
      el.classList.toggle('ready', c.frac <= 0 && c.alive);
      el.classList.toggle('dead', !c.alive);
      el.querySelector<HTMLElement>('.cd')!.style.height = `${Math.max(0, c.frac) * 100}%`;
    }
    const sp = this.battleEl.querySelector('.speed');
    if (sp && sp.textContent !== `x${speed}`) sp.textContent = `x${speed}`;
  }

  battleEnd(): void {
    this.root.classList.remove('in-battle');
    this.battleEl.classList.add('hidden');
    this.battleEl.innerHTML = '';
  }

  setHidden(h: boolean): void {
    this.hidden = h;
    this.root.classList.toggle('ui-hidden', h);
  }
}
