import type { AudioEngine } from './audio';

// Everyday Indonesian background sounds, all synthesised: motorbikes and cars passing, roosters
// at dawn, chickens, birds in the morning, crickets and a tokek (gecko) at night, the bakso
// seller's "tok tok", children playing in the afternoon. Quieter indoors than outside.

type Ev = 'motor' | 'car' | 'rooster' | 'chicken' | 'birds' | 'tokek' | 'bakso' | 'kids';

/** Chance per second for each sound, by hour of the day. */
function rate(ev: Ev, h: number): number {
  const day = h >= 6 && h < 22;
  switch (ev) {
    case 'motor': return day ? (h >= 6 && h < 9) || (h >= 16 && h < 19) ? 0.12 : 0.06 : h >= 22 || h < 1 ? 0.015 : 0;
    case 'car': return day ? 0.025 : 0.004;
    case 'rooster': return h >= 4.5 && h < 7 ? 0.05 : h >= 7 && h < 10 ? 0.008 : 0;
    case 'chicken': return h >= 6 && h < 17 ? 0.02 : 0;
    case 'birds': return (h >= 5 && h < 10) || (h >= 15 && h < 18) ? 0.12 : h >= 10 && h < 15 ? 0.03 : 0;
    case 'tokek': return h >= 20 || h < 3 ? 0.006 : 0;
    case 'bakso': return (h >= 10 && h < 13) || (h >= 17 && h < 21) ? 0.008 : 0;
    case 'kids': return h >= 15 && h < 18 ? 0.02 : 0;
  }
}

const EVENTS: Ev[] = ['motor', 'car', 'rooster', 'chicken', 'birds', 'tokek', 'bakso', 'kids'];

export class Ambience {
  private out: GainNode | null = null;
  private crickets: { stop: () => void } | null = null;
  private acc = 0;
  private outside = false;
  private rain: { gain: GainNode; stop: () => void } | null = null;
  private rainLevel = 0;

  constructor(private readonly engine: AudioEngine) {}

  /** Rain on roofs and streets (0 = dry .. 1 = downpour), with distant thunder in heavy rain. */
  setRain(intensity: number): void {
    this.rainLevel = intensity;
    const g = this.graph();
    if (!g) return;
    if (intensity > 0 && !this.rain) {
      const src = g.ctx.createBufferSource();
      src.buffer = g.noise;
      src.loop = true;
      const lp = g.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      const hp = g.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 300;
      const gain = g.ctx.createGain();
      gain.gain.value = 0;
      src.connect(hp).connect(lp).connect(gain).connect(g.out);
      src.start();
      this.rain = { gain, stop: () => src.stop() };
    }
    if (this.rain) {
      this.rain.gain.gain.setTargetAtTime(intensity * 0.35, g.ctx.currentTime, 1.5);
      if (intensity === 0) {
        const r = this.rain;
        this.rain = null;
        window.setTimeout(() => r.stop(), 4000);
      }
    }
  }

  private thunder(): void {
    const g = this.graph();
    if (!g) return;
    const src = g.ctx.createBufferSource();
    src.buffer = g.noise;
    const lp = g.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const gain = g.ctx.createGain();
    const t = g.ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.9, t + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 4);
    src.connect(lp).connect(gain).connect(g.out);
    src.start(t);
    src.stop(t + 4.2);
  }

  private graph(): { ctx: AudioContext; out: GainNode; noise: AudioBuffer } | null {
    const g = this.engine.graph;
    if (!g) return null;
    if (!this.out) {
      this.out = g.ctx.createGain();
      this.out.gain.value = 0.5;
      this.out.connect(g.master);
    }
    return { ctx: g.ctx, out: this.out, noise: g.noise };
  }

  /** Call every frame with the game hour (0..24, fractional) and where the character is. */
  update(realDt: number, hour: number, outside: boolean): void {
    const g = this.graph();
    if (!g) return;
    if (outside !== this.outside) {
      this.outside = outside;
      g.out.gain.setTargetAtTime(outside ? 1 : 0.5, g.ctx.currentTime, 0.5);
    }
    // Crickets all night.
    const night = hour >= 19 || hour < 5;
    if (night && !this.crickets) this.crickets = this.cricketLoop();
    if (!night && this.crickets) {
      this.crickets.stop();
      this.crickets = null;
    }
    this.acc += realDt;
    while (this.acc >= 1) {
      this.acc -= 1;
      // Outside, the traffic you hear is the traffic you see (see VehicleSounds); from home or
      // inside a building, passing engines are only heard in the distance.
      for (const ev of EVENTS) if (!(outside && (ev === 'motor' || ev === 'car')) && Math.random() < rate(ev, hour) * (this.rainLevel > 0 && ev !== 'motor' && ev !== 'car' ? 0.2 : 1)) this.play(ev);
      if (this.rainLevel > 0.7 && Math.random() < 0.02) this.thunder();
    }
  }

  private play(ev: Ev): void {
    switch (ev) {
      case 'motor': return this.vehicle(95 + Math.random() * 40, 'sawtooth', 0.09, 3.5);
      case 'car': return this.vehicle(55 + Math.random() * 15, 'triangle', 0.12, 5);
      case 'rooster': return this.rooster();
      case 'chicken': return this.clucks();
      case 'birds': return this.chirps();
      case 'tokek': return this.tokek();
      case 'bakso': return this.knocks();
      case 'kids': return this.kids();
    }
  }

  private env(ctx: AudioContext, out: AudioNode, t: number, peak: number, attack: number, dur: number): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(out);
    return g;
  }

  /** An engine passing by: rises, peaks with a small Doppler drop in pitch, fades. */
  private vehicle(f: number, type: OscillatorType, vol: number, dur: number): void {
    const g = this.graph();
    if (!g) return;
    const { ctx, out } = g;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f * 1.06, t);
    o.frequency.linearRampToValueAtTime(f * 1.04, t + dur * 0.45);
    o.frequency.linearRampToValueAtTime(f * 0.92, t + dur * 0.6);
    // Engine "putt" texture.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = f / 4;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = f * 0.15;
    lfo.connect(lfoGain).connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(-0.8, t);
    pan.pan.linearRampToValueAtTime(0.8, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + dur * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(gain).connect(pan).connect(out);
    // Tyre noise.
    const n = ctx.createBufferSource();
    n.buffer = g.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    const ng = ctx.createGain();
    ng.gain.value = 0.25;
    n.connect(bp).connect(ng).connect(gain);
    for (const s of [o, lfo, n]) {
      s.start(t);
      s.stop(t + dur + 0.1);
    }
  }

  /** Kukuruyuk: a rooster's call, four rising and falling notes. */
  private rooster(): void {
    const g = this.graph();
    if (!g) return;
    const { ctx, out } = g;
    const t0 = ctx.currentTime + Math.random() * 0.5;
    const notes: [number, number, number][] = [[520, 640, 0.18], [700, 760, 0.16], [760, 900, 0.22], [900, 600, 0.7]];
    let t = t0;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 1.5;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    o.connect(bp).connect(gain).connect(out);
    for (const [a, b, d] of notes) {
      o.frequency.setValueAtTime(a, t);
      o.frequency.linearRampToValueAtTime(b, t + d);
      gain.gain.setTargetAtTime(0.05, t, 0.02);
      gain.gain.setTargetAtTime(0.012, t + d - 0.03, 0.02);
      t += d + 0.04;
    }
    gain.gain.setTargetAtTime(0.0001, t, 0.08);
    o.start(t0);
    o.stop(t + 0.5);
  }

  private clucks(): void {
    const g = this.graph();
    if (!g) return;
    const { ctx, out } = g;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * (0.18 + Math.random() * 0.12);
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(700 + Math.random() * 150, t);
      o.frequency.exponentialRampToValueAtTime(420, t + 0.08);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1100;
      o.connect(bp).connect(this.env(ctx, out, t, 0.025, 0.005, 0.1));
      o.start(t);
      o.stop(t + 0.12);
    }
  }

  private chirps(): void {
    const g = this.graph();
    if (!g) return;
    const { ctx, out } = g;
    const base = 2800 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * (0.09 + Math.random() * 0.08);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), t + 0.05);
      o.connect(this.env(ctx, out, t, 0.02, 0.005, 0.07));
      o.start(t);
      o.stop(t + 0.08);
    }
  }

  /** "To-kek ... to-kek": the house gecko, five to seven calls. */
  private tokek(): void {
    const g = this.graph();
    if (!g) return;
    const { ctx, out } = g;
    const n = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * 0.95;
      for (const [dt, f] of [[0, 330], [0.22, 250]] as const) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.setValueAtTime(f, t + dt);
        o.frequency.exponentialRampToValueAtTime(f * 0.8, t + dt + 0.15);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 700;
        o.connect(bp).connect(this.env(ctx, out, t + dt, 0.05 * (1 - i / (n + 2)), 0.01, 0.17));
        o.start(t + dt);
        o.stop(t + dt + 0.2);
      }
    }
  }

  /** The bakso cart: a bowl knocked with a spoon, "tok tok tok". */
  private knocks(): void {
    const g = this.graph();
    if (!g) return;
    const { ctx, out } = g;
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 3; i++) {
        const t = ctx.currentTime + r * 1.4 + i * 0.16;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(1150, t);
        o.frequency.exponentialRampToValueAtTime(900, t + 0.05);
        o.connect(this.env(ctx, out, t, 0.05, 0.002, 0.09));
        o.start(t);
        o.stop(t + 0.1);
      }
    }
  }

  /** Children playing in the distance: high babble with laughter-like rises. */
  private kids(): void {
    const g = this.graph();
    if (!g) return;
    const { ctx, out } = g;
    const n = 6 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * (0.12 + Math.random() * 0.2);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f = 300 + Math.random() * 250;
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * (Math.random() < 0.3 ? 1.6 : 1.1), t + 0.12);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900 + Math.random() * 1200;
      bp.Q.value = 3;
      o.connect(bp).connect(this.env(ctx, out, t, 0.012, 0.02, 0.15));
      o.start(t);
      o.stop(t + 0.2);
    }
  }

  /** Crickets: fast pulsed high chirps in short trills. */
  private cricketLoop(): { stop: () => void } | null {
    const g = this.graph();
    if (!g) return null;
    const { ctx, out } = g;
    const o = ctx.createOscillator();
    o.frequency.value = 4400;
    const am = ctx.createGain();
    am.gain.value = 0;
    const pulse = ctx.createOscillator();
    pulse.type = 'square';
    pulse.frequency.value = 28;
    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0.006;
    pulse.connect(pulseGain).connect(am.gain);
    const trill = ctx.createOscillator();
    trill.type = 'square';
    trill.frequency.value = 1.6;
    const trillGain = ctx.createGain();
    trillGain.gain.value = 1;
    const vca = ctx.createGain();
    vca.gain.value = 0;
    trill.connect(trillGain).connect(vca.gain);
    o.connect(am).connect(vca).connect(out);
    for (const s of [o, pulse, trill]) s.start();
    return {
      stop: () => {
        for (const s of [o, pulse, trill]) s.stop(ctx.currentTime + 0.2);
      },
    };
  }

  stopAll(): void {
    this.crickets?.stop();
    this.crickets = null;
  }
}
