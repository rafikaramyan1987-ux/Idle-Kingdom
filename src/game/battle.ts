// Deterministic auto-battle simulation. The renderer plays it in real time; tests resolve it instantly.
import { ENEMIES, TROOPS, heroDef, type EnemyKind, type HeroId, type SkillId, type UnitStats } from './defs';
import { Rng } from './rng';

export type Team = 0 | 1; // 0 = player, 1 = skeletons

export interface Unit {
  id: number;
  team: Team;
  kind: string; // hero id, troop type, enemy kind or 'tower'
  model: string;
  hero?: HeroId;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  atk: number;
  range: number;
  interval: number;
  speed: number;
  timer: number;
  skill?: SkillId;
  cd: number;
  cdMax: number;
  readyT?: number;
  static?: boolean;
  shieldUntil: number;
  alive: boolean;
  /** Animation hint for the renderer. */
  state: 'idle' | 'move' | 'attack' | 'hit' | 'dead' | 'cast';
  stateT: number;
}

export type BattleEvent =
  | { t: 'hit'; from: number; to: number; dmg: number; crit: boolean; ranged: boolean; time: number }
  | { t: 'skill'; unit: number; skill: SkillId; x: number; z: number; time: number }
  | { t: 'death'; unit: number; time: number }
  | { t: 'end'; winner: Team; time: number };

export interface SquadHero { id: HeroId; level: number; stars: number; hp: number; power: number; buff: number; weaponBonus: number; shieldBonus: number }

export interface BattleSetup {
  heroes: SquadHero[];
  troops: { soldier: number; archer: number };
  enemies: EnemyKind[];
  enemyScale: number;
  towers: number;
  towerAtk: number;
  seed: number;
  /** Raids: skeletons attack the walls; camps: heroes attack. */
  mode: 'camp' | 'raid';
}

export const BATTLE_LIMIT = 70;

export class Battle {
  units: Unit[] = [];
  time = 0;
  over = false;
  winner: Team | null = null;
  events: BattleEvent[] = [];
  /** Skill casts requested by the player (hero unit ids). */
  private requests = new Set<number>();
  private rng: Rng;
  private nextId = 1;

  constructor(readonly setup: BattleSetup) {
    this.rng = new Rng(setup.seed);
    const front = setup.mode === 'camp' ? -3.2 : -1.2;
    setup.heroes.forEach((h, i) => {
      const d = heroDef(h.id);
      const k = h.power;
      const hpMax = Math.round(d.hp * k * (1 + h.shieldBonus));
      this.add({
        team: 0, kind: h.id, model: d.model, hero: h.id, x: front - (d.range > 2 ? 1.6 : 0), z: (i - (setup.heroes.length - 1) / 2) * 1.3,
        hp: Math.max(1, Math.round(hpMax * h.hp)), maxHp: hpMax, atk: d.atk * k * (1 + h.buff) + h.weaponBonus, range: d.range, interval: d.interval, speed: d.speed,
        skill: d.skill, cdMax: d.cooldown, cd: d.cooldown * 0.45,
      });
    });
    let row = 0;
    for (const [type, n] of [['soldier', setup.troops.soldier], ['archer', setup.troops.archer]] as const) {
      const st = TROOPS[type];
      for (let i = 0; i < n; i++, row++) {
        this.add({ team: 0, kind: type, model: st.model, x: front - 1 - (type === 'archer' ? 1.4 : 0.6), z: (row - 1.5) * 0.9, hp: st.hp, maxHp: st.hp, atk: st.atk, range: st.range, interval: st.interval, speed: st.speed, cd: 0, cdMax: 0 });
      }
    }
    for (let i = 0; i < setup.towers; i++) {
      this.add({ team: 0, kind: 'tower', model: '', x: front - 0.5, z: (i - (setup.towers - 1) / 2) * 2.4, hp: 1, maxHp: 1, atk: setup.towerAtk, range: 6, interval: 1.5, speed: 0, cd: 0, cdMax: 0, static: true });
    }
    setup.enemies.forEach((e, i) => {
      const st: UnitStats & { model: string } = ENEMIES[e];
      const s = setup.enemyScale;
      const ranged = st.range > 2;
      this.add({ team: 1, kind: e, model: st.model, x: 3.2 + (ranged ? 1.4 : 0) + (i % 2) * 0.5, z: (i - (setup.enemies.length - 1) / 2) * 1.1, hp: Math.round(st.hp * s), maxHp: Math.round(st.hp * s), atk: st.atk * s, range: st.range, interval: st.interval, speed: st.speed, cd: 0, cdMax: 0 });
    });
  }

  private add(u: Omit<Unit, 'id' | 'timer' | 'alive' | 'state' | 'stateT' | 'shieldUntil'> & Partial<Unit>): void {
    this.units.push({ id: this.nextId++, timer: this.rngInterval(u.interval), alive: true, state: 'idle', stateT: 0, shieldUntil: 0, ...u } as Unit);
  }

  private rngInterval(i: number): number {
    return i * (0.3 + (this.rng ? this.rng.next() : 0.5) * 0.5);
  }

  requestSkill(unitId: number): boolean {
    const u = this.units.find((x) => x.id === unitId);
    if (!u || !u.alive || !u.skill || u.cd > 0) return false;
    this.requests.add(unitId);
    return true;
  }

  alive(team: Team): Unit[] {
    return this.units.filter((u) => u.alive && u.team === team && u.kind !== 'tower');
  }

  private nearest(u: Unit): Unit | null {
    let best: Unit | null = null;
    let bd = Infinity;
    for (const o of this.units) {
      if (!o.alive || o.team === u.team || o.kind === 'tower') continue;
      let d = Math.hypot(o.x - u.x, o.z - u.z);
      // Knights with Shield Wall pull enemies towards them.
      if (o.shieldUntil > this.time) d *= 0.35;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  private damage(from: Unit, to: Unit, mult: number, ranged: boolean): void {
    const crit = this.rng.next() < (from.kind === 'rogue' ? 0.25 : 0.1);
    let dmg = from.atk * mult * (0.85 + this.rng.next() * 0.3) * (crit ? 1.8 : 1);
    if (to.shieldUntil > this.time) dmg *= 0.45;
    dmg = Math.max(1, Math.round(dmg));
    to.hp -= dmg;
    this.events.push({ t: 'hit', from: from.id, to: to.id, dmg, crit, ranged, time: this.time });
    if (to.state !== 'dead') { to.state = 'hit'; to.stateT = 0.25; }
    if (to.hp <= 0 && to.alive) {
      to.alive = false;
      to.hp = 0;
      to.state = 'dead';
      this.events.push({ t: 'death', unit: to.id, time: this.time });
    }
  }

  private cast(u: Unit): void {
    const foes = this.units.filter((o) => o.alive && o.team !== u.team && o.kind !== 'tower');
    if (!foes.length || !u.skill) return;
    const target = this.nearest(u) ?? foes[0];
    let x = target.x, z = target.z;
    switch (u.skill) {
      case 'shieldwall':
        u.shieldUntil = this.time + 4;
        for (const a of this.units) if (a.alive && a.team === u.team && Math.hypot(a.x - u.x, a.z - u.z) < 2.5) a.shieldUntil = Math.max(a.shieldUntil, this.time + 2);
        x = u.x; z = u.z;
        break;
      case 'volley':
        for (let i = 0; i < 4; i++) this.damage(u, foes[Math.floor(this.rng.next() * foes.length)], 0.8, true);
        break;
      case 'fireball':
        for (const f of foes) if (Math.hypot(f.x - x, f.z - z) < 1.8) this.damage(u, f, 1.6, true);
        break;
      case 'shadowstrike': {
        const weakest = foes.reduce((a, b) => (b.hp < a.hp ? b : a));
        u.x = weakest.x - 0.7; u.z = weakest.z;
        this.damage(u, weakest, 3, false);
        x = weakest.x; z = weakest.z;
        break;
      }
      case 'whirlwind':
        for (const f of foes) if (Math.hypot(f.x - u.x, f.z - u.z) < 2) this.damage(u, f, 1.3, false);
        x = u.x; z = u.z;
        break;
    }
    u.cd = u.cdMax;
    u.state = 'cast';
    u.stateT = 0.6;
    this.events.push({ t: 'skill', unit: u.id, skill: u.skill, x, z, time: this.time });
  }

  /** Advances the battle by dt seconds (auto-casts skills; the player can cast earlier). */
  step(dt: number): void {
    if (this.over) return;
    this.time += dt;
    for (const u of this.units) {
      if (!u.alive) continue;
      if (u.stateT > 0) u.stateT -= dt;
      if (u.skill) {
        u.cd = Math.max(0, u.cd - dt);
        if (u.cd <= 0) {
          // Player taps cast instantly; otherwise heroes cast on their own after a short moment.
          u.readyT = (u.readyT ?? 0) + dt;
          if (this.requests.has(u.id) || u.readyT > 1.5) {
            this.requests.delete(u.id);
            u.readyT = 0;
            this.cast(u);
            continue;
          }
        }
      }
      const target = this.nearest(u);
      if (!target) continue;
      const dx = target.x - u.x, dz = target.z - u.z;
      const dist = Math.hypot(dx, dz);
      if (dist > u.range) {
        if (u.static) continue;
        const step = Math.min(dist - u.range * 0.9, u.speed * dt);
        u.x += (dx / dist) * step;
        u.z += (dz / dist) * step;
        // Gentle separation so units do not stack.
        for (const o of this.units) {
          if (o === u || !o.alive || o.static) continue;
          const sx = u.x - o.x, sz = u.z - o.z;
          const sd = Math.hypot(sx, sz);
          if (sd > 0 && sd < 0.6) { u.x += (sx / sd) * (0.6 - sd) * 0.5; u.z += (sz / sd) * (0.6 - sd) * 0.5; }
        }
        if (u.stateT <= 0) u.state = 'move';
      } else {
        u.timer -= dt;
        if (u.stateT <= 0) u.state = 'idle';
        if (u.timer <= 0) {
          u.timer = u.interval;
          u.state = 'attack';
          u.stateT = 0.45;
          this.damage(u, target, 1, u.range > 2);
        }
      }
    }
    const a = this.alive(0).length, b = this.alive(1).length;
    if (a === 0 || b === 0 || this.time >= BATTLE_LIMIT) {
      this.over = true;
      if (b === 0) this.winner = 0;
      else if (a === 0) this.winner = 1;
      else {
        const frac = (t: Team) => this.alive(t).reduce((s, u) => s + u.hp / u.maxHp, 0);
        this.winner = this.setup.mode === 'raid' ? (frac(0) >= frac(1) ? 0 : 1) : 1;
      }
      this.events.push({ t: 'end', winner: this.winner, time: this.time });
    }
  }

  /** Runs to completion (tests, background resolution). */
  resolve(): Team {
    while (!this.over) this.step(0.05);
    return this.winner!;
  }

  heroHp(id: HeroId): number {
    const u = this.units.find((x) => x.hero === id);
    return u ? Math.max(0, u.hp / u.maxHp) : 1;
  }

  troopsLeft(): { soldier: number; archer: number } {
    return {
      soldier: this.units.filter((u) => u.kind === 'soldier' && u.alive).length,
      archer: this.units.filter((u) => u.kind === 'archer' && u.alive).length,
    };
  }
}

export function enemyPower(enemies: EnemyKind[], scale: number): number {
  return Math.round(enemies.reduce((s, e) => s + (ENEMIES[e].hp / 10 + (ENEMIES[e].atk / ENEMIES[e].interval) * 2.2) * scale, 0));
}
