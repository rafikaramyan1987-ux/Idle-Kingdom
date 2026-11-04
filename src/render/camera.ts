import * as THREE from 'three';

/**
 * Angled city-builder camera: drag to pan (with inertia), pinch / wheel to zoom (clamped), tap to select.
 * No free rotation.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** Visible world width at the focus point. */
  private width = 17;
  private widthGoal = 17;
  private target = new THREE.Vector2(0, 1.5);
  private targetGoal = new THREE.Vector2(0, 1.5);
  private vel = new THREE.Vector2();
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private down: { x: number; y: number; t: number; moved: boolean } | null = null;
  private lastMove = 0;
  minWidth = 7;
  maxWidth = 40;
  bounds = 15;
  enabled = true;
  onTap: (x: number, y: number) => void = () => {};
  onMove: () => void = () => {};

  constructor(private el: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.5, 260);
    el.addEventListener('pointerdown', this.pd);
    el.addEventListener('pointermove', this.pm);
    el.addEventListener('pointerup', this.pu);
    el.addEventListener('pointercancel', this.pu);
    el.addEventListener('wheel', this.wheel, { passive: false });
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Wider screens can show more of the island at once.
    this.maxWidth = this.camera.aspect > 1 ? 52 : 40;
  }

  private distanceFor(width: number): number {
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    // Frame by the narrow screen dimension so portrait and landscape both feel right.
    return width / (2 * Math.tan(Math.min(hfov, vfov) / 2));
  }

  private pitch(): number {
    const k = (this.width - this.minWidth) / (this.maxWidth - this.minWidth);
    return THREE.MathUtils.degToRad(40 + 16 * THREE.MathUtils.clamp(k, 0, 1));
  }

  focus(x: number, z: number, width?: number, instant = false): void {
    this.targetGoal.set(x, z);
    if (width) this.widthGoal = THREE.MathUtils.clamp(width, this.minWidth, this.maxWidth);
    this.vel.set(0, 0);
    if (instant) {
      this.target.copy(this.targetGoal);
      this.width = this.widthGoal;
    }
  }

  get zoomWidth(): number { return this.width; }

  update(dt: number): boolean {
    const before = this.camera.position.clone();
    if (this.pointers.size === 0 && this.vel.lengthSq() > 1e-6) {
      this.targetGoal.addScaledVector(this.vel, dt);
      this.vel.multiplyScalar(Math.pow(0.04, dt));
    }
    const len = this.targetGoal.length();
    if (len > this.bounds) this.targetGoal.multiplyScalar(this.bounds / len);
    const k = 1 - Math.pow(0.0005, dt);
    this.target.lerp(this.targetGoal, k);
    this.width += (this.widthGoal - this.width) * k;
    const d = this.distanceFor(this.width);
    const p = this.pitch();
    this.camera.position.set(this.target.x, Math.sin(p) * d, this.target.y + Math.cos(p) * d);
    this.camera.lookAt(this.target.x, 0, this.target.y);
    const moved = before.distanceToSquared(this.camera.position) > 1e-8;
    if (moved) this.onMove();
    return moved;
  }

  private worldPerPixel(): number {
    return this.width / this.el.clientWidth;
  }

  private pd = (e: PointerEvent): void => {
    if (!this.enabled) return;
    this.el.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.vel.set(0, 0);
    if (this.pointers.size === 1) this.down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    if (this.pointers.size === 2) {
      this.pinchDist = this.pinchDistance();
      if (this.down) this.down.moved = true;
    }
  };

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private pm = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev || !this.enabled) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    if (this.pointers.size === 1) {
      if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 8) this.down.moved = true;
      if (this.down?.moved) {
        const s = this.worldPerPixel();
        const zx = -dx * s, zz = (-dy * s) / Math.sin(this.pitch());
        this.targetGoal.x += zx;
        this.targetGoal.y += zz;
        this.target.x += zx;
        this.target.y += zz;
        const now = performance.now();
        const ddt = Math.max(1, now - this.lastMove) / 1000;
        this.lastMove = now;
        this.vel.set(zx / ddt, zz / ddt).clampLength(0, 40);
      }
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const d = this.pinchDistance();
      if (this.pinchDist > 0) {
        this.widthGoal = THREE.MathUtils.clamp(this.widthGoal * (this.pinchDist / d), this.minWidth, this.maxWidth);
        this.width = this.widthGoal;
      }
      this.pinchDist = d;
    }
  };

  private pu = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) {
      if (performance.now() - this.lastMove > 80) this.vel.set(0, 0);
      if (this.down && !this.down.moved && performance.now() - this.down.t < 500) this.onTap(e.clientX, e.clientY);
      this.down = null;
    }
    if (this.pointers.size < 2) this.pinchDist = 0;
  };

  private wheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    this.widthGoal = THREE.MathUtils.clamp(this.widthGoal * Math.pow(1.0015, e.deltaY), this.minWidth, this.maxWidth);
  };
}
