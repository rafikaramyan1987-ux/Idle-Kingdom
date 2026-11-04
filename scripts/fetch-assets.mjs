// Downloads the CC0 KayKit Medieval Hexagon Pack (pinned commit) into assets-src/.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const REPO = 'https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0';
const COMMIT = '84fa4e91af6a88989be7c99e0891cede11f2ca38';
const DIR = 'assets-src/kaykit-repo';

if (!fs.existsSync(DIR)) {
  execFileSync('git', ['clone', '--depth', '1', REPO, DIR], { stdio: 'inherit', env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' } });
}
const head = execFileSync('git', ['-C', DIR, 'rev-parse', 'HEAD']).toString().trim();
if (head !== COMMIT) console.warn(`Warning: ${DIR} is at ${head}, expected ${COMMIT}`);
const license = fs.readFileSync(`${DIR}/LICENSE.txt`, 'utf8');
if (!/Creative Commons Zero, CC0/.test(license)) throw new Error('License is not CC0!');
const target = 'assets-src/kaykit';
if (!fs.existsSync(target)) fs.symlinkSync(fs.realpathSync(`${DIR}/addons/kaykit_medieval_hexagon_pack`), target);
console.log('KayKit pack ready (CC0 verified) at', target);
