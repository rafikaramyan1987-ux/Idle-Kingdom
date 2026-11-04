// Prints which hex edges each road/river tile connects (sampled from the atlas colour at edge midpoints).
import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
import path from 'node:path';
const base = 'assets-src/kaykit/Assets/gltf/tiles';
const io = new NodeIO();
const img = await sharp(path.join(base, 'base/hexagons_medieval.png')).raw().toBuffer({ resolveWithObject: true });
const px = (u, v) => { const x = Math.min(img.info.width - 1, Math.max(0, Math.floor(u * img.info.width))); const y = Math.min(img.info.height - 1, Math.max(0, Math.floor(v * img.info.height))); const i = (y * img.info.width + x) * img.info.channels; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const names = process.argv.slice(2);
for (const n of names) {
  const doc = await io.read(path.join(base, n + '.gltf'));
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const pos = prim.getAttribute('POSITION'), uv = prim.getAttribute('TEXCOORD_0'), idx = prim.getIndices();
  const res = [];
  for (let e = 0; e < 6; e++) {
    const a = e * Math.PI / 3; // angle CCW from +x, with north = -z
    const px0 = Math.cos(a) * 0.9, pz0 = -Math.sin(a) * 0.9;
    let best = null;
    for (let i = 0; i < idx.getCount(); i += 3) {
      const v = [0, 1, 2].map(k => idx.getScalar(i + k));
      const P = v.map(k => pos.getElement(k, []));
      const topY = Math.max(...P.map(p => p[1]));
      // barycentric in xz
      const [A, B, C] = P;
      const d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
      if (Math.abs(d) < 1e-9) continue;
      const l1 = ((B[2] - C[2]) * (px0 - C[0]) + (C[0] - B[0]) * (pz0 - C[2])) / d;
      const l2 = ((C[2] - A[2]) * (px0 - C[0]) + (A[0] - C[0]) * (pz0 - C[2])) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
      const y = l1 * A[1] + l2 * B[1] + l3 * C[1];
      if (best && best.y >= y) continue;
      const U = v.map(k => uv.getElement(k, []));
      const u = l1 * U[0][0] + l2 * U[1][0] + l3 * U[2][0], w = l1 * U[0][1] + l2 * U[1][1] + l3 * U[2][1];
      best = { y, c: px(u, w) };
      void topY;
    }
    const c = best?.c ?? [0, 0, 0];
    const kind = c[2] > c[0] + 30 && c[2] > c[1] ? 'W' : (c[0] > c[1] + 15 ? 'R' : 'g');
    res.push(`${e * 60}:${kind}`);
  }
  console.log(n.padEnd(28), res.join(' '));
}
