// Animated KayKit characters (CC0 Adventurers + Skeletons). All share one rig, so one animation file drives all.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export const CHARACTER_MODELS = ['knight', 'rogue_hooded', 'mage', 'rogue', 'barbarian', 'skeleton_minion', 'skeleton_warrior', 'skeleton_rogue', 'skeleton_mage'] as const;
export type CharacterModel = (typeof CHARACTER_MODELS)[number];

/** Which hand props stay visible (the source files carry every weapon variant). */
const KEEP: Record<string, RegExp> = {
  knight: /^(1H_Sword|Round_Shield)$/,
  rogue_hooded: /^2H_Crossbow$/,
  mage: /^(2H_Staff|Spellbook)$/,
  rogue: /^(Knife|Knife_Offhand)$/,
  barbarian: /^(2H_Axe)$/,
};
const SKELETON_WEAPON: Record<string, string> = {
  skeleton_minion: 'Skeleton_Blade', skeleton_warrior: 'Skeleton_Axe', skeleton_rogue: 'Skeleton_Blade', skeleton_mage: 'Skeleton_Staff',
};

export type Anim = 'idle' | 'walk' | 'run' | 'attack' | 'attack2' | 'shoot' | 'cast' | 'spin' | 'hit' | 'death' | 'cheer' | 'block';
const CLIPS: Record<Anim, string> = {
  idle: 'Idle', walk: 'Walking_A', run: 'Running_A', attack: '1H_Melee_Attack_Chop', attack2: '2H_Melee_Attack_Chop',
  shoot: '2H_Ranged_Shoot', cast: 'Spellcast_Shoot', spin: '2H_Melee_Attack_Spin', hit: 'Hit_A', death: 'Death_A', cheer: 'Cheer', block: 'Block',
};
const ONCE = new Set<Anim>(['attack', 'attack2', 'shoot', 'cast', 'spin', 'hit', 'death', 'cheer', 'block']);

export class Character {
  readonly root: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<Anim, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  current_name: Anim | null = null;

  constructor(template: THREE.Object3D, clips: THREE.AnimationClip[], readonly model: string) {
    this.root = SkeletonUtils.clone(template);
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const [k, name] of Object.entries(CLIPS) as [Anim, string][]) {
      const clip = clips.find((c) => c.name === name);
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      if (ONCE.has(k)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions.set(k, a);
    }
    this.play('idle');
  }

  play(anim: Anim, fade = 0.15): void {
    if (this.current_name === anim && !ONCE.has(anim)) return;
    const a = this.actions.get(anim) ?? this.actions.get('idle');
    if (!a) return;
    a.reset();
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, fade, false);
    a.play();
    this.current = a;
    this.current_name = anim;
  }

  get busy(): boolean {
    return !!this.current && this.current.loop === THREE.LoopOnce && this.current.isRunning();
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }
}

export class CharacterLibrary {
  private templates = new Map<string, THREE.Object3D>();
  private clips: THREE.AnimationClip[] = [];
  private weapons = new Map<string, THREE.Object3D>();
  ready = false;

  async load(base: string, material: (m: THREE.MeshStandardMaterial) => THREE.Material): Promise<void> {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const [anims, weapons, ...chars] = await Promise.all([
      loader.loadAsync(`${base}anims.glb`),
      loader.loadAsync(`${base}weapons.glb`),
      ...CHARACTER_MODELS.map((m) => loader.loadAsync(`${base}${m}.glb`)),
    ]);
    this.clips = anims.animations;
    for (const w of weapons.scene.children) this.weapons.set(w.name, w);
    CHARACTER_MODELS.forEach((name, i) => {
      const root = chars[i].scene;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.material = material(m.material as THREE.MeshStandardMaterial);
          m.castShadow = true;
          m.receiveShadow = false;
          m.frustumCulled = false;
        }
      });
      const keep = KEEP[name];
      if (keep) {
        for (const slot of ['handslot.l', 'handslot.r']) {
          const s = root.getObjectByName(slot);
          s?.children.forEach((c) => { c.visible = keep.test(c.name); });
        }
      }
      const weapon = SKELETON_WEAPON[name];
      if (weapon && this.weapons.has(weapon)) {
        const hand = root.getObjectByName('handslot.r');
        const w = this.weapons.get(weapon)!.clone(true);
        w.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = material(m.material as THREE.MeshStandardMaterial); m.castShadow = true; } });
        hand?.add(w);
      }
      this.templates.set(name, root);
    });
    this.ready = true;
  }

  spawn(model: string): Character | null {
    const t = this.templates.get(model);
    if (!t) return null;
    return new Character(t, this.clips, model);
  }

  get clipNames(): string[] {
    return this.clips.map((c) => c.name);
  }
}
