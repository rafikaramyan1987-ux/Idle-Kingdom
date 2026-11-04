// Downloads the CC0 KayKit packs (pinned commits) into assets-src/ and verifies their licenses.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const PACKS = [
  { repo: 'https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0', commit: '84fa4e91af6a88989be7c99e0891cede11f2ca38', dir: 'assets-src/kaykit-repo', sub: 'addons/kaykit_medieval_hexagon_pack', link: 'assets-src/kaykit' },
  { repo: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0', commit: '672074b73ba276876a19e8816ecdc5241817ab47', dir: 'assets-src/adventurers-repo', sub: 'addons/kaykit_character_pack_adventures', link: 'assets-src/kaykit-adventurers' },
  { repo: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0', commit: '15b62b9bad122f72926c10fb14d622c73819fa54', dir: 'assets-src/skeletons-repo', sub: 'addons/kaykit_character_pack_skeletons', link: 'assets-src/kaykit-skeletons' },
];

for (const p of PACKS) {
  if (!fs.existsSync(p.dir)) execFileSync('git', ['clone', '--depth', '1', p.repo, p.dir], { stdio: 'inherit', env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' } });
  const head = execFileSync('git', ['-C', p.dir, 'rev-parse', 'HEAD']).toString().trim();
  if (head !== p.commit) console.warn(`Warning: ${p.dir} is at ${head}, expected ${p.commit}`);
  const license = fs.readFileSync(`${p.dir}/LICENSE.txt`, 'utf8');
  if (!/Creative Commons Zero, CC0/.test(license)) throw new Error(`${p.repo}: license is not CC0!`);
  if (!fs.existsSync(p.link)) fs.symlinkSync(fs.realpathSync(`${p.dir}/${p.sub}`), p.link);
  console.log('ready (CC0 verified):', p.link);
}
