import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface ModelPart {
  name: string;
  geometry: THREE.BufferGeometry;
  /** Transform of this part relative to the model root. */
  matrix: THREE.Matrix4;
}

export interface Shared {
  time: { value: number };
}

/**
 * All KayKit models share one gradient atlas. We use a single cheap Lambert material for everything,
 * with tiny shader patches for animated river water.
 */
export class ModelLibrary {
  readonly models = new Map<string, THREE.Object3D>();
  readonly material: THREE.MeshLambertMaterial;
  readonly flagMaterial: THREE.MeshLambertMaterial;
  readonly cloudMaterial: THREE.MeshLambertMaterial;
  readonly shared: Shared = { time: { value: 0 } };
  private partsCache = new Map<string, ModelPart[]>();

  private constructor(root: THREE.Object3D, atlas: THREE.Texture) {
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.anisotropy = 2;
    this.material = new THREE.MeshLambertMaterial({ map: atlas });
    this.patchWater(this.material);
    this.flagMaterial = new THREE.MeshLambertMaterial({ map: atlas, side: THREE.DoubleSide });
    this.patchFlag(this.flagMaterial);
    this.cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xb8c4d6, emissiveIntensity: 0.45, transparent: true, opacity: 0.94 });
    for (const child of [...root.children]) {
      child.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.material = child.name.startsWith('flag') ? this.flagMaterial : child.name.startsWith('cloud') ? this.cloudMaterial : this.material;
          m.castShadow = !child.name.startsWith('hex_') && !child.name.startsWith('cloud');
          m.receiveShadow = true;
        }
      });
      child.position.set(0, 0, 0);
      this.models.set(child.name, child);
    }
  }

  static async load(url: string, onProgress?: (p: number) => void): Promise<ModelLibrary> {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url, (e) => {
      if (onProgress && e.total) onProgress(e.loaded / e.total);
    });
    let atlas: THREE.Texture | null = null;
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !atlas) atlas = (m.material as THREE.MeshStandardMaterial).map;
    });
    if (!atlas) throw new Error('Atlas texture missing');
    return new ModelLibrary(gltf.scene, atlas);
  }

  has(name: string): boolean {
    return this.models.has(name);
  }

  /** A lightweight clone sharing geometry and material. */
  clone(name: string): THREE.Object3D {
    const m = this.models.get(name);
    if (!m) throw new Error(`Unknown model ${name}`);
    return m.clone(true);
  }

  parts(name: string): ModelPart[] {
    const cached = this.partsCache.get(name);
    if (cached) return cached;
    const root = this.models.get(name);
    if (!root) throw new Error(`Unknown model ${name}`);
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const parts: ModelPart[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) parts.push({ name: m.name, geometry: m.geometry, matrix: new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld) });
    });
    this.partsCache.set(name, parts);
    return parts;
  }

  bounds(name: string): THREE.Box3 {
    return new THREE.Box3().setFromObject(this.models.get(name)!);
  }

  private patchWater(mat: THREE.MeshLambertMaterial): void {
    const time = this.shared.time;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#ifdef USE_INSTANCING\nvWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          // Fresher, lusher greens: the atlas grass is quite yellow (values are linear here).
          float grassy = step(diffuseColor.r * 0.92, diffuseColor.g) * step(diffuseColor.b * 1.7, diffuseColor.g) * step(0.2, diffuseColor.r);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.93, 0.9), grassy);
          // Animated shimmer on river water (low, blue texels only).
          float isWater = step(vWPos.y, -0.04) * step(-0.6, vWPos.y) * smoothstep(0.08, 0.2, diffuseColor.b - diffuseColor.r);
          if (isWater > 0.0) {
            float w1 = sin(vWPos.x * 2.3 + vWPos.z * 1.7 + uTime * 1.6);
            float w2 = sin(vWPos.x * -1.4 + vWPos.z * 2.9 - uTime * 1.2);
            float sparkle = smoothstep(1.55, 1.95, w1 + w2);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.08 + vec3(0.02, 0.05, 0.07), 0.5 + 0.5 * w1 * w2);
            diffuseColor.rgb += sparkle * 0.35 * isWater;
          }`,
        );
    };
    mat.customProgramCacheKey = () => 'ik-water';
  }

  private patchFlag(mat: THREE.MeshLambertMaterial): void {
    const time = this.shared.time;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float cloth = clamp(-position.z / 0.24, 0.0, 1.0) * step(0.12, position.y);
          float phase = uTime * 5.0 + position.z * 26.0;
          #ifdef USE_INSTANCING
          phase += instanceMatrix[3].x * 1.7 + instanceMatrix[3].z;
          #endif
          transformed.x += sin(phase) * 0.035 * cloth;
          transformed.y += cos(phase * 0.8) * 0.01 * cloth;`,
        );
    };
    mat.customProgramCacheKey = () => 'ik-flag';
  }
}
