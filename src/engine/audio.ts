// Procedural sound effects with the Web Audio API: no audio files, so nothing to license.
// Loops (shower, cooking, TV...) start and stop with activities; one-shots play once.
// Browsers only allow sound after a user gesture, so the context starts on the first tap.

export type LoopId = 'water' | 'sizzle' | 'flame' | 'tv' | 'typing' | 'voices' | 'fridgeHum' | 'breath' | 'workout' | 'eating';
export type OneShotId = 'footstep' | 'doorOpen' | 'doorClose' | 'fridgeOpen' | 'flush' | 'pay' | 'notify' | 'click';

interface LoopHandle {
  stop: () => void;
}

const MUTE_KEY = 'the-human.muted';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly loops = new Map<LoopId, LoopHandle>();
  private wanted = new Set<LoopId>();
  muted: boolean;

  constructor() {
    let stored = false;
    try {
      stored = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      // Storage can be unavailable (private mode); sound simply starts unmuted.
    }
    this.muted = stored;
    const unlock = (): void => {
      this.ensure();
      void this.ctx?.resume();
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Ignore: the choice just is not remembered.
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);
    // Two seconds of white noise, reused by every noisy sound.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    // Start loops requested before the first tap.
    for (const id of this.wanted) this.startLoop(id);
    return ctx;
  }

  private noiseSource(): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noise) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  private filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  private gain(v: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = v;
    return g;
  }

  /** Makes exactly these loops play (others fade out). */
  setLoops(ids: Iterable<LoopId>): void {
    const next = new Set(ids);
    this.wanted = next;
    for (const [id, h] of this.loops) {
      if (!next.has(id)) {
        h.stop();
        this.loops.delete(id);
      }
    }
    for (const id of next) if (!this.loops.has(id)) this.startLoop(id);
  }

  private startLoop(id: LoopId): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.loops.has(id)) return;
    const out = this.gain(0);
    out.connect(this.master);
    const nodes: AudioScheduledSourceNode[] = [];
    const timers: number[] = [];
    const level = LOOP_LEVEL[id];
    out.gain.setTargetAtTime(level, ctx.currentTime, 0.15);

    const noiseInto = (...chain: AudioNode[]): void => {
      const src = this.noiseSource();
      if (!src) return;
      let node: AudioNode = src;
      for (const c of chain) {
        node.connect(c);
        node = c;
      }
      node.connect(out);
      src.start(ctx.currentTime, Math.random() * 1.5);
      nodes.push(src);
    };
    /** Repeats short noise bursts at random intervals (clicks, crunches, crackles, steps). */
    const bursts = (minMs: number, maxMs: number, play: () => void): void => {
      const tick = (): void => {
        play();
        timers.push(window.setTimeout(tick, minMs + Math.random() * (maxMs - minMs)));
      };
      tick();
    };

    switch (id) {
      case 'water':
        noiseInto(this.filter('highpass', 600), this.filter('bandpass', 2200, 0.4));
        break;
      case 'flame':
        noiseInto(this.filter('lowpass', 380));
        break;
      case 'sizzle':
        noiseInto(this.filter('highpass', 3500), this.gain(0.5));
        bursts(25, 120, () => this.burst(out, 'highpass', 2500 + Math.random() * 3000, 0.02, 0.4 + Math.random() * 0.6));
        break;
      case 'fridgeHum': {
        const o = ctx.createOscillator();
        o.frequency.value = 55;
        o.connect(this.gain(0.6)).connect(out);
        o.start();
        nodes.push(o);
        break;
      }
      case 'breath': {
        // Slow breathing: low noise swelling every ~4 s.
        const amp = this.gain(0);
        noiseInto(this.filter('lowpass', 500), amp);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.25;
        const depth = this.gain(0.5);
        lfo.connect(depth).connect(amp.gain);
        amp.gain.value = 0.5;
        lfo.start();
        nodes.push(lfo);
        break;
      }
      case 'typing':
        bursts(70, 260, () => this.burst(out, 'highpass', 3000, 0.012, 0.6 + Math.random() * 0.4));
        break;
      case 'eating':
        bursts(250, 900, () => this.burst(out, 'bandpass', 1500 + Math.random() * 1500, 0.05, 0.7));
        break;
      case 'workout':
        bursts(330, 380, () => this.thump(out, 0.9));
        break;
      case 'tv':
      case 'voices': {
        // Speech-like babble: a buzzy voice through moving formants, gated into syllables.
        const voice = ctx.createOscillator();
        voice.type = 'sawtooth';
        voice.frequency.value = id === 'tv' ? 150 : 190;
        const formant = this.filter('bandpass', 900, 3);
        const gate = this.gain(0);
        voice.connect(formant).connect(gate).connect(out);
        voice.start();
        nodes.push(voice);
        bursts(90, 260, () => {
          const t = ctx.currentTime;
          voice.frequency.setTargetAtTime(120 + Math.random() * 140, t, 0.05);
          formant.frequency.setTargetAtTime(500 + Math.random() * 1600, t, 0.03);
          gate.gain.setTargetAtTime(Math.random() < 0.25 ? 0 : 0.5 + Math.random() * 0.5, t, 0.02);
        });
        if (id === 'tv') noiseInto(this.filter('bandpass', 3000, 0.5), this.gain(0.15)); // a little hiss
        break;
      }
    }

    this.loops.set(id, {
      stop: () => {
        timers.forEach((t) => window.clearTimeout(t));
        const t = ctx.currentTime;
        out.gain.setTargetAtTime(0, t, 0.12);
        window.setTimeout(() => {
          nodes.forEach((n) => {
            try {
              n.stop();
            } catch {
              // Already stopped.
            }
          });
          out.disconnect();
        }, 700);
      },
    });
  }

  /** A short filtered noise burst. */
  private burst(dest: AudioNode, type: BiquadFilterType, freq: number, dur: number, vol: number): void {
    const ctx = this.ctx;
    const src = this.noiseSource();
    if (!ctx || !src) return;
    const g = this.gain(0);
    src.loop = false;
    src.connect(this.filter(type, freq, 1)).connect(g).connect(dest);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.start(t, Math.random() * 1.5, dur + 0.02);
  }

  /** A soft low thump (footstep, landing). */
  private thump(dest: AudioNode, vol: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.frequency.value = 90 + Math.random() * 30;
    const g = this.gain(0);
    o.connect(g).connect(dest);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    o.start(t);
    o.stop(t + 0.1);
    this.burst(dest, 'lowpass', 900, 0.04, vol * 0.4);
  }

  play(id: OneShotId): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const out = this.master;
    const t = ctx.currentTime;
    switch (id) {
      case 'footstep':
        this.thump(out, 0.12);
        break;
      case 'doorOpen':
      case 'doorClose': {
        // Wooden creak: a rough tone sliding in pitch, then a soft knock when closing.
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        const g = this.gain(0);
        o.connect(this.filter('bandpass', 700, 6)).connect(g).connect(out);
        const [f0, f1] = id === 'doorOpen' ? [220, 380] : [360, 200];
        o.frequency.setValueAtTime(f0, t);
        o.frequency.linearRampToValueAtTime(f1, t + 0.45);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.06, t + 0.05);
        g.gain.linearRampToValueAtTime(0, t + 0.5);
        o.start(t);
        o.stop(t + 0.55);
        if (id === 'doorClose') window.setTimeout(() => this.thump(out, 0.35), 420);
        break;
      }
      case 'fridgeOpen':
        this.burst(out, 'lowpass', 700, 0.15, 0.4); // seal pop
        break;
      case 'flush': {
        const src = this.noiseSource();
        if (!src) return;
        const f = this.filter('lowpass', 300);
        const g = this.gain(0);
        src.connect(f).connect(g).connect(out);
        f.frequency.setValueAtTime(300, t);
        f.frequency.linearRampToValueAtTime(2200, t + 0.8);
        f.frequency.linearRampToValueAtTime(500, t + 2.6);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.5, t + 0.4);
        g.gain.linearRampToValueAtTime(0, t + 2.8);
        src.start(t);
        src.stop(t + 3);
        break;
      }
      case 'pay':
      case 'notify':
      case 'click': {
        const notes = id === 'pay' ? [988, 1319] : id === 'notify' ? [660, 880] : [1200];
        notes.forEach((f, i) => {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = f;
          const g = this.gain(0);
          o.connect(g).connect(out);
          const s = t + i * 0.09;
          g.gain.setValueAtTime(0, s);
          g.gain.linearRampToValueAtTime(id === 'click' ? 0.05 : 0.12, s + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, s + 0.25);
          o.start(s);
          o.stop(s + 0.3);
        });
        break;
      }
    }
  }
}

const LOOP_LEVEL: Record<LoopId, number> = {
  water: 0.35,
  flame: 0.25,
  sizzle: 0.12,
  fridgeHum: 0.05,
  breath: 0.12,
  typing: 0.25,
  eating: 0.3,
  workout: 0.25,
  tv: 0.06,
  voices: 0.05,
};
