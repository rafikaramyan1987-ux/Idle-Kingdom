// Builds public/assets/chars/*.glb from the CC0 KayKit Adventurers + Skeletons character packs.
// Meshes per character (no animations) + one shared animation file (all characters use the same rig).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt, resample, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ADV = process.env.KAYKIT_ADV ?? 'assets-src/kaykit-adventurers';
const SKE = process.env.KAYKIT_SKE ?? 'assets-src/kaykit-skeletons';
const OUT = 'public/assets/chars';
for (const dir of [ADV, SKE]) {
  const lic = fs.readFileSync(path.join(dir, 'LICENSE.txt'), 'utf8');
  if (!/Creative Commons Zero, CC0/.test(lic)) throw new Error(`${dir} is not CC0`);
}
const CHARS = [
  [ADV, 'Knight'], [ADV, 'Rogue_Hooded'], [ADV, 'Mage'], [ADV, 'Rogue'], [ADV, 'Barbarian'],
  [SKE, 'Skeleton_Minion'], [SKE, 'Skeleton_Warrior'], [SKE, 'Skeleton_Rogue'], [SKE, 'Skeleton_Mage'],
];
const KEEP_ANIMS = new Set([
  'Idle', 'Walking_A', 'Running_A', '1H_Melee_Attack_Chop', '1H_Melee_Attack_Stab', '2H_Melee_Attack_Spin', '2H_Melee_Attack_Chop',
  '2H_Ranged_Shoot', 'Spellcast_Shoot', 'Spellcast_Raise', 'Hit_A', 'Death_A', 'Death_A_Pose', 'Cheer', 'Block',
]);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
fs.mkdirSync(OUT, { recursive: true });

function dropAnimation(a) {
  for (const s of a.listSamplers()) s.dispose();
  for (const c of a.listChannels()) c.dispose();
  a.dispose();
}

async function shrinkTextures(doc, size) {
  for (const tex of doc.getRoot().listTextures()) {
    const png = await sharp(Buffer.from(tex.getImage())).resize(size, size, { fit: 'inside' }).png({ compressionLevel: 9 }).toBuffer();
    tex.setImage(new Uint8Array(png)).setMimeType('image/png');
  }
}

let total = 0;
for (const [dir, name] of CHARS) {
  const doc = await io.read(path.join(dir, 'Characters/gltf', `${name}.glb`));
  for (const a of doc.getRoot().listAnimations()) dropAnimation(a);
  await shrinkTextures(doc, 256);
  await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const file = path.join(OUT, `${name.toLowerCase()}.glb`);
  await io.write(file, doc);
  total += fs.statSync(file).size;
}
// Shared animations, taken from the Knight rig (meshes removed).
{
  const doc = await io.read(path.join(ADV, 'Characters/gltf', 'Knight.glb'));
  for (const a of doc.getRoot().listAnimations()) if (!KEEP_ANIMS.has(a.getName())) dropAnimation(a);
  for (const n of doc.getRoot().listNodes()) if (n.getMesh()) { n.setMesh(null); n.setSkin(null); }
  for (const m of doc.getRoot().listMeshes()) m.dispose();
  await doc.transform(resample(), prune({ keepLeaves: true }), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const file = path.join(OUT, 'anims.glb');
  await io.write(file, doc);
  total += fs.statSync(file).size;
  console.log('animations:', doc.getRoot().listAnimations().map((a) => a.getName()).join(', '));
}
// Skeleton weapons (separate props attached to hand slots at runtime).
{
  const WEAPONS = ['Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Staff', 'Skeleton_Crossbow', 'Skeleton_Shield_Small_A'];
  const out = new (await import('@gltf-transform/core')).Document();
  const { mergeDocuments } = await import('@gltf-transform/functions');
  out.createBuffer();
  const scene = out.createScene('weapons');
  for (const w of WEAPONS) {
    const d = await io.read(path.join(SKE, 'Assets/gltf', `${w}.gltf`));
    const map = mergeDocuments(out, d);
    const sc = map.get(d.getRoot().listScenes()[0]);
    const g = out.createNode(w);
    for (const c of sc.listChildren()) g.addChild(c);
    scene.addChild(g);
    sc.dispose();
  }
  for (const s of out.getRoot().listScenes()) if (s !== scene) s.dispose();
  await shrinkTextures(out, 256);
  await out.transform(unpartition(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const file = path.join(OUT, 'weapons.glb');
  await io.write(file, out);
  total += fs.statSync(file).size;
}
fs.copyFileSync(path.join(ADV, 'LICENSE.txt'), 'public/assets/LICENSE-KayKit-Adventurers.txt');
fs.copyFileSync(path.join(SKE, 'LICENSE.txt'), 'public/assets/LICENSE-KayKit-Skeletons.txt');
console.log(`characters: ${(total / 1024).toFixed(0)} KB total`);
