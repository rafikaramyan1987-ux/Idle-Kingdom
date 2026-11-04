// Builds public/assets/kingdom.glb from the KayKit Medieval Hexagon Pack (CC0).
// Source: https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0
// Usage: node scripts/fetch-assets.mjs && node scripts/build-assets.mjs
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, meshopt, mergeDocuments, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.env.KAYKIT_DIR ?? 'assets-src/kaykit';
const GLTF = path.join(SRC, 'Assets/gltf');
const OUT = 'public/assets/kingdom.glb';
const TEX_SIZE = 512;

const licenseFile = path.join(SRC, 'LICENSE.txt');
if (!fs.existsSync(licenseFile)) throw new Error(`Missing ${licenseFile}. Run scripts/fetch-assets.mjs first.`);
if (!/Creative Commons Zero, CC0/.test(fs.readFileSync(licenseFile, 'utf8'))) throw new Error('KayKit license is not CC0 – refusing to build.');

const dirs = [
  'tiles/base', 'tiles/rivers', 'tiles/roads', 'tiles/coast',
  'buildings/blue', 'buildings/neutral', 'decoration/nature', 'decoration/props',
];
const skip = /projectile|building_destroyed|_red|_green|_yellow|bucket_arrows|target|weaponrack_|catapult/;
const files = [];
for (const d of dirs) {
  for (const f of fs.readdirSync(path.join(GLTF, d))) {
    if (!f.endsWith('.gltf') || skip.test(f)) continue;
    files.push(path.join(GLTF, d, f));
  }
}
files.push(path.join(GLTF, 'decoration/props/weaponrack.gltf'));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const out = new Document();
out.createBuffer();
const outScene = out.createScene('kingdom');
const seen = new Set();

for (const file of files) {
  const key = path.basename(file, '.gltf').replace(/_blue$/, '');
  if (seen.has(key)) continue;
  seen.add(key);
  const doc = await io.read(file);
  const map = mergeDocuments(out, doc);
  const srcScene = doc.getRoot().listScenes()[0];
  const scene = map.get(srcScene);
  const group = out.createNode(key);
  for (const child of scene.listChildren()) group.addChild(child);
  outScene.addChild(group);
  scene.dispose();
}
for (const s of out.getRoot().listScenes()) if (s !== outScene) s.dispose();
out.getRoot().setDefaultScene(outScene);

await MeshoptEncoder.ready;
await out.transform(
  unpartition(),
  dedup(),
  weld(),
  prune({ keepLeaves: true }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);

// Shrink the shared gradient atlas (the pack readme says it can go down to 128px).
for (const tex of out.getRoot().listTextures()) {
  const img = tex.getImage();
  const resized = await sharp(Buffer.from(img)).resize(TEX_SIZE, TEX_SIZE, { kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: true, quality: 95 }).toBuffer();
  tex.setImage(new Uint8Array(resized)).setMimeType('image/png');
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, out);
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`Wrote ${OUT}: ${seen.size} models, ${kb} KB, textures: ${out.getRoot().listTextures().length}`);
fs.copyFileSync(licenseFile, 'public/assets/LICENSE-KayKit.txt');
