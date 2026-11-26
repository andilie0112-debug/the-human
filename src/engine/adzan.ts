import type { AudioEngine } from './audio';

// The call to prayer heard across the neighbourhood: a recording (CC BY 3.0, see
// Design/ASSET_LICENSES.md) played through a distance filter and a soft echo, faint at home,
// clearer in the street and clear inside the mosque. The file loads the first time it is needed.

export type AdzanWhere = 'home' | 'street' | 'mosque' | 'inside';

const LEVEL: Record<AdzanWhere, { gain: number; cutoff: number; wet: number }> = {
  home: { gain: 0.22, cutoff: 1300, wet: 0.5 },
  inside: { gain: 0.15, cutoff: 1000, wet: 0.5 },
  street: { gain: 0.45, cutoff: 2400, wet: 0.45 },
  mosque: { gain: 0.9, cutoff: 9000, wet: 0.2 },
};

export class Adzan {
  private buffer: Promise<AudioBuffer | null> | null = null;
  private playing: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; wet: GainNode } | null = null;
  private where: AdzanWhere = 'home';

  constructor(private readonly engine: AudioEngine, private readonly url: string) {}

  private load(): Promise<AudioBuffer | null> {
    const g = this.engine.graph;
    if (!g) return Promise.resolve(null);
    this.buffer ??= fetch(this.url)
      .then((r) => r.arrayBuffer())
      .then((b) => g.ctx.decodeAudioData(b))
      .catch(() => null);
    return this.buffer;
  }

  private echo(ctx: AudioContext): AudioBuffer {
    // A short, soft echo like a loudspeaker heard between houses.
    const len = Math.floor(ctx.sampleRate * 1.6);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3) * 0.6;
    return b;
  }

  /** Starts the adzan (ignored if it is already sounding or sound is off). */
  play(where: AdzanWhere): void {
    const g = this.engine.graph;
    if (!g || this.playing || this.engine.muted) return;
    this.where = where;
    void this.load().then((buf) => {
      if (!buf || this.playing) return;
      const ctx = g.ctx;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 220;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      const gain = ctx.createGain();
      const wet = ctx.createGain();
      const conv = ctx.createConvolver();
      conv.buffer = this.echo(ctx);
      src.connect(hp).connect(filter);
      filter.connect(gain).connect(g.master);
      filter.connect(conv).connect(wet).connect(gain);
      this.playing = { src, gain, filter, wet };
      this.apply(0);
      src.onended = () => {
        this.playing = null;
      };
      src.start();
    });
  }

  /** Follows the player (home, street, inside a place, the mosque). */
  setWhere(where: AdzanWhere): void {
    if (where === this.where) return;
    this.where = where;
    this.apply(0.8);
  }

  private apply(seconds: number): void {
    const p = this.playing;
    const g = this.engine.graph;
    if (!p || !g) return;
    const l = LEVEL[this.where];
    const t = g.ctx.currentTime;
    p.gain.gain.setTargetAtTime(l.gain, t, Math.max(0.01, seconds / 3));
    p.filter.frequency.setTargetAtTime(l.cutoff, t, Math.max(0.01, seconds / 3));
    p.wet.gain.setTargetAtTime(l.wet, t, Math.max(0.01, seconds / 3));
  }

  get sounding(): boolean {
    return this.playing !== null;
  }
}
