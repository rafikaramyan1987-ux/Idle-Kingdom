// Packs dist-crazygames/ into idle-kingdom-crazygames.zip (index.html at the zip root).
import fs from 'node:fs';
import path from 'node:path';
import { zipSync } from 'fflate';

const dir = 'dist-crazygames';
const out = 'idle-kingdom-crazygames.zip';
const entries = {};
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else entries[path.relative(dir, p).split(path.sep).join('/')] = [new Uint8Array(fs.readFileSync(p)), { level: /\.(png|jpg|woff2?|glb)$/.test(f) ? 0 : 9 }];
  }
})(dir);
fs.writeFileSync(out, zipSync(entries));
console.log(`Wrote ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB, ${Object.keys(entries).length} files)`);
