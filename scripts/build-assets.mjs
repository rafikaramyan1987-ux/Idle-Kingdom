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
  'buildings/red', 'buildings/neutral', 'decoration/nature', 'decoration/props',
];
const skip = /projectile|_blue|_green|_yellow|bucket_arrows|target|weaponrack_|catapult/;
const files = [];
for (const d of dirs) {
  for (const f of fs.readdirSync(path.join(GLTF, d))) {
    if (!f.endsWith('.gltf') || skip.test(f)) continue;
    files.push(path.join(GLTF, d, f));
  }
}
files.push(path.join(GLTF, 'decoration/props/weaponrack.gltf'));
// Castle colour skins for the shop (keep their colour suffix).
for (const c of ['blue', 'green', 'yellow']) files.push(path.join(GLTF, `buildings/${c}/building_castle_${c}.gltf`));
for (const c of ['blue', 'yellow']) files.push(path.join(GLTF, `decoration/props/flag_${c}.gltf`));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const out = new Document();
out.createBuffer();
const outScene = out.createScene('kingdom');
const seen = new Set();

for (const file of files) {
  const key = /castle_(blue|green|yellow)|flag_(blue|yellow)/.test(file) ? path.basename(file, '.gltf') : path.basename(file, '.gltf').replace(/_red$/, '');
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

// Shrink the shared gradient atlas (the pack readme says it can go down to 128px) and give the
// lime grass gradient a fresher green. Only that narrow hue band is touched.
for (const tex of out.getRoot().listTextures()) {
  const { data, info } = await sharp(Buffer.from(tex.getImage())).resize(TEX_SIZE, TEX_SIZE, { kernel: 'lanczos3' }).removeAlpha().toColourspace('srgb').raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 3) {
    const [h, sat, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (h >= 50 && h <= 75 && sat > 0.35) {
      const k = 1 - Math.abs(h - 62) / 13; // blend in/out at the band edges
      const nh = h + 30 * Math.min(1, k * 1.6);
      const [r, g, b] = hslToRgb(nh, Math.min(1, sat * 1.02), l * 0.98);
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
  }
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png({ compressionLevel: 9 }).toBuffer();
  tex.setImage(new Uint8Array(png)).setMimeType('image/png');
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255));
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, out);
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`Wrote ${OUT}: ${seen.size} models, ${kb} KB, textures: ${out.getRoot().listTextures().length}`);
fs.copyFileSync(licenseFile, 'public/assets/LICENSE-KayKit.txt');
