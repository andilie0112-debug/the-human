// Original generative music with the Web Audio API (no audio files): warm plucked chords, a soft
// bass and a pentatonic metallophone melody with a light gamelan colour.
//   menu    - calm loop for the title screen
//   welcome - a short bright tune when arriving home

export type Track = 'menu' | 'welcome';

const MIDI = (n: number): number => 440 * 2 ** ((n - 69) / 12);

interface Chord {
  root: number;
  notes: number[];
}

// D major: I - vi - IV - V (menu), I - V - vi - IV (welcome). MIDI note numbers.
const PROG: Record<Track, Chord[]> = {
  menu: [
    { root: 50, notes: [62, 66, 69, 74] },
    { root: 47, notes: [59, 62, 66, 71] },
    { root: 43, notes: [59, 62, 67, 71] },
    { root: 45, notes: [61, 64, 69, 73] },
  ],
  welcome: [
    { root: 50, notes: [62, 66, 69, 74] },
    { root: 45, notes: [61, 64, 69, 73] },
    { root: 47, notes: [59, 62, 66, 71] },
    { root: 43, notes: [59, 62, 67, 71] },
  ],
};
/** D major pentatonic (D E F# A B) for the melody. */
const PENTA = [74, 76, 78, 81, 83, 86, 88];

export class Music {
  private timer: number | null = null;
  private readonly out: GainNode;
  private step = 0;
  private next = 0;
  private melodyIdx = 2;

  constructor(private readonly ctx: AudioContext, dest: AudioNode, private readonly track: Track) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.out.gain.setTargetAtTime(track === 'menu' ? 0.32 : 0.38, ctx.currentTime, 0.6);
    this.next = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 100);
    this.schedule();
  }

  /** Eighth notes: 92 bpm for the menu, 112 for the welcome tune. */
  private get eighth(): number {
    return 60 / (this.track === 'menu' ? 92 : 112) / 2;
  }

  private schedule(): void {
    const ctx = this.ctx;
    const total = this.track === 'welcome' ? 8 * 8 : Infinity; // welcome: 8 bars of 8 eighths
    while (this.next < ctx.currentTime + 0.35 && this.step < total) {
      this.playStep(this.step, this.next);
      this.step++;
      this.next += this.eighth;
    }
    if (this.step >= total) this.stop(2.5);
  }

  private playStep(step: number, t: number): void {
    const prog = PROG[this.track];
    const bar = Math.floor(step / 8);
    const pos = step % 8;
    const chord = prog[bar % prog.length];
    // Bass on beats 1 and 3.
    if (pos === 0 || pos === 4) this.bass(MIDI(chord.root - 12 + (pos === 4 ? 7 : 0)), t);
    // Plucked arpeggio: up and down the chord.
    const order = [0, 1, 2, 3, 2, 1, 2, 3];
    this.pluck(MIDI(chord.notes[order[pos]]), t, pos === 0 ? 0.16 : 0.1);
    // Metallophone melody: a gentle random walk on the pentatonic scale.
    const play = this.track === 'welcome' ? pos % 2 === 0 : pos === 0 || pos === 3 || (pos === 6 && Math.random() < 0.6);
    if (play) {
      this.melodyIdx = Math.max(0, Math.min(PENTA.length - 1, this.melodyIdx + [-1, 0, 1, 1, -1, 2, -2][Math.floor(Math.random() * 7)]));
      this.metal(MIDI(PENTA[this.melodyIdx]), t, this.track === 'welcome' ? 0.11 : 0.07);
    }
    // Soft shaker on the off-beats.
    if (pos % 2 === 1) this.shaker(t, this.track === 'welcome' ? 0.05 : 0.025);
  }

  private env(t: number, peak: number, decay: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    g.connect(this.out);
    return g;
  }

  private pluck(f: number, t: number, vol: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 8, t);
    lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.6);
    o.connect(lp).connect(this.env(t, vol, 1.4));
    o.start(t);
    o.stop(t + 1.5);
  }

  private bass(f: number, t: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(this.env(t, 0.22, 1.2));
    o.start(t);
    o.stop(t + 1.3);
  }

  /** Bronze metallophone (saron-like): a few inharmonic partials. */
  private metal(f: number, t: number, vol: number): void {
    [1, 2.76, 5.4].forEach((p, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * p;
      o.connect(this.env(t, vol / (1 + i * 2), 1.8 / (1 + i)));
      o.start(t);
      o.stop(t + 2);
    });
  }

  private noise: AudioBuffer | null = null;
  private shaker(t: number, vol: number): void {
    const ctx = this.ctx;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    src.connect(hp).connect(this.env(t, vol, 0.08));
    src.start(t);
  }

  /** Fades out and stops scheduling. */
  stop(fade = 1): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, fade / 3);
    window.setTimeout(() => this.out.disconnect(), fade * 1000 + 500);
  }
}
