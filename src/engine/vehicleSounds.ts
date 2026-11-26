import type { AudioEngine } from './audio';

// The engines of the cars and motorbikes you see on the street, synthesised: a motorbike's
// buzzing two-stroke-like putter, a car's low hum with tyre noise, the angkot's and pick-up's
// diesel rumble. Louder as they come close, panned left or right of the camera, higher in pitch
// when they go faster, idling when they stop. Only the nearest few are heard (a fixed number of
// voices, so it costs the same however busy the road is). They honk when someone blocks them.

export type EngineKind = 'motor' | 'car' | 'diesel';

export interface EngineSource {
  x: number;
  z: number;
  kind: EngineKind;
  /** 0 = idling .. 1 = full speed. */
  rev: number;
}

interface Voice {
  osc: OscillatorNode;
  lfo: OscillatorNode;
  lfoDepth: GainNode;
  lp: BiquadFilterNode;
  tyres: GainNode;
  gain: GainNode;
  pan: StereoPannerNode;
}

const VOICES = 4;
const HEAR = 40;

const BASE: Record<EngineKind, { f: number; type: OscillatorType; vol: number; cut: number }> = {
  motor: { f: 95, type: 'sawtooth', vol: 0.11, cut: 1100 },
  car: { f: 48, type: 'triangle', vol: 0.16, cut: 600 },
  diesel: { f: 38, type: 'sawtooth', vol: 0.14, cut: 450 },
};

export class VehicleSounds {
  private voices: Voice[] | null = null;
  private out: GainNode | null = null;
  private readonly order: number[] = [];
  private readonly dist: number[] = [];

  constructor(private readonly engine: AudioEngine) {}

  private ensure(): Voice[] | null {
    if (this.voices) return this.voices;
    const g = this.engine.graph;
    if (!g) return null;
    const { ctx, master, noise } = g;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(master);
    this.voices = [];
    for (let i = 0; i < VOICES; i++) {
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoDepth = ctx.createGain();
      lfo.connect(lfoDepth).connect(osc.frequency);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      osc.connect(lp).connect(gain).connect(pan).connect(this.out);
      const n = ctx.createBufferSource();
      n.buffer = noise;
      n.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 450;
      const tyres = ctx.createGain();
      tyres.gain.value = 0.3;
      n.connect(bp).connect(tyres).connect(gain);
      osc.start();
      lfo.start();
      n.start(ctx.currentTime, Math.random());
      this.voices.push({ osc, lfo, lfoDepth, lp, tyres, gain, pan });
    }
    return this.voices;
  }

  /**
   * Call each frame outdoors: the listener (camera) position and the way it faces (yaw: the
   * camera looks along -sin(yaw), -cos(yaw)), and every engine on the street.
   */
  update(listener: { x: number; z: number; yaw: number }, sources: readonly EngineSource[]): void {
    const voices = this.ensure();
    const ctx = this.engine.graph?.ctx;
    if (!voices || !ctx) return;
    // The nearest few sources (no allocations: reuse the index arrays).
    this.order.length = 0;
    this.dist.length = sources.length;
    for (let i = 0; i < sources.length; i++) {
      this.dist[i] = Math.hypot(sources[i].x - listener.x, sources[i].z - listener.z);
      if (this.dist[i] < HEAR) this.order.push(i);
    }
    this.order.sort((a, b) => this.dist[a] - this.dist[b]);
    const t = ctx.currentTime;
    const rx = Math.cos(listener.yaw);
    const rz = -Math.sin(listener.yaw);
    for (let v = 0; v < voices.length; v++) {
      const voice = voices[v];
      const idx = this.order[v];
      if (idx === undefined) {
        voice.gain.gain.setTargetAtTime(0, t, 0.2);
        continue;
      }
      const s = sources[idx];
      const d = this.dist[idx];
      const b = BASE[s.kind];
      if (voice.osc.type !== b.type) voice.osc.type = b.type;
      const f = b.f * (0.7 + s.rev * 0.6);
      voice.osc.frequency.setTargetAtTime(f, t, 0.15);
      // The engine's putter: faster when revving.
      voice.lfo.frequency.setTargetAtTime(f / (s.kind === 'motor' ? 3 : 4), t, 0.15);
      voice.lfoDepth.gain.setTargetAtTime(f * 0.18, t, 0.15);
      voice.lp.frequency.setTargetAtTime(b.cut * (0.7 + s.rev * 0.5), t, 0.15);
      voice.tyres.gain.setTargetAtTime(0.25 * s.rev, t, 0.2);
      const near = 1 / (1 + (d / 5) ** 2);
      const fade = Math.max(0, 1 - d / HEAR);
      voice.gain.gain.setTargetAtTime(b.vol * near * fade * (0.45 + s.rev * 0.55), t, 0.08);
      // Left/right of the camera.
      const side = d > 0.01 ? ((s.x - listener.x) * rx + (s.z - listener.z) * rz) / d : 0;
      voice.pan.pan.setTargetAtTime(Math.max(-0.9, Math.min(0.9, side)), t, 0.08);
    }
  }

  /** Fades all engines out (leaving the street). */
  silence(): void {
    const ctx = this.engine.graph?.ctx;
    if (!ctx || !this.voices) return;
    for (const v of this.voices) v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
  }

  /** A honk: "tin tin" from a motorbike, a deeper "teeet" from a car. Volume by distance. */
  honk(kind: EngineKind, distance: number): void {
    const g = this.engine.graph;
    if (!g || !this.out) return;
    const { ctx } = g;
    const vol = 0.08 / (1 + (distance / 6) ** 2);
    if (vol < 0.003) return;
    const notes = kind === 'motor' ? [[0, 0.12], [0.18, 0.12]] : [[0, 0.45]];
    const freqs = kind === 'motor' ? [520, 650] : [400, 500];
    for (const [at, len] of notes) {
      for (const f of freqs) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = f;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2200;
        const gg = ctx.createGain();
        const t = ctx.currentTime + at;
        gg.gain.setValueAtTime(0, t);
        gg.gain.linearRampToValueAtTime(vol, t + 0.01);
        gg.gain.setValueAtTime(vol, t + len);
        gg.gain.linearRampToValueAtTime(0, t + len + 0.03);
        o.connect(lp).connect(gg).connect(this.out);
        o.start(t);
        o.stop(t + len + 0.05);
      }
    }
  }
}
