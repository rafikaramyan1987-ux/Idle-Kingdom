import { NodeIO } from '@gltf-transform/core';
const io = new NodeIO();
for (const n of process.argv.slice(2)) {
  const doc = await io.read(`assets-src/kaykit/Assets/gltf/${n}.gltf`);
  const res = [];
  const pts = [];
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute('POSITION');
    for (let i = 0; i < pos.getCount(); i++) pts.push(pos.getElement(i, []));
  }
  for (let e = 0; e < 6; e++) {
    const a = e * Math.PI / 3, mx = Math.cos(a), mz = -Math.sin(a);
    const near = pts.filter(p => p[1] > 0.3 && Math.hypot(p[0] - mx * 0.95, p[2] - mz * 0.95) < 0.25).length;
    res.push(`${e * 60}:${near}`);
  }
  console.log(n.padEnd(40), res.join(' '));
}
