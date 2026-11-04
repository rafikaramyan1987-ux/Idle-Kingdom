/** Midgame ad pacing: never in the first 3 minutes, at most once every 3 minutes. */
export const MIDGAME_MIN_GAP_MS = 3 * 60 * 1000;

export class AdPacer {
  private lastAd = -Infinity;
  constructor(private readonly sessionStart: number) {}

  canShowMidgame(now: number): boolean {
    return now - this.sessionStart >= MIDGAME_MIN_GAP_MS && now - this.lastAd >= MIDGAME_MIN_GAP_MS;
  }

  /** Any ad (including rewarded) resets the gap so players never see ads back to back. */
  markShown(now: number): void {
    this.lastAd = now;
  }
}
