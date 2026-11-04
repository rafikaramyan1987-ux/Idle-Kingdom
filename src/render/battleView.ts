import * as THREE from 'three';
import type { Battle, BattleEvent, Unit } from '../game/battle';
import type { Character, CharacterLibrary } from './characters';
import type { Smoke } from './effects';

interface UnitView { unit: Unit; ch: Character | null; pos: THREE.Vector3; lastState: Unit['state']; dead: boolean }
interface Projectile { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number }

export interface BattleCallbacks {
  damage(world: THREE.Vector3, dmg: number, crit: boolean, team: 0 | 1): void;
  shake(strength: number): void;
  skill(world: THREE.Vector3, skill: string): void;
}

const arrowGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.45, 4).rotateX(Math.PI / 2);
const orbGeo = new THREE.IcosahedronGeometry(0.11, 1);
const MATS = {
  arrow: new THREE.MeshBasicMaterial({ color: 0x8a5a2b }),
  fire: new THREE.MeshBasicMaterial({ color: 0xff9a3c }),
  magic: new THREE.MeshBasicMaterial({ color: 0xb07cff }),
  bone: new THREE.MeshBasicMaterial({ color: 0x8dff8a }),
};
const ringGeo = new THREE.RingGeometry(0.2, 0.32, 24).rotateX(-Math.PI / 2);

/** Plays a {@link Battle} in the 3D world. Coordinates: battle x runs from the kingdom towards the enemy. */
export class BattleView {
  readonly group = new THREE.Group();
  private views = new Map<number, UnitView>();
  private projectiles: Projectile[] = [];
  private rings: { mesh: THREE.Mesh; t: number }[] = [];
  private eventIndex = 0;
  private dir: THREE.Vector3;
  private perp: THREE.Vector3;
  ended = false;

  constructor(
    readonly battle: Battle,
    chars: CharacterLibrary,
    private origin: THREE.Vector3,
    direction: THREE.Vector3,
    private smoke: Smoke,
    private cb: BattleCallbacks,
    towerPositions: THREE.Vector3[] = [],
  ) {
    this.dir = direction.clone().setY(0).normalize();
    this.perp = new THREE.Vector3(-this.dir.z, 0, this.dir.x);
    let towerIdx = 0;
    for (const u of battle.units) {
      const pos = this.toWorld(u.x, u.z);
      let ch: Character | null = null;
      if (u.kind === 'tower') {
        const tp = towerPositions[towerIdx++ % Math.max(1, towerPositions.length)];
        if (tp) pos.copy(tp).setY(1.1);
      } else {
        ch = chars.spawn(u.model);
        if (ch) {
          const scale = u.hero ? 0.62 : u.team === 0 ? 0.48 : 0.55;
          ch.root.scale.setScalar(scale);
          ch.root.position.copy(pos);
          ch.root.rotation.y = Math.atan2(this.dir.x * (u.team === 0 ? 1 : -1), this.dir.z * (u.team === 0 ? 1 : -1));
          this.group.add(ch.root);
          if (u.team === 1) ch.play('idle');
        }
      }
      this.views.set(u.id, { unit: u, ch, pos, lastState: 'idle', dead: false });
    }
  }

  toWorld(x: number, z: number): THREE.Vector3 {
    return this.origin.clone().addScaledVector(this.dir, x * 0.72).addScaledVector(this.perp, z * 0.72);
  }

  headOf(id: number): THREE.Vector3 | null {
    const v = this.views.get(id);
    if (!v) return null;
    return v.pos.clone().setY(v.unit.kind === 'tower' ? 1.6 : v.unit.hero ? 1.35 : 1.15);
  }

  /** For HP bars in the HUD. */
  bars(): { id: number; pos: THREE.Vector3; frac: number; team: 0 | 1; hero: boolean }[] {
    const out: { id: number; pos: THREE.Vector3; frac: number; team: 0 | 1; hero: boolean }[] = [];
    for (const v of this.views.values()) {
      if (v.unit.kind === 'tower' || !v.unit.alive) continue;
      out.push({ id: v.unit.id, pos: this.headOf(v.unit.id)!, frac: v.unit.hp / v.unit.maxHp, team: v.unit.team, hero: !!v.unit.hero });
    }
    return out;
  }

  center(): THREE.Vector3 {
    return this.origin.clone();
  }

  private attackAnim(u: Unit): 'attack' | 'attack2' | 'shoot' | 'cast' {
    if (u.kind === 'ranger' || u.kind === 'archer') return 'shoot';
    if (u.kind === 'mage' || u.kind === 'smage') return 'cast';
    if (u.kind === 'barbarian' || u.kind === 'warrior') return 'attack2';
    return 'attack';
  }

  private onEvent(e: BattleEvent): void {
    if (e.t === 'hit') {
      const from = this.views.get(e.from), to = this.views.get(e.to);
      if (!from || !to) return;
      const head = this.headOf(to.unit.id)!;
      if (e.ranged) {
        const kind = from.unit.kind === 'mage' ? 'fire' : from.unit.kind === 'smage' ? 'bone' : from.unit.kind === 'tower' || from.unit.kind === 'ranger' || from.unit.kind === 'archer' ? 'arrow' : 'magic';
        const mesh = new THREE.Mesh(kind === 'arrow' ? arrowGeo : orbGeo, MATS[kind]);
        const start = this.headOf(from.unit.id)!;
        mesh.position.copy(start);
        this.group.add(mesh);
        this.projectiles.push({ mesh, from: start, to: head.clone().setY(head.y - 0.25), t: 0, dur: 0.22 });
      }
      this.cb.damage(head, e.dmg, e.crit, to.unit.team);
      if (e.crit) this.cb.shake(0.12);
    } else if (e.t === 'death') {
      const v = this.views.get(e.unit);
      if (v?.ch) { v.ch.play('death', 0.08); v.dead = true; }
      if (v) this.smoke.burst(v.pos.clone().setY(0.1), 6);
    } else if (e.t === 'skill') {
      const v = this.views.get(e.unit);
      const at = this.toWorld(e.x, e.z);
      if (v?.ch) v.ch.play(e.skill === 'whirlwind' ? 'spin' : e.skill === 'shieldwall' ? 'block' : e.skill === 'volley' ? 'shoot' : 'cast', 0.08);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: e.skill === 'fireball' ? 0xff8a3c : e.skill === 'shieldwall' ? 0x7fb2ff : 0xffe36b, transparent: true, depthWrite: false }));
      ring.position.copy(at).setY(0.06);
      this.group.add(ring);
      this.rings.push({ mesh: ring, t: 0 });
      if (e.skill === 'fireball' || e.skill === 'whirlwind') { this.smoke.burst(at.clone().setY(0.2), 10); this.cb.shake(0.2); }
      this.cb.skill(at, e.skill);
    } else if (e.t === 'end') {
      this.ended = true;
      for (const v of this.views.values()) if (v.unit.alive && v.unit.team === e.winner && v.ch) v.ch.play('cheer', 0.2);
    }
  }

  update(dt: number): void {
    const evs = this.battle.events;
    while (this.eventIndex < evs.length) this.onEvent(evs[this.eventIndex++]);
    for (const v of this.views.values()) {
      const u = v.unit;
      if (u.kind === 'tower') continue;
      const target = this.toWorld(u.x, u.z);
      const prev = v.pos.clone();
      v.pos.lerp(target, Math.min(1, dt * 10));
      if (!v.ch) continue;
      v.ch.root.position.copy(v.pos);
      const mv = v.pos.clone().sub(prev);
      if (mv.lengthSq() > 1e-6 && !v.dead) v.ch.root.rotation.y = Math.atan2(mv.x, mv.z);
      if (!v.dead && !this.ended && u.state !== v.lastState) {
        if (u.state === 'move') v.ch.play('run');
        else if (u.state === 'attack') v.ch.play(this.attackAnim(u), 0.08);
        else if (u.state === 'hit' && !v.ch.busy) v.ch.play('hit', 0.06);
        else if (u.state === 'idle' && !v.ch.busy) v.ch.play('idle');
        v.lastState = u.state;
      } else if (!v.dead && !this.ended && u.state === 'idle' && !v.ch.busy && v.ch.current_name !== 'idle') v.ch.play('idle');
      // Face the nearest enemy while fighting.
      if (!v.dead && u.state !== 'move') {
        let best: UnitView | null = null, bd = Infinity;
        for (const o of this.views.values()) {
          if (o.unit.team === u.team || !o.unit.alive || o.unit.kind === 'tower') continue;
          const d = o.pos.distanceToSquared(v.pos);
          if (d < bd) { bd = d; best = o; }
        }
        if (best) {
          const want = Math.atan2(best.pos.x - v.pos.x, best.pos.z - v.pos.z);
          let diff = want - v.ch.root.rotation.y;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          v.ch.root.rotation.y += diff * Math.min(1, dt * 10);
        }
      }
      v.ch.update(dt);
    }
    this.projectiles = this.projectiles.filter((p) => {
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.mesh.position.lerpVectors(p.from, p.to, k);
      p.mesh.position.y += Math.sin(k * Math.PI) * 0.3;
      p.mesh.lookAt(p.to);
      if (k >= 1) { this.group.remove(p.mesh); return false; }
      return true;
    });
    this.rings = this.rings.filter((r) => {
      r.t += dt;
      r.mesh.scale.setScalar(1 + r.t * 7);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - r.t * 1.8);
      if (r.t > 0.6) { this.group.remove(r.mesh); (r.mesh.material as THREE.Material).dispose(); return false; }
      return true;
    });
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
  }
}
