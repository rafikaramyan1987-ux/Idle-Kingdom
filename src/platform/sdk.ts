/**
 * Thin adapter over the CrazyGames HTML5 SDK v3. Every call is safe without the SDK
 * (GitHub Pages, local dev): the game simply runs without ads.
 */
interface CGAdCallbacks { adStarted?: () => void; adFinished?: () => void; adError?: (e: unknown) => void }
interface CGSDK {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  ad: { requestAd(type: 'midgame' | 'rewarded', cb: CGAdCallbacks): void };
  game: {
    gameplayStart(): void; gameplayStop(): void; happytime?(): void; loadingStart?(): void; loadingStop?(): void;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?(fn: (s: { muteAudio?: boolean }) => void): void;
  };
  data?: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
}

declare global {
  interface Window { CrazyGames?: { SDK: CGSDK } }
}

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

export class Platform {
  private sdk: CGSDK | null = null;
  private playing = false;
  private adRunning = false;
  onMuteChange: (muted: boolean) => void = () => {};
  /** Called with true when an ad starts and false when it ends (mute audio, pause game). */
  onAdState: (running: boolean) => void = () => {};

  get available(): boolean { return !!this.sdk && this.sdk.environment !== 'disabled'; }
  get environment(): string { return this.sdk?.environment ?? 'none'; }

  async init(wantSdk: boolean): Promise<void> {
    if (!wantSdk) return;
    try {
      await loadScript(SDK_URL, 6000);
      const sdk = window.CrazyGames?.SDK;
      if (!sdk) return;
      await Promise.race([sdk.init(), new Promise((_, rej) => setTimeout(() => rej(new Error('sdk init timeout')), 6000))]);
      this.sdk = sdk;
      sdk.game.addSettingsChangeListener?.((s) => this.onMuteChange(!!s.muteAudio));
      if (sdk.game.settings?.muteAudio) this.onMuteChange(true);
    } catch (e) {
      console.info('[platform] CrazyGames SDK unavailable, running standalone', e);
      this.sdk = null;
    }
  }

  /** Storage that syncs with CrazyGames cloud saves when available. */
  get dataStore(): CGSDK['data'] | null {
    return this.available && this.sdk?.environment === 'crazygames' ? this.sdk.data ?? null : null;
  }

  loadingStart(): void { this.safe(() => this.sdk?.game.loadingStart?.()); }
  loadingStop(): void { this.safe(() => this.sdk?.game.loadingStop?.()); }
  happytime(): void { this.safe(() => this.sdk?.game.happytime?.()); }

  gameplayStart(): void {
    if (this.playing || this.adRunning) return;
    this.playing = true;
    this.safe(() => this.sdk?.game.gameplayStart());
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.safe(() => this.sdk?.game.gameplayStop());
  }

  /** Resolves true when the player earned the reward. Without SDK the reward is granted directly. */
  rewarded(): Promise<boolean> {
    if (!this.available) return new Promise((r) => setTimeout(() => r(true), 350));
    return this.request('rewarded');
  }

  /** Midgame ad; always resolves (errors are ignored). */
  async midgame(): Promise<void> {
    if (!this.available) return;
    await this.request('midgame');
  }

  private request(type: 'midgame' | 'rewarded'): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.adRunning) { resolve(false); return; }
      const wasPlaying = this.playing;
      let started = false;
      const end = (ok: boolean): void => {
        if (started) this.onAdState(false);
        this.adRunning = false;
        if (wasPlaying) this.gameplayStart();
        resolve(ok);
      };
      this.adRunning = true;
      try {
        this.sdk!.ad.requestAd(type, {
          adStarted: () => {
            started = true;
            this.gameplayStop();
            this.onAdState(true);
          },
          adFinished: () => end(true),
          adError: () => end(false),
        });
      } catch {
        end(false);
      }
    });
  }

  private safe(fn: () => void): void {
    try { fn(); } catch (e) { console.info('[platform]', e); }
  }
}

function loadScript(src: string, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    const t = setTimeout(() => reject(new Error('timeout')), timeout);
    s.onload = () => { clearTimeout(t); resolve(); };
    s.onerror = () => { clearTimeout(t); reject(new Error('load failed')); };
    document.head.appendChild(s);
  });
}
