// A sensible "first session" player used by the pacing test and to generate cover scenes.
import { BUILDINGS, ITEMS, RECIPES, type BType, type HeroId, type ItemId } from './defs';
import { buildMap } from './map';
import * as G from './state';

export interface TimelineEntry { t: number; text: string }

const BUILD_ORDER: BType[] = ['coop', 'field', 'mine', 'forge', 'kitchen', 'field', 'barracks', 'pasture', 'market', 'field', 'dairy', 'field', 'sheep', 'weaver', 'field'];

export class Bot {
  timeline: TimelineEntry[] = [];
  battles = 0;
  private seen = new Set<string>(['wheat', 'wood']);
  constructor(public s: G.GameState, private t0: number) {}

  private log(t: number, text: string): void {
    this.timeline.push({ t, text });
  }

  private now(t: number): number {
    return this.t0 + t * 1000;
  }

  /** Items the bot wants right now (orders, cart, army). */
  private wants(now: number): Map<ItemId, number> {
    const w = new Map<ItemId, number>();
    const add = (i: ItemId, q: number): void => { w.set(i, (w.get(i) ?? 0) + q); };
    for (const o of this.s.orders) if (o.readyAt <= now) for (const [i, q] of o.lines) add(i, q * 2);
    for (const c of this.s.cart?.crates ?? []) if (!c.done) add(c.item, c.qty);
    if (G.buildingOf(this.s, 'barracks')) { add('sword', 1); add('bread', 2); }
    if (G.buildingOf(this.s, 'kitchen')) add('pie', 1);
    // Plan two steps of the production chain: missing products pull in their ingredients.
    for (let depth = 0; depth < 2; depth++) {
      for (const [item, q] of [...w]) {
        const deficit = q - G.count(this.s, item);
        if (deficit <= 0) continue;
        const r = RECIPES.find((x) => x.out === item && x.level <= this.s.level);
        if (!r) continue;
        for (const [inp, n] of Object.entries(r.inputs) as [ItemId, number][]) add(inp, n * Math.ceil(deficit / r.qty) * 0.5);
      }
    }
    return w;
  }

  step(t: number, dt: number): void {
    const s = this.s;
    const now = this.now(t);
    G.tick(s, now, dt);
    for (const e of G.drainEvents()) this.onEvent(t, e, now);
    // Collect everything that is ready.
    for (const b of s.buildings) {
      if (!b.ready.length) continue;
      const got = G.collect(s, b.id);
      for (const k of Object.keys(got)) if (!this.seen.has(k)) { this.seen.add(k); if (k !== 'wheat') this.log(t, `First ${k} made`); }
    }
    // Deliver orders and crates.
    for (const o of [...s.orders]) if (G.deliver(s, o.id, now)) this.log(t, `Order delivered (+${o.gold} gold)`);
    s.cart?.crates.forEach((_, i) => { if (G.fillCrate(s, i)) this.log(t, 'Cart crate filled'); });
    for (const o of s.orders) if (o.readyAt <= now && now - o.readyAt > 240_000 && !G.canDeliver(s, o, now)) G.discardOrder(s, o.id, now);
    // Chests & visitors.
    for (const c of [...s.chests]) { G.openChest(s, c.id); this.log(t, c.big ? 'Treasure chest opened' : 'Chest opened'); }
    if (s.visitor && G.recruitVisitor(s, now).ok) { /* logged by event */ }
    if (G.dailyPercent(s) >= 100 && G.claimDaily(s).ok) this.log(t, 'Daily tasks chest');
    // Production.
    const want = this.wants(now);
    for (const b of s.buildings) {
      if (b.buildEnd > 0) continue;
      const kind = BUILDINGS[b.type].kind;
      if (kind === 'field' && !b.jobs.length && !b.ready.length) {
        const crops = RECIPES.filter((r) => r.building === 'field' && r.level <= s.level);
        const pick = crops.sort((a, c) => this.need(want, a.out as ItemId) - this.need(want, c.out as ItemId) || a.time - c.time)[0];
        if (G.start(s, b.id, pick.id, now).ok && G.stat(s, 'plants') === 0) this.log(t, `Planted ${pick.id}`);
        s.stats.plants = G.stat(s, 'plants') + 1;
      } else if (kind === 'animal') {
        G.feedAll(s, b.id, now);
      } else if (kind === 'factory') {
        for (let k = 0; k < 2; k++) {
          const rs = RECIPES.filter((r) => r.building === b.type && r.level <= s.level && G.canStart(s, b, r).ok);
          if (!rs.length) break;
          rs.sort((a, c) => this.need(want, a.out as ItemId) - this.need(want, c.out as ItemId));
          const r = rs[0];
          if (r.out !== 'soldier' && r.out !== 'archer' && G.count(s, r.out as ItemId) >= 6 && !want.has(r.out as ItemId)) break;
          G.start(s, b.id, r.id, now);
        }
      }
    }
    // Build.
    for (const type of BUILD_ORDER) {
      if (G.owned(s, type) >= (type === 'field' ? BUILDINGS.field.max(s.level) : 1)) continue;
      if (!G.canBuild(s, type).ok) continue;
      const plot = buildMap().plots.find((p) => s.regions.includes(p.region) && !G.buildingOnPlot(s, p.id));
      if (plot && G.build(s, type, plot.id, now).ok) { this.log(t, `Built ${type}`); break; }
    }
    // Heroes: heal, equip, train.
    for (const id of Object.keys(s.heroes) as HeroId[]) {
      const h = s.heroes[id]!;
      if (G.heroHp(h, now) < 0.5 && G.count(s, 'pie') > 0) G.feedHero(s, id, 'pie', now);
      if (!h.weapon && G.equip(s, id, 'weapon').ok) this.log(t, `Equipped ${id}`);
      if (G.trainHero(s, id).ok) this.log(t, `Trained ${id} to level ${h.level}`);
    }
    if (s.items.hammer && G.upgradeBarn(s).ok) this.log(t, 'Barn upgraded');
    G.upgradeWalls(s);
    // Attack the next camp when strong enough.
    const nr = G.nextRegion(s);
    if (nr !== null && G.canAttack(s, nr, now).ok && G.squadPower(s, now) >= G.campPower(nr) * 0.95) {
      const battle = new G.Battle(G.campSetup(s, nr, now));
      const win = battle.resolve() === 0;
      this.battles++;
      const r = G.finishCamp(s, nr, battle, now);
      this.log(t, win ? `Battle won: camp ${nr} (${Math.round(battle.time)}s fight, +${r?.gold} gold, +${r?.gems} gems)` : `Battle lost at camp ${nr}`);
    }
    // Sell surplus when the barn is nearly full.
    if (G.barnFree(s) < 6) {
      const top = (Object.keys(s.items) as ItemId[]).filter((i) => ITEMS[i].cat !== 'tools').sort((a, b) => G.count(s, b) - G.count(s, a))[0];
      if (top) G.sell(s, top, Math.ceil(G.count(s, top) / 2));
    }
  }

  private need(want: Map<ItemId, number>, item: ItemId): number {
    return G.count(this.s, item) - (want.get(item) ?? 0) * 2;
  }

  private onEvent(t: number, e: G.GameEvent, now: number): void {
    const s = this.s;
    switch (e.type) {
      case 'levelUp': this.log(t, `Level up → ${e.level}`); break;
      case 'built': if (e.btype !== 'field') this.log(t, `${e.btype} finished`); break;
      case 'raidWarn': this.log(t, 'Raid warning: skeletons approaching'); break;
      case 'raid': {
        const battle = new G.Battle(G.raidSetup(s, now));
        battle.resolve();
        const r = G.finishRaid(s, battle, now);
        this.log(t, r.win ? `Raid defended (+${r.gold} gold)` : 'Raid lost (a few goods stolen)');
        break;
      }
      case 'chest': this.log(t, 'Chest dropped on the map'); break;
      case 'visitor': this.log(t, `Wandering hero arrives: ${e.hero}`); break;
      case 'heroJoin': this.log(t, `Hero joined: ${e.hero}`); break;
      case 'cartArrive': this.log(t, 'Cart arrived with a big order'); break;
      case 'cartLeave': this.log(t, `Cart left (${e.complete ? 'all crates filled' : 'partly filled'})`); break;
      case 'region': this.log(t, `New land discovered: region ${e.region}`); break;
      case 'goal': this.log(t, `Goal done: ${G.GOALS[e.index].id}`); break;
      case 'barnFull': break;
      case 'order': break;
      case 'ready': {
        const b = s.buildings.find((x) => x.id === e.id);
        void b;
        break;
      }
      case 'market': this.log(t, 'Merchant brought new offers'); break;
      case 'task': this.log(t, `Daily task done: ${e.kind}`); break;
      case 'gift': this.log(t, `A villager brings a gift (+${e.gold} gold${e.item ? `, ${e.qty} ${e.item}` : ''})`); break;
    }
  }

  run(seconds: number, dt = 1): void {
    for (let t = dt; t <= seconds; t += dt) this.step(t, dt);
  }
}

export function fmtTime(t: number): string {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}
