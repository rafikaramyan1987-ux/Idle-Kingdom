/** Soft synthesized sounds (WebAudio, no files). Music is a gentle generative pentatonic loop. */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer = 0;
  private step = 0;
  sfx = true;
  music = true;
  private adMuted = false;
  private hidden = false;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.0;
    this.musicGain.connect(this.master);
    this.apply();
    this.startMusic();
  }

  setAdMuted(m: boolean): void { this.adMuted = m; this.apply(); }
  setHidden(h: boolean): void { this.hidden = h; this.apply(); }
  setSfx(on: boolean): void { this.sfx = on; this.apply(); }
  setMusic(on: boolean): void { this.music = on; this.apply(); }

  private apply(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const silent = this.adMuted || this.hidden;
    this.master.gain.setTargetAtTime(silent ? 0 : 1, t, 0.05);
    this.sfxGain!.gain.setTargetAtTime(this.sfx ? 0.5 : 0, t, 0.05);
    this.musicGain!.gain.setTargetAtTime(this.music ? 0.12 : 0, t, 0.4);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, dest: AudioNode | null, delay = 0, slide = 0): void {
    if (!this.ctx || !dest) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, gain: number, freq: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start();
  }

  private readonly scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

  collect(): void {
    const f = this.scale[Math.floor(Math.random() * this.scale.length)];
    this.tone(f, 0.25, 'sine', 0.35, this.sfxGain);
    this.tone(f * 1.5, 0.3, 'sine', 0.15, this.sfxGain, 0.06);
  }
  tap(): void { this.tone(660, 0.07, 'triangle', 0.18, this.sfxGain); }
  build(): void { this.noise(0.18, 0.5, 900); this.tone(196, 0.2, 'triangle', 0.25, this.sfxGain); }
  complete(): void { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.22, this.sfxGain, i * 0.08)); }
  unlockLand(): void { [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.6, 'triangle', 0.18, this.sfxGain, i * 0.1)); this.noise(0.8, 0.2, 500); }
  hero(): void { [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.2, this.sfxGain, i * 0.09)); }
  error(): void { this.tone(220, 0.15, 'sine', 0.2, this.sfxGain, 0, 0.8); }

  private startMusic(): void {
    if (!this.ctx) return;
    const chords = [[261.63, 329.63, 392], [220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]];
    const tickMusic = (): void => {
      if (!this.ctx) return;
      if (this.ctx.state === 'running' && this.music && !this.hidden && !this.adMuted) {
        const chord = chords[Math.floor(this.step / 8) % chords.length];
        if (this.step % 8 === 0) for (const f of chord) this.tone(f / 2, 3.6, 'sine', 0.22, this.musicGain);
        if (Math.random() < 0.55) {
          const f = chord[Math.floor(Math.random() * 3)] * (Math.random() < 0.5 ? 2 : 4);
          this.tone(f, 1.4, 'triangle', 0.1, this.musicGain);
        }
      }
      this.step++;
      this.musicTimer = window.setTimeout(tickMusic, 480);
    };
    window.clearTimeout(this.musicTimer);
    tickMusic();
  }
}
