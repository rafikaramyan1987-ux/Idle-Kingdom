// Fails when the built game is larger than the CrazyGames mobile limit (20 MB).
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] ?? 'dist';
const LIMIT = 20 * 1024 * 1024;
let total = 0;
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else { total += st.size; files.push([p, st.size]); }
  }
})(dir);
files.sort((a, b) => b[1] - a[1]);
for (const [p, s] of files.slice(0, 8)) console.log(`${(s / 1024).toFixed(0).padStart(7)} KB  ${p}`);
console.log(`Total ${dir}: ${(total / 1024 / 1024).toFixed(2)} MB (limit 20 MB)`);
if (total > LIMIT) {
  console.error('Build is too large!');
  process.exit(1);
}
