// A REALISTIC first-session player: taps at human speed, waits for real timers, follows only the
// objective card and what is visible on screen (speech bubbles, chests, order ✓). It cannot use anything locked
// because it goes through the same rules as the UI. Used by the pacing test and to build cover scenes.
import { BUILDINGS, RECIPES, type BType, type ItemId } from './defs';
import { Battle } from './battle';
import { buildMap } from './map';
import * as G from './state';

export interface TimelineEntry { t: number; text: string }

/** Seconds a human needs for each kind of interaction (look, tap, read the panel, tap again). */
const COST = { bubble: 1.0, panel: 2.2, build: 3.5, deliver: 2.5, chest: 1.5, battlePrep: 3, result: 3, recruit: 3 };

export class Bot {
  timeline: TimelineEntry[] = [];
  battles = 0;
  maxIdle = 0;
  idleRun = 0;
  lockedGoalSeen = 0;
  private busyUntil = 0;
  private seen = new Set<string>(['wheat', 'wood']);
  private t = 0;

  constructor(public s: G.GameState, private t0: number) {}

  private log(text: string): void {
    this.timeline.push({ t: this.t, text });
  }

  private get now(): number {
    return this.t0 + this.t * 1000;
  }

  private busy(sec: number): void {
    this.busyUntil = this.t + sec;
  }

  run(seconds: number, dt = 0.5): void {
    for (this.t = dt; this.t <= seconds + 1e-6; this.t += dt) this.step(dt);
  }

  step(dt: number): void {
    const s = this.s;
    const now = this.now;
    G.tick(s, now, dt);
    for (const e of G.drainEvents()) this.onEvent(e);
    // Once per second: is there anything useful at all? Is the objective ever locked?
    if (Math.floor(this.t) !== Math.floor(this.t - dt)) {
      if (G.usefulActions(s, now).length) this.idleRun = 0;
      else { this.idleRun++; this.maxIdle = Math.max(this.maxIdle, this.idleRun); }
      const g = G.currentGoal(s);
      if (g.kind === 'goal' && g.goal.level > s.level) this.lockedGoalSeen++;
    }
    if (this.t < this.busyUntil) return;
    this.act(now);
  }

  /** One human action, chosen like a player would. */
  private act(now: number): void {
    const s = this.s;
    // 1. Ready goods in a bubble: tap it.
    const ready = s.buildings.find((b) => b.ready.length && b.buildEnd === 0);
    if (ready && G.barnFree(s) > 0) {
      const got = G.collect(s, ready.id);
      for (const k of Object.keys(got)) if (!this.seen.has(k)) { this.seen.add(k); this.log(`First ${k} collected`); }
      return this.busy(COST.bubble);
    }
    // 2. Chests and visitors are shiny: tap them.
    if (s.chests.length) { const c = s.chests[0]; G.openChest(s, c.id); this.log(c.big ? 'Treasure chest opened' : 'Chest opened'); return this.busy(COST.chest); }
    if (s.visitor && G.recruitVisitor(s, now).ok) return this.busy(COST.recruit);
    // 3. Order with ✓ on the board.
    const o = s.orders.find((x) => G.canDeliver(s, x, now));
    if (o) { G.deliver(s, o.id, now); this.log(`Order delivered (+${o.gold} gold, +${o.xp} XP)`); return this.busy(COST.deliver); }
    const crate = s.cart?.crates.findIndex((c) => !c.done && G.count(s, c.item) >= c.qty) ?? -1;
    if (crate >= 0 && G.fillCrate(s, crate)) { this.log('Cart crate filled'); return this.busy(COST.deliver); }
    if (!s.daily.claimed && G.dailyPercent(s) >= 100 && G.claimDaily(s).ok) { this.log('Daily tasks chest'); return this.busy(COST.panel); }
    // Barn almost full: the toast says "sell or upgrade" — do that.
    if (G.barnFree(s) <= 2) {
      if (G.upgradeBarn(s).ok) { this.log('Barn upgraded'); return this.busy(COST.panel); }
      const top = (Object.keys(s.items) as ItemId[]).filter((i) => !['hammer', 'nails', 'paint'].includes(i)).sort((a, b) => G.count(s, b) - G.count(s, a))[0];
      if (top && G.sell(s, top, Math.ceil(G.count(s, top) / 2))) { this.log(`Sold surplus ${top}`); return this.busy(COST.panel); }
    }
    // A golden ⚔️ bubble on the map means the squad is strong enough.
    const nr = G.nextRegion(s);
    if (nr !== null && G.canAttack(s, nr, now).ok && G.squadPower(s, now) >= G.campPower(nr) && this.fight(nr, now)) return;
    // 4. Follow the objective card.
    if (this.doGoal(now)) return;
    // 5. Obvious upkeep: replant empty fields, feed animals, keep the bakery going for orders.
    if (this.plantAny(now)) return this.busy(COST.panel);
    for (const b of s.buildings) if (BUILDINGS[b.type].kind === 'animal' && b.buildEnd === 0 && G.feedAll(s, b.id, now) > 0) return this.busy(COST.panel);
    if (this.makeForOrders(now)) return this.busy(COST.panel);
  }

  private building(type: BType): G.Building | undefined {
    return this.s.buildings.find((b) => b.type === type && b.buildEnd === 0);
  }

  private tryBuild(type: BType, now: number): boolean {
    const s = this.s;
    const c = G.canBuild(s, type);
    if (!c.ok) {
      // Read the cost on the card and go make the missing material (e.g. wood at the lumber mill).
      if (c.reason === 'items') {
        const { gold: _g, ...items } = G.buildCost(s, type);
        void _g;
        for (const [i, n] of Object.entries(items) as [ItemId, number][]) if (G.count(s, i) < n && this.produce(i, now)) { this.busy(COST.panel); return true; }
      }
      return false;
    }
    const plot = buildMap().plots.find((p) => s.regions.includes(p.region) && !G.buildingOnPlot(s, p.id));
    if (!plot || !G.build(s, type, plot.id, now).ok) return false;
    this.log(`Built ${type}`);
    this.busy(COST.build);
    return true;
  }

  private queue(type: BType, recipeId: string, now: number): boolean {
    const b = this.building(type);
    if (!b || !G.start(this.s, b.id, recipeId, now).ok) return false;
    this.busy(COST.panel);
    return true;
  }

  private plantAny(now: number, crop?: string): boolean {
    const s = this.s;
    const field = s.buildings.find((b) => b.type === 'field' && b.buildEnd === 0 && !b.jobs.length && !b.ready.length);
    if (!field) return false;
    const want = crop ?? this.cropForOrders();
    return G.start(s, field.id, want, now).ok || G.start(s, field.id, 'wheat', now).ok;
  }

  private cropForOrders(): string {
    const s = this.s;
    for (const o of s.orders) for (const [i, q] of o.lines) if (['corn', 'carrot', 'cotton'].includes(i) && G.count(s, i) < q && G.isUnlocked(s, i)) return i;
    return 'wheat';
  }

  /** Produce the first missing thing of the first order (one step of the chain), like a player reading the order. */
  private makeForOrders(now: number): boolean {
    const s = this.s;
    for (const o of s.orders) {
      if (o.readyAt > now) continue;
      for (const [item, q] of o.lines) {
        if (G.count(s, item) >= q) continue;
        if (this.produce(item, now)) return true;
      }
    }
    return false;
  }

  private produce(item: ItemId, now: number, depth = 0): boolean {
    const s = this.s;
    const r = RECIPES.find((x) => x.out === item && x.level <= s.level);
    if (!r || depth > 2) return false;
    const b = this.building(r.building);
    if (!b) return false;
    if (r.building === 'field') return this.plantAny(now, r.id);
    if (G.canStart(s, b, r).ok) { G.start(s, b.id, r.id, now); return true; }
    for (const [inp, n] of Object.entries(r.inputs) as [ItemId, number][]) if (G.count(s, inp) < n && this.produce(inp, now, depth + 1)) return true;
    return false;
  }

  private doGoal(now: number): boolean {
    const s = this.s;
    const view = G.currentGoal(s);
    if (view.kind !== 'goal') return false; // level-up hint: just play orders (handled by upkeep)
    switch (view.goal.id) {
      case 'plant': return this.plantAny(now, 'wheat') && (this.busy(COST.panel), true);
      case 'flour': return this.queue('bakery', 'flour', now);
      case 'bread': return this.queue('bakery', G.count(s, 'flour') ? 'bread' : 'flour', now);
      case 'field': return this.tryBuild('field', now);
      case 'coop': case 'mine': case 'kitchen': case 'forge': case 'barracks': return this.tryBuild(view.goal.id as BType, now);
      case 'egg': { const c = this.building('coop'); return !!c && G.feedAll(s, c.id, now) > 0 && (this.busy(COST.panel), true); }
      case 'pie': return this.produce('pie', now) && (this.busy(COST.panel), true);
      case 'corn': return this.plantAny(now, 'corn') && (this.busy(COST.panel), true);
      case 'sword': return this.produce('sword', now) && (this.busy(COST.panel), true);
      case 'soldier': return this.produce('bread', now) || this.queue('barracks', 'soldier', now);
      case 'camp': case 'camp2': {
        const nr = G.nextRegion(s);
        return nr !== null && this.fight(nr, now);
      }
      default: return false;
    }
  }

  private fight(nr: number, now: number): boolean {
    const s = this.s;
    if (!G.canAttack(s, nr, now).ok) return false;
    const battle = new Battle(G.campSetup(s, nr, now));
    battle.resolve();
    const r = G.finishCamp(s, nr, battle, now);
    this.battles++;
    this.log(r ? `Battle won: camp ${nr} (${Math.round(battle.time)}s fight, +${r.gold} gold, +${r.gems} gems)` : `Battle lost at camp ${nr} (heroes rest, try again)`);
    this.busy(COST.battlePrep + battle.time + COST.result);
    return true;
  }

  private onEvent(e: G.GameEvent): void {
    const s = this.s;
    switch (e.type) {
      case 'levelUp': this.log(`LEVEL UP → ${e.level}`); break;
      case 'built': if (e.btype !== 'field') this.log(`${e.btype} finished building`); break;
      case 'raidWarn': this.log('Raid warning: skeletons approaching'); break;
      case 'raid': {
        const battle = new Battle(G.raidSetup(s, this.now));
        battle.resolve();
        const r = G.finishRaid(s, battle, this.now);
        this.log(r.win ? `Raid defended (+${r.gold} gold, ${Math.round(battle.time)}s)` : 'Raid lost (a few goods stolen)');
        this.busy(battle.time + COST.result); // watching the raid
        break;
      }
      case 'chest': this.log('Chest appeared on the map'); break;
      case 'visitor': this.log(`Wandering hero arrives: ${e.hero}`); break;
      case 'heroJoin': this.log(`Hero joined: ${e.hero}`); break;
      case 'cartArrive': this.log('Trade cart arrived'); break;
      case 'cartLeave': this.log(`Trade cart left (${e.complete ? 'all crates filled' : 'partly filled'})`); break;
      case 'region': this.log(`New land discovered: region ${e.region}`); break;
      case 'goal': this.log(`Goal done: ${G.GOALS[e.index].id}`); break;
      case 'task': this.log(`Daily task done: ${e.kind}`); break;
      case 'campSpotted': this.log('Skeleton camp spotted on the frontier!'); break;
      case 'gift': this.log(`Villager gift (+${e.gold} gold${e.item ? `, ${e.qty} ${e.item}` : ''})`); break;
      case 'market': if (G.buildingOf(s, 'market')) this.log('Merchant brought new offers'); break;
      default: break;
    }
  }
}

export function fmtTime(t: number): string {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}
