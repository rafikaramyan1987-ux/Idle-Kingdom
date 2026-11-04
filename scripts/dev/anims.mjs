import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'node:fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const d = await io.read(f);
  const r = d.getRoot();
  const tris = r.listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((s, p) => s + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  console.log(f.split('/').pop(), (fs.statSync(f).size / 1024).toFixed(0) + 'KB', 'tris', tris, 'skins', r.listSkins().length, 'tex', r.listTextures().map((t) => t.getImage()?.byteLength).join(','), 'meshes', r.listMeshes().map((m) => m.getName()).join('|'));
  console.log('  anims', r.listAnimations().length, r.listAnimations().map((a) => a.getName()).join(', '));
}
