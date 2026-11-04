import { NodeIO } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/functions';
const io = new NodeIO();
const base = process.argv[2];
const files = process.argv.slice(3);
for (const f of files) {
  const doc = await io.read(`${base}/${f}.gltf`);
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  const b = getBounds(scene);
  const nodes = root.listNodes().map(n => `${n.getName()}${n.getMesh()?'[m]':''}@${n.getTranslation().map(v=>v.toFixed(2))}`);
  const mats = root.listMaterials().map(m=>m.getName());
  const tris = root.listMeshes().reduce((a,m)=>a+m.listPrimitives().reduce((s,p)=>s+(p.getIndices()?.getCount()??0)/3,0),0);
  console.log(f, 'min', b.min.map(v=>v.toFixed(2)).join(','), 'max', b.max.map(v=>v.toFixed(2)).join(','), 'tris', tris, 'mats', mats.join('|'), '\n   ', nodes.join(' '));
}
