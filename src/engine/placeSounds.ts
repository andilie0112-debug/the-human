import type { AudioEngine } from './audio';

// The sound of each public place, all synthesised (no recordings): the murmur of people and their
// footsteps on tiles everywhere, plus what belongs to the place. The station has its platform
// announcement chime and the commuter train coming in (rumble, wheel clacks, brakes, the door
// chime and the hiss of the doors, the motor whine as it leaves). The airport has rolling
// suitcases, the PA chime and jets outside. The mall plays soft background music, the market has
// sellers calling out, the gym its treadmills and clanking weights, the hospital its monitor
// beeps, the café cups and the espresso machine, the office typing and phones, the factory its
// machines. All tunes are original.

export type PlaceSoundId =
  | 'station' | 'airport' | 'hospital' | 'clinic' | 'cafe' | 'warung' | 'market' | 'gym' | 'mall'
  | 'police' | 'office' | 'factory' | 'counter' | 'minimarket';

export type PlaceEvent = 'trainApproach' | 'trainBrake' | 'trainDoors' | 'trainClose' | 'trainDepart' | 'paChime' | 'doorChime' | 'boarding';

interface Bed {
  out: GainNode;
  nodes: AudioScheduledSourceNode[];
  timers: number[];
}

/** Which bed a facility kind (and walk-in variant) uses. */
export function placeSoundFor(kind: string, variant?: string): PlaceSoundId | null {
  const v = variant ?? kind;
  switch (v) {
    case 'station': return 'station';
    case 'airport': return 'airport';
    case 'hospital': return 'hospital';
    case 'clinic': return 'clinic';
    case 'cafe': return 'cafe';
    case 'warung': return 'warung';
    case 'market': return 'market';
    case 'gym': return 'gym';
    case 'mall':
    case 'mall2': return 'mall';
    case 'police': return 'police';
    case 'work_office': return 'office';
    case 'work_factory': return 'factory';
    case 'work_counter': return 'counter';
    case 'minimarket': return 'minimarket';
    default: return null;
  }
}

/** Mall music: a slow, original four-chord loop (I - vi - IV - V in C) on soft electric piano. */
const CHORDS = [
  [261.63, 329.63, 392.0],
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [196.0, 246.94, 293.66],
];

export class PlaceSounds {
  private bed: Bed | null = null;
  private current: PlaceSoundId | null = null;

  constructor(private readonly engine: AudioEngine) {}

  private get g(): { ctx: AudioContext; master: GainNode; noise: AudioBuffer } | null {
    return this.engine.graph;
  }

  /** Starts the sound of a place (null: silence). The previous place fades out. */
  set(id: PlaceSoundId | null): void {
    if (id === this.current) return;
    this.current = id;
    this.stopBed();
    const g = this.g;
    if (!id || !g) return;
    const out = g.ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, g.ctx.currentTime, 0.6);
    out.connect(g.master);
    const bed: Bed = { out, nodes: [], timers: [] };
    this.bed = bed;
    this.build(id, bed);
  }

  private stopBed(): void {
    const b = this.bed;
    const g = this.g;
    this.bed = null;
    if (!b || !g) return;
    b.timers.forEach((t) => window.clearTimeout(t));
    b.out.gain.setTargetAtTime(0, g.ctx.currentTime, 0.3);
    window.setTimeout(() => {
      for (const n of b.nodes) {
        try {
          n.stop();
        } catch {
          // Already stopped.
        }
      }
      b.out.disconnect();
    }, 1500);
  }

  // --- Building blocks ----------------------------------------------------------------------

  /** Repeats `play` at random intervals while the bed lives. */
  private every(bed: Bed, minS: number, maxS: number, play: () => void, firstS = Math.random() * maxS): void {
    const tick = (): void => {
      if (this.bed !== bed) return;
      play();
      bed.timers.push(window.setTimeout(tick, (minS + Math.random() * (maxS - minS)) * 1000));
    };
    bed.timers.push(window.setTimeout(tick, firstS * 1000));
  }

  private gainNode(v: number, dest: AudioNode): GainNode {
    const g = this.g!.ctx.createGain();
    g.gain.value = v;
    g.connect(dest);
    return g;
  }

  private filt(type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
    const b = this.g!.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  /** Steady filtered noise (room tone, hum of a hall, machines). */
  private noiseBed(bed: Bed, type: BiquadFilterType, f: number, vol: number, q = 0.7): GainNode {
    const { ctx, noise } = this.g!;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const gain = this.gainNode(vol, bed.out);
    src.connect(this.filt(type, f, q)).connect(gain);
    src.start(ctx.currentTime, Math.random() * 1.5);
    bed.nodes.push(src);
    return gain;
  }

  /** A steady tone (electrical hum, motors). */
  private hum(bed: Bed, f: number, vol: number, type: OscillatorType = 'sine'): OscillatorNode {
    const { ctx } = this.g!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.connect(this.filt('lowpass', 400)).connect(this.gainNode(vol, bed.out));
    o.start();
    bed.nodes.push(o);
    return o;
  }

  /** Many people talking at once: a few babbling voices in the distance and the hall's air. */
  private murmur(bed: Bed, voices: number, vol: number): void {
    const { ctx } = this.g!;
    this.noiseBed(bed, 'bandpass', 700, vol * 0.5, 0.6);
    for (let i = 0; i < voices; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const base = i % 2 ? 105 + Math.random() * 30 : 190 + Math.random() * 40;
      o.frequency.value = base;
      const formant = this.filt('bandpass', 800, 2.5);
      const gate = ctx.createGain();
      gate.gain.value = 0;
      o.connect(formant).connect(gate).connect(this.gainNode(vol / voices, bed.out));
      o.start();
      bed.nodes.push(o);
      this.every(bed, 0.09, 0.3, () => {
        const t = ctx.currentTime;
        o.frequency.setTargetAtTime(base * (0.85 + Math.random() * 0.4), t, 0.05);
        formant.frequency.setTargetAtTime(400 + Math.random() * 1500, t, 0.03);
        // Pauses between sentences.
        gate.gain.setTargetAtTime(Math.random() < 0.3 ? 0 : 0.4 + Math.random() * 0.6, t, 0.03);
      });
    }
  }

  /** A short noise burst into the bed. */
  private burst(dest: AudioNode, type: BiquadFilterType, f: number, dur: number, vol: number, when = 0): void {
    const { ctx, noise } = this.g!;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const g = ctx.createGain();
    const t = ctx.currentTime + when;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(this.filt(type, f, 1)).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  /** A tone with a quick attack and decay (beeps, chimes, plucks). */
  private tone(dest: AudioNode, f: number, dur: number, vol: number, when = 0, type: OscillatorType = 'sine'): void {
    const { ctx } = this.g!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    const t = ctx.currentTime + when;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Struck metal or glass: a few inharmonic partials. */
  private clink(dest: AudioNode, f: number, vol: number, when = 0, decay = 0.35): void {
    [1, 2.76, 5.4].forEach((p, i) => this.tone(dest, f * p, decay / (1 + i * 0.7), vol / (i + 1), when));
  }

  /** Footsteps on a hard floor, near and far. */
  private steps(bed: Bed, rate: number, vol: number): void {
    this.every(bed, 0.2 / rate, 1.2 / rate, () => {
      const n = 2 + Math.floor(Math.random() * 4);
      const v = vol * (0.3 + Math.random() * 0.7);
      const pace = 0.45 + Math.random() * 0.15;
      for (let i = 0; i < n; i++) this.burst(this.bed!.out, 'bandpass', 2200 + Math.random() * 800, 0.05, v, i * pace);
    });
  }

  /** The announcement chime (an original rising four-note figure), then a voice speaking. */
  private pa(dest: AudioNode, vol: number, speak = true): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(dest, f, 0.9, vol, i * 0.28, 'triangle'));
    if (!speak) return;
    const { ctx } = this.g!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 210;
    const formant = this.filt('bandpass', 1000, 3);
    const tel = this.filt('highpass', 450);
    const gate = ctx.createGain();
    gate.gain.value = 0;
    o.connect(formant).connect(tel).connect(gate).connect(dest);
    const t0 = ctx.currentTime + 1.4;
    let t = t0;
    while (t < t0 + 3.5) {
      gate.gain.setTargetAtTime(Math.random() < 0.2 ? 0 : vol * 0.5, t, 0.02);
      formant.frequency.setTargetAtTime(500 + Math.random() * 1400, t, 0.03);
      o.frequency.setTargetAtTime(190 + Math.random() * 60, t, 0.05);
      t += 0.1 + Math.random() * 0.15;
    }
    gate.gain.setTargetAtTime(0, t, 0.05);
    o.start(t0);
    o.stop(t + 0.3);
  }

  /** Soft background music (mall, café): chords and a little melody, bar after bar. */
  private music(bed: Bed, vol: number, tempo: number): void {
    const bar = 240 / tempo;
    let i = 0;
    const out = this.gainNode(vol, bed.out);
    const lp = this.filt('lowpass', 1800);
    lp.connect(out);
    const playBar = (): void => {
      if (this.bed !== bed) return;
      const chord = CHORDS[i % CHORDS.length];
      for (const f of chord) {
        this.tone(lp, f, bar * 0.95, 0.12, 0, 'triangle');
        this.tone(lp, f / 2, bar * 0.5, 0.08, bar / 2, 'sine');
      }
      // A simple melody on the beats, from the chord's notes.
      for (let b = 0; b < 4; b++) if (Math.random() < 0.7) this.tone(lp, chord[Math.floor(Math.random() * 3)] * 2, bar / 4, 0.06, (b * bar) / 4 + 0.02, 'sine');
      i++;
      bed.timers.push(window.setTimeout(playBar, bar * 1000));
    };
    playBar();
  }

  /** A phone ringing on a desk (two rings). */
  private phone(dest: AudioNode, vol: number): void {
    for (let r = 0; r < 2; r++)
      for (let k = 0; k < 12; k++) {
        this.tone(dest, 1300, 0.04, vol, r * 2 + k * 0.08, 'square');
        this.tone(dest, 1600, 0.04, vol * 0.7, r * 2 + k * 0.08 + 0.04, 'square');
      }
  }

  // --- The places ---------------------------------------------------------------------------

  private build(id: PlaceSoundId, bed: Bed): void {
    const out = bed.out;
    switch (id) {
      case 'station':
        this.noiseBed(bed, 'lowpass', 300, 0.05); // the big hall
        this.murmur(bed, 4, 0.05);
        this.steps(bed, 1.4, 0.05);
        // Tap gates beeping as people go through.
        this.every(bed, 2, 6, () => this.tone(out, 1800, 0.12, 0.04));
        this.every(bed, 45, 80, () => this.pa(out, 0.07), 20);
        break;
      case 'airport':
        this.noiseBed(bed, 'lowpass', 250, 0.06);
        this.hum(bed, 120, 0.015); // air conditioning, escalators
        this.murmur(bed, 4, 0.05);
        this.steps(bed, 1.2, 0.04);
        // Rolling suitcases over the tiled joints.
        this.every(bed, 3, 8, () => {
          const n = 6 + Math.floor(Math.random() * 10);
          const v = 0.02 + Math.random() * 0.03;
          for (let i = 0; i < n; i++) this.burst(out, 'bandpass', 380, 0.12, v, i * 0.18);
        });
        // A jet taxiing or taking off outside the windows.
        this.every(bed, 25, 50, () => this.jet(out), 8);
        this.every(bed, 35, 70, () => this.pa(out, 0.07), 12);
        break;
      case 'hospital':
      case 'clinic':
        this.noiseBed(bed, 'lowpass', 500, 0.03);
        this.murmur(bed, 2, 0.03);
        this.steps(bed, 0.6, 0.03);
        // A patient monitor somewhere, and now and then a trolley.
        this.every(bed, 0.9, 1.1, () => this.tone(out, 980, 0.12, 0.012));
        this.every(bed, 15, 30, () => {
          for (let i = 0; i < 10; i++) this.burst(out, 'bandpass', 900, 0.1, 0.015, i * 0.15);
        });
        if (id === 'hospital') this.every(bed, 20, 40, () => this.pa(out, 0.05, false));
        break;
      case 'cafe':
        this.murmur(bed, 3, 0.04);
        this.music(bed, 0.6, 76);
        this.every(bed, 1.5, 5, () => this.clink(out, 2400 + Math.random() * 1200, 0.03));
        // The espresso machine: grinding, then the steam wand.
        this.every(bed, 18, 35, () => {
          for (let i = 0; i < 20; i++) this.burst(out, 'bandpass', 1200, 0.08, 0.02, i * 0.07);
          this.burst(out, 'highpass', 4000, 3.5, 0.03, 2);
        });
        break;
      case 'warung':
        this.murmur(bed, 3, 0.05);
        this.noiseBed(bed, 'highpass', 3500, 0.01); // the wok
        this.every(bed, 1, 4, () => this.clink(out, 1800 + Math.random() * 900, 0.03)); // plates, glasses
        this.every(bed, 6, 14, () => {
          // Spatula on the wok.
          for (let i = 0; i < 6; i++) this.clink(out, 700, 0.03, i * 0.22, 0.15);
        });
        break;
      case 'market':
        this.murmur(bed, 6, 0.08);
        this.steps(bed, 1, 0.03);
        // Sellers calling out: louder voices sweeping up.
        this.every(bed, 3, 8, () => this.call(out));
        // Plastic bags, a cleaver on a block.
        this.every(bed, 2, 6, () => this.burst(out, 'highpass', 5000, 0.25, 0.025));
        this.every(bed, 5, 12, () => {
          for (let i = 0; i < 4; i++) this.burst(out, 'lowpass', 600, 0.06, 0.08, i * 0.35);
        });
        break;
      case 'gym':
        this.hum(bed, 70, 0.03, 'sawtooth'); // treadmills
        this.noiseBed(bed, 'bandpass', 300, 0.02);
        this.music(bed, 0.4, 124);
        // The belt thumping under running feet.
        this.every(bed, 0.32, 0.36, () => this.burst(out, 'lowpass', 220, 0.06, 0.04));
        // Weights clanking.
        this.every(bed, 2, 6, () => this.clink(out, 420 + Math.random() * 200, 0.06, 0, 0.5));
        this.murmur(bed, 2, 0.02);
        break;
      case 'mall':
        this.noiseBed(bed, 'lowpass', 280, 0.05);
        this.hum(bed, 110, 0.01); // escalators
        this.murmur(bed, 5, 0.06);
        this.steps(bed, 1.4, 0.04);
        this.music(bed, 0.55, 92);
        this.every(bed, 50, 90, () => this.pa(out, 0.06), 25);
        break;
      case 'police':
      case 'office':
      case 'counter':
        this.noiseBed(bed, 'lowpass', 400, 0.03); // air conditioning
        this.murmur(bed, 2, 0.025);
        this.every(bed, 0.6, 2.5, () => {
          const n = 4 + Math.floor(Math.random() * 12);
          for (let i = 0; i < n; i++) this.burst(out, 'highpass', 3000, 0.02, 0.02, i * (0.08 + Math.random() * 0.1));
        });
        this.every(bed, 20, 45, () => this.phone(out, 0.015), 10);
        if (id === 'counter') this.every(bed, 6, 14, () => this.tone(out, 2100, 0.08, 0.03)); // scanner
        break;
      case 'factory':
        this.hum(bed, 50, 0.05, 'sawtooth');
        this.hum(bed, 100, 0.03, 'square');
        this.noiseBed(bed, 'bandpass', 900, 0.03);
        // A press stamping in a steady rhythm, conveyor rattle, air hissing.
        this.every(bed, 1.6, 1.6, () => {
          this.burst(out, 'lowpass', 200, 0.2, 0.15);
          this.clink(out, 300, 0.05, 0.02, 0.4);
        });
        this.every(bed, 6, 12, () => this.burst(out, 'highpass', 3000, 1.2, 0.04));
        break;
      case 'minimarket':
        this.hum(bed, 55, 0.03); // the drinks fridges
        this.music(bed, 0.4, 100);
        this.every(bed, 6, 14, () => this.tone(out, 2100, 0.08, 0.03)); // scanner at the till
        break;
    }
  }

  /** A seller calling out at the market. */
  private call(dest: AudioNode): void {
    const { ctx } = this.g!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f = 170 + Math.random() * 90;
    const formant = this.filt('bandpass', 900, 2);
    const g = ctx.createGain();
    o.connect(formant).connect(g).connect(dest);
    const t = ctx.currentTime;
    const n = 3 + Math.floor(Math.random() * 3);
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < n; i++) {
      const s = t + i * 0.28;
      o.frequency.setValueAtTime(f * (i === n - 1 ? 1.25 : 1 + Math.random() * 0.1), s);
      formant.frequency.setValueAtTime(600 + Math.random() * 900, s);
      g.gain.setTargetAtTime(0.05, s, 0.02);
      g.gain.setTargetAtTime(0.01, s + 0.2, 0.03);
    }
    g.gain.setTargetAtTime(0, t + n * 0.28 + 0.2, 0.08);
    o.start(t);
    o.stop(t + n * 0.28 + 0.8);
  }

  /** A jet passing outside: a roar that swells and fades, with a high whine. */
  private jet(dest: AudioNode): void {
    const { ctx, noise } = this.g!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const lp = this.filt('lowpass', 350);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0005, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 5);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 14);
    src.connect(lp).connect(g).connect(dest);
    src.start(t);
    src.stop(t + 14.5);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(1800, t);
    o.frequency.linearRampToValueAtTime(2300, t + 8);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0005, t);
    og.gain.exponentialRampToValueAtTime(0.006, t + 5);
    og.gain.exponentialRampToValueAtTime(0.0005, t + 12);
    o.connect(og).connect(dest);
    o.start(t);
    o.stop(t + 12.5);
  }

  /** Things that happen at a moment: the train, the door chime of a shop, a boarding call. */
  event(ev: PlaceEvent): void {
    const g = this.g;
    if (!g || !this.bed) return;
    const out = this.bed.out;
    const { ctx, noise } = g;
    const t = ctx.currentTime;
    switch (ev) {
      case 'paChime':
        this.pa(out, 0.08, false);
        break;
      case 'boarding':
        this.pa(out, 0.09);
        break;
      case 'doorChime':
        // Shop door: "ding-dong".
        this.tone(out, 880, 0.8, 0.06, 0, 'triangle');
        this.tone(out, 698.46, 1.0, 0.06, 0.35, 'triangle');
        break;
      case 'trainApproach': {
        // The horn far away, then the rumble growing with the wheels clacking over the joints.
        this.tone(out, 370, 0.7, 0.05, 0.5, 'sawtooth');
        this.tone(out, 466, 0.7, 0.04, 0.5, 'sawtooth');
        const src = ctx.createBufferSource();
        src.buffer = noise;
        src.loop = true;
        const lp = this.filt('lowpass', 260);
        const rg = ctx.createGain();
        rg.gain.setValueAtTime(0.0005, t);
        rg.gain.exponentialRampToValueAtTime(0.18, t + 5);
        rg.gain.exponentialRampToValueAtTime(0.0005, t + 9);
        src.connect(lp).connect(rg).connect(out);
        src.start(t);
        src.stop(t + 9.2);
        // Clack-clack pairs, slowing down as it brakes.
        let s = 1.2;
        let gap = 0.32;
        while (s < 8) {
          const v = 0.05 + 0.1 * Math.min(1, s / 5);
          this.burst(out, 'lowpass', 900, 0.05, v, s);
          this.burst(out, 'lowpass', 900, 0.05, v * 0.8, s + 0.09);
          s += gap;
          gap *= 1.08;
        }
        break;
      }
      case 'trainBrake':
        // Brakes squealing as it stops, then the air released.
        for (const f of [2900, 3600]) {
          const o = ctx.createOscillator();
          o.frequency.setValueAtTime(f, t);
          o.frequency.linearRampToValueAtTime(f * 0.97, t + 2);
          const og = ctx.createGain();
          og.gain.setValueAtTime(0, t);
          og.gain.linearRampToValueAtTime(0.012, t + 0.4);
          og.gain.exponentialRampToValueAtTime(0.0005, t + 2.2);
          o.connect(og).connect(out);
          o.start(t);
          o.stop(t + 2.3);
        }
        this.burst(out, 'highpass', 2500, 1.2, 0.06, 2.2);
        break;
      case 'trainDoors':
      case 'trainClose':
        // The door chime (three falling notes; repeated quickly when closing), then the doors hiss.
        for (let r = 0; r < (ev === 'trainClose' ? 3 : 1); r++)
          [1175, 988, 784].forEach((f, i) => this.tone(out, f, 0.35, 0.06, r * 0.75 + i * 0.2, 'triangle'));
        this.burst(out, 'highpass', 1800, 0.7, 0.07, ev === 'trainClose' ? 2.3 : 0.7);
        this.burst(out, 'lowpass', 300, 0.25, 0.08, ev === 'trainClose' ? 2.9 : 1.3); // the doors meet / stop
        break;
      case 'trainDepart': {
        // The traction motors whine up in steps while the rumble grows and fades away.
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(220, t);
        o.frequency.linearRampToValueAtTime(600, t + 3);
        o.frequency.setValueAtTime(400, t + 3);
        o.frequency.linearRampToValueAtTime(900, t + 7);
        const bp = this.filt('bandpass', 900, 3);
        const og = ctx.createGain();
        og.gain.setValueAtTime(0, t);
        og.gain.linearRampToValueAtTime(0.02, t + 1);
        og.gain.exponentialRampToValueAtTime(0.0005, t + 9);
        o.connect(bp).connect(og).connect(out);
        o.start(t);
        o.stop(t + 9.2);
        const src = ctx.createBufferSource();
        src.buffer = noise;
        src.loop = true;
        const rg = ctx.createGain();
        rg.gain.setValueAtTime(0.0005, t);
        rg.gain.exponentialRampToValueAtTime(0.15, t + 3);
        rg.gain.exponentialRampToValueAtTime(0.0005, t + 10);
        src.connect(this.filt('lowpass', 260)).connect(rg).connect(out);
        src.start(t);
        src.stop(t + 10.2);
        let s = 0.8;
        let gap = 0.9;
        while (s < 9) {
          this.burst(out, 'lowpass', 900, 0.05, 0.1 * Math.max(0.2, 1 - s / 9), s);
          this.burst(out, 'lowpass', 900, 0.05, 0.08 * Math.max(0.2, 1 - s / 9), s + 0.09);
          s += gap;
          gap = Math.max(0.2, gap * 0.85);
        }
        break;
      }
    }
  }
}
