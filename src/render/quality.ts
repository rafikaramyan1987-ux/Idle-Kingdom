export interface QualityTier {
  name: 'low' | 'medium' | 'high';
  pixelRatio: number;
  shadow: number;
  antialias: boolean;
  fpsCap: number;
}

export const TIERS: QualityTier[] = [
  { name: 'low', pixelRatio: 1, shadow: 512, antialias: false, fpsCap: 30 },
  { name: 'medium', pixelRatio: 1.5, shadow: 1024, antialias: true, fpsCap: 60 },
  { name: 'high', pixelRatio: 2, shadow: 2048, antialias: true, fpsCap: 60 },
];

/**
 * Watches frame times and steps quality down when the device struggles (and back up once, carefully).
 */
export class AdaptiveQuality {
  index: number;
  private acc = 0;
  private frames = 0;
  private slowWindows = 0;
  private fastWindows = 0;
  private upgrades = 0;
  private warmup = 2.5;
  auto = true;

  constructor(start: number, private onChange: (t: QualityTier) => void) {
    this.index = start;
  }

  get tier(): QualityTier {
    return TIERS[this.index];
  }

  static initialIndex(): number {
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    const cores = navigator.hardwareConcurrency ?? 4;
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    if (mem <= 2 || cores <= 4) return 0;
    if (mobile) return 1;
    return 2;
  }

  set(index: number): void {
    this.index = Math.max(0, Math.min(TIERS.length - 1, index));
    this.onChange(this.tier);
  }

  /** Feed real frame deltas (seconds). */
  sample(dt: number): void {
    if (!this.auto) return;
    if (this.warmup > 0) { this.warmup -= dt; return; }
    if (dt > 0.5) return; // tab switch / hitch, ignore
    this.acc += dt;
    this.frames++;
    if (this.acc < 2) return;
    const avg = this.acc / this.frames;
    this.acc = 0;
    this.frames = 0;
    const target = 1 / this.tier.fpsCap;
    if (avg > target * 1.45) {
      this.slowWindows++;
      this.fastWindows = 0;
      if (this.slowWindows >= 2 && this.index > 0) {
        this.slowWindows = 0;
        this.set(this.index - 1);
        this.warmup = 1.5;
      }
    } else if (avg < target * 1.08) {
      this.fastWindows++;
      this.slowWindows = 0;
      if (this.fastWindows >= 6 && this.index < TIERS.length - 1 && this.upgrades < 1) {
        this.fastWindows = 0;
        this.upgrades++;
        this.set(this.index + 1);
        this.warmup = 1.5;
      }
    } else {
      this.slowWindows = 0;
    }
  }
}
