import * as THREE from 'three';
import { buildMap, hexDist, hexToWorld, worldToHex } from '../game/map';

// ---------- Ocean ----------
/** Distance-to-shore field baked into a small texture, used for shallow water colour and animated foam. */
function shoreTexture(size: number, extent: number): THREE.DataTexture {
  const map = buildMap();
  const data = new Uint8Array(size * size * 4);
  const land = new Uint8Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i / (size - 1) - 0.5) * 2 * extent;
      const z = (j / (size - 1) - 0.5) * 2 * extent;
      const h = worldToHex(x, z);
      const c = map.cells.get(`${h.q},${h.r}`);
      if (c) {
        // Inside the hexagon (pointy top, inradius 1)?
        const w = hexToWorld(h);
        const dx = Math.abs(x - w.x), dz = Math.abs(z - w.z);
        if (dx <= 1 && dx * 0.5 + dz * 0.866 <= 1) land[j * size + i] = 1;
      }
    }
  }
  // Brute-force distance (small texture, done once).
  const pts: number[] = [];
  for (let k = 0; k < land.length; k++) if (land[k]) pts.push(k % size, Math.floor(k / size));
  const maxD = 12;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let best = maxD * maxD;
      for (let p = 0; p < pts.length; p += 2) {
        const dx = pts[p] - i, dy = pts[p + 1] - j;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) best = d2;
      }
      const d = Math.min(1, Math.sqrt(best) / maxD);
      const k = (j * size + i) * 4;
      data[k] = Math.round(d * 255);
      data[k + 1] = data[k + 2] = 0;
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createOcean(time: { value: number }, fogColor: THREE.Color): THREE.Mesh {
  const extent = 26;
  const geo = new THREE.PlaneGeometry(320, 320, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: time,
      uShore: { value: shoreTexture(96, extent) },
      uExtent: { value: extent },
      uDeep: { value: new THREE.Color('#2a86b8') },
      uShallow: { value: new THREE.Color('#5fd3cf') },
      uFog: { value: fogColor },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      varying float vDepth;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform sampler2D uShore; uniform float uExtent;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFog;
      varying vec3 vW; varying float vDepth;
      void main() {
        vec2 uv = vW.xz / (2.0 * uExtent) + 0.5;
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        float d = mix(1.0, texture2D(uShore, clamp(uv, 0.0, 1.0)).r, inside);
        vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 0.35, d));
        // Soft travelling ripples
        float w = sin(vW.x * 0.9 + uTime * 0.7) * sin(vW.z * 0.8 - uTime * 0.55);
        col += 0.035 * w;
        // Foam bands near the shore
        float band = sin(d * 70.0 - uTime * 1.6);
        float foam = smoothstep(0.65, 1.0, band) * (1.0 - smoothstep(0.03, 0.16, d));
        foam += 1.0 - smoothstep(0.0, 0.035, d);
        col = mix(col, vec3(0.96, 0.99, 1.0), clamp(foam, 0.0, 1.0) * 0.85);
        // Large, slow colour variation so the sea never looks flat.
        col *= 0.96 + 0.06 * sin(vW.x * 0.11 + vW.z * 0.07 + uTime * 0.15);
        float f = smoothstep(40.0, 120.0, vDepth);
        gl_FragColor = vec4(mix(col, uFog, f), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -0.5;
  mesh.renderOrder = -1;
  return mesh;
}

// ---------- Soft particle smoke (single draw call) ----------
export class Smoke {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private seed: Float32Array;
  private next = 0;
  private readonly count: number;

  constructor(count = 64) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.age = new Float32Array(count).fill(1e9);
    this.life = new Float32Array(count).fill(1);
    this.seed = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(count), 1));
    geo.setAttribute('aWhite', new THREE.BufferAttribute(new Float32Array(count), 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 300 } },
      vertexShader: /* glsl */ `
        attribute float aT; attribute float aWhite; uniform float uScale;
        varying float vT; varying float vWhite;
        void main() {
          vT = aT; vWhite = aWhite;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uScale * (0.18 + aT * 0.4) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vT; varying float vWhite;
        void main() {
          if (vT >= 1.0) discard;
          vec2 c = gl_PointCoord - 0.5;
          float r = length(c);
          float a = smoothstep(0.5, 0.15, r) * sin(3.14159 * clamp(vT, 0.0, 1.0)) * mix(0.55, 0.9, vWhite);
          vec3 col = mix(vec3(0.86, 0.86, 0.9), vec3(1.0, 0.98, 0.9), vWhite);
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  setScale(px: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = px;
  }

  emit(p: THREE.Vector3, white = false, life = 3): void {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.age[i] = 0;
    this.life[i] = life;
    this.seed[i] = Math.random() * 6.28;
    (this.points.geometry.getAttribute('aWhite') as THREE.BufferAttribute).setX(i, white ? 1 : 0);
  }

  burst(p: THREE.Vector3, n = 10): void {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      this.emit(new THREE.Vector3(p.x + Math.cos(a) * 0.5, p.y + 0.1 + Math.random() * 0.3, p.z + Math.sin(a) * 0.5), true, 1.2);
    }
  }

  update(dt: number): void {
    const t = this.points.geometry.getAttribute('aT') as THREE.BufferAttribute;
    for (let i = 0; i < this.count; i++) {
      if (this.age[i] > this.life[i]) { t.setX(i, 1); continue; }
      this.age[i] += dt;
      const k = this.age[i] / this.life[i];
      this.pos[i * 3 + 1] += dt * (this.life[i] < 2 ? 0.35 : 0.45);
      this.pos[i * 3] += Math.sin(this.seed[i] + this.age[i] * 1.5) * dt * 0.12 + dt * 0.08;
      t.setX(i, Math.min(1, k));
    }
    t.needsUpdate = true;
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('aWhite') as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ---------- Birds ----------
export class Birds {
  readonly group = new THREE.Group();
  private birds: { obj: THREE.Object3D; l: THREE.Object3D; r: THREE.Object3D; radius: number; speed: number; phase: number; h: number; cx: number; cz: number }[] = [];

  constructor(n = 7) {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.08, 0, 0, 0.08, 0.32, 0, 0.02], 3));
    wing.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: 0x3b4252, side: THREE.DoubleSide });
    for (let i = 0; i < n; i++) {
      const obj = new THREE.Group();
      const l = new THREE.Mesh(wing, mat), r = new THREE.Mesh(wing, mat);
      r.scale.x = -1;
      obj.add(l, r);
      const flock = i < 4 ? 0 : 1;
      this.birds.push({ obj, l, r, radius: 9 + (i % 4) * 0.9 + flock * 4, speed: 0.12 + flock * 0.04, phase: i * 0.35 + flock * 2.5, h: 6.5 + (i % 3) * 0.5 + flock, cx: flock ? -3 : 2, cz: flock ? 2 : -2 });
      this.group.add(obj);
    }
  }

  update(t: number): void {
    for (const b of this.birds) {
      const a = t * b.speed + b.phase;
      b.obj.position.set(b.cx + Math.cos(a) * b.radius, b.h + Math.sin(t * 0.7 + b.phase) * 0.3, b.cz + Math.sin(a) * b.radius * 0.8);
      b.obj.rotation.y = -a;
      const flap = Math.sin(t * 9 + b.phase * 3) * 0.6;
      b.l.rotation.z = flap;
      b.r.rotation.z = -flap;
    }
  }
}

// ---------- Villagers & carts walking on the roads ----------
interface Walker { node: string; to: string; t: number; speed: number; side: number; color: number; cart: THREE.Object3D | null }

export class Villagers {
  readonly group = new THREE.Group();
  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private shadows: THREE.InstancedMesh;
  private walkers: Walker[] = [];
  private adj = new Map<string, string[]>();
  private allowed: (k: string) => boolean = () => true;
  private tmp = new THREE.Object3D();

  constructor(count: number, makeCart: () => THREE.Object3D) {
    const map = buildMap();
    for (const [a, b] of map.roadLinks) {
      if (!this.adj.has(a)) this.adj.set(a, []);
      if (!this.adj.has(b)) this.adj.set(b, []);
      this.adj.get(a)!.push(b);
      this.adj.get(b)!.push(a);
    }
    const body = new THREE.CapsuleGeometry(0.05, 0.08, 2, 6);
    body.translate(0, 0.1, 0);
    const head = new THREE.SphereGeometry(0.045, 8, 6);
    head.translate(0, 0.22, 0);
    const shadow = new THREE.CircleGeometry(0.08, 10);
    shadow.rotateX(-Math.PI / 2);
    shadow.translate(0, 0.012, 0);
    this.bodies = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial(), count);
    this.heads = new THREE.InstancedMesh(head, new THREE.MeshLambertMaterial({ color: 0xf2c9a0 }), count);
    this.shadows = new THREE.InstancedMesh(shadow, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }), count);
    const palette = [0xd9534f, 0x4f8fd9, 0x6fb86a, 0xe9b949, 0xb07cc6, 0xef8f5a, 0x5bc0be];
    const nodes = [...this.adj.keys()];
    for (let i = 0; i < count; i++) {
      const color = palette[i % palette.length];
      this.bodies.setColorAt(i, new THREE.Color(color));
      const node = nodes[(i * 7) % nodes.length];
      const w: Walker = { node, to: node, t: 1, speed: 0.35 + (i % 3) * 0.08, side: i % 2 ? 0.22 : -0.22, color, cart: null };
      if (i % 3 === 0) {
        w.cart = makeCart();
        this.group.add(w.cart);
      }
      this.walkers.push(w);
    }
    this.group.add(this.bodies, this.heads, this.shadows);
    for (const m of [this.bodies, this.heads, this.shadows]) m.frustumCulled = false;
  }

  setAllowed(fn: (k: string) => boolean): void {
    this.allowed = fn;
  }

  private pos(k: string): { x: number; z: number } {
    const [q, r] = k.split(',').map(Number);
    return hexToWorld({ q, r });
  }

  update(dt: number, t: number): void {
    this.walkers.forEach((w, i) => {
      w.t += (dt * w.speed) / 2;
      if (w.t >= 1) {
        w.node = w.to;
        const opts = (this.adj.get(w.node) ?? []).filter((n) => this.allowed(n));
        // Avoid walking into the castle courtyard too often.
        const choices = opts.length ? opts : [w.node];
        w.to = choices[Math.floor(Math.random() * choices.length)];
        w.t = 0;
      }
      const a = this.pos(w.node), b = this.pos(w.to);
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;
      const k = w.t;
      const x = a.x + dx * k + nx * w.side;
      const z = a.z + dz * k + nz * w.side;
      const visible = this.allowed(w.node) && this.allowed(w.to) && w.node !== w.to;
      const bob = Math.abs(Math.sin(t * 8 + i)) * 0.03;
      this.tmp.position.set(x, visible ? bob : -5, z);
      this.tmp.rotation.set(0, Math.atan2(dx, dz), 0);
      this.tmp.updateMatrix();
      this.bodies.setMatrixAt(i, this.tmp.matrix);
      this.heads.setMatrixAt(i, this.tmp.matrix);
      this.tmp.position.y = visible ? 0 : -5;
      this.tmp.updateMatrix();
      this.shadows.setMatrixAt(i, this.tmp.matrix);
      if (w.cart) {
        w.cart.visible = visible;
        w.cart.position.set(x + (dx / len) * 0.28, 0, z + (dz / len) * 0.28);
        w.cart.rotation.y = Math.atan2(dx, dz);
      }
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
  }
}

// ---------- Soft fog puffs over locked land ----------
export function fogTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export { hexDist };

// ---------- Clouds over a locked region (instanced, 2-3 draw calls per region) ----------
export class RegionClouds {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private anchors: { x: number; y: number; z: number; s: number; rot: number; seed: number; mesh: number; index: number }[] = [];
  private puffs: THREE.Points;
  private material: THREE.MeshLambertMaterial;
  private puffMat: THREE.ShaderMaterial;
  private tmp = new THREE.Object3D();
  fade = 0; // 0 = fully clouded, 1 = cleared
  clearing = false;

  constructor(cells: { x: number; z: number; seed: number }[], big: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[], small: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[], base: THREE.MeshLambertMaterial, fogTex: THREE.Texture) {
    this.material = base.clone();
    const chosen = cells.filter((c) => c.seed < 0.45);
    const bigCells = chosen.filter((_, i) => i % 2 === 0), smallCells = chosen.filter((_, i) => i % 2 === 1);
    const addSet = (parts: typeof big, list: typeof cells, scale: number): void => {
      const meshIdx = this.meshes.length;
      for (const part of parts) {
        const m = new THREE.InstancedMesh(part.geometry, this.material, Math.max(1, list.length));
        m.count = list.length;
        m.userData.partMatrix = part.matrix;
        m.frustumCulled = false;
        this.meshes.push(m);
        this.group.add(m);
      }
      list.forEach((c, i) => this.anchors.push({ x: c.x + (c.seed - 0.2) * 1.2, y: 1.7 + c.seed * 1.2, z: c.z + (0.3 - c.seed) * 1.2, s: scale * (0.75 + c.seed * 0.7), rot: c.seed * 20, seed: c.seed * 50, mesh: meshIdx, index: i }));
    };
    addSet(big, bigCells, 0.85);
    addSet(small, smallCells, 1.0);
    // Soft fog puffs, one draw call.
    const pos = new Float32Array(cells.length * 3);
    cells.forEach((c, i) => { pos[i * 3] = c.x; pos[i * 3 + 1] = 0.6; pos[i * 3 + 2] = c.z; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.puffMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTex: { value: fogTex }, uOpacity: { value: 0.55 }, uScale: { value: 300 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `uniform float uScale; uniform float uTime;
        void main() { vec3 p = position; p.x += sin(uTime * 0.3 + position.z) * 0.3;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = uScale * 3.2 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform sampler2D uTex; uniform float uOpacity;
        void main() { vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.95, 0.97, 1.0), t.a * uOpacity); }`,
    });
    this.puffs = new THREE.Points(g, this.puffMat);
    this.puffs.frustumCulled = false;
    this.group.add(this.puffs);
    this.layout(0, 0);
  }

  setScale(px: number): void { this.puffMat.uniforms.uScale.value = px; }

  private m4 = new THREE.Matrix4();

  private layout(t: number, k: number): void {
    for (const a of this.anchors) {
      const drift = Math.sin(t * 0.15 + a.seed) * 0.35;
      const bob = Math.sin(t * 0.4 + a.seed) * 0.1;
      this.tmp.position.set(a.x + drift + k * 2 * Math.sin(a.seed), a.y + bob + k * 4, a.z);
      this.tmp.rotation.set(0, a.rot, 0);
      this.tmp.scale.setScalar(a.s * (1 + k * 0.5));
      this.tmp.updateMatrix();
      // Cloud models are a single mesh, so each set is exactly one InstancedMesh.
      const mesh = this.meshes[a.mesh];
      mesh.setMatrixAt(a.index, this.m4.multiplyMatrices(this.tmp.matrix, mesh.userData.partMatrix as THREE.Matrix4));
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  update(dt: number, t: number, reducedMotion: boolean): void {
    if (this.clearing && this.fade < 1) this.fade = Math.min(1, this.fade + dt / 2.2);
    const k = 1 - Math.pow(1 - this.fade, 3);
    this.group.visible = this.fade < 1;
    if (!this.group.visible) return;
    this.material.opacity = 0.95 * (1 - k);
    this.puffMat.uniforms.uOpacity.value = 0.55 * (1 - k);
    this.puffMat.uniforms.uTime.value = t;
    if (!reducedMotion || this.clearing) this.layout(t, k);
  }

  reset(): void { this.fade = 0; this.clearing = false; this.group.visible = true; }
}
