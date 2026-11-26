// Church music for services: hymn tunes that are in the public domain (all written before 1900),
// played as an organ with a wordless choir ("aah") singing the melody. No lyrics are used.
//   OLD HUNDREDTH (Genevan Psalter, 1551) - "Doxology"
//   NEW BRITAIN (1829/1835) - "Amazing Grace"
//   NICAEA (J. B. Dykes, 1861) - "Holy, Holy, Holy"
//   HYMN TO JOY (Beethoven, 1824) - "Joyful, Joyful"
// For Catholic mass:
//   ADESTE FIDELES (J. F. Wade, c. 1751) - "O Come, All Ye Faithful"
//   LOURDES HYMN (1870s) - "Immaculate Mary", with its "Ave, Ave" refrain
// Notes are MIDI numbers with lengths in beats; chords give the harmony under each bar.

type Note = [number, number];

interface Tune {
  name: string;
  bpm: number;
  melody: Note[];
  /** Root of the chord per melody note (MIDI), for the organ's left hand. */
  bass: number[];
}

const G3 = 55, C3 = 48, D3 = 50, E3 = 52, A3 = 57, F3 = 53;

const TUNES: Tune[] = [
  {
    name: 'OLD HUNDREDTH',
    bpm: 76,
    melody: [[67, 2], [67, 1], [66, 1], [64, 1], [62, 1], [67, 1], [69, 1], [71, 2], [71, 2], [71, 1], [71, 1], [69, 1], [67, 1], [72, 1], [71, 1], [69, 2], [67, 2], [69, 1], [71, 1], [69, 1], [67, 1], [64, 1], [66, 1], [67, 2], [74, 2], [71, 1], [67, 1], [69, 1], [72, 1], [71, 1], [69, 1], [67, 3]],
    bass: [G3, G3, D3, C3, G3, E3, D3, G3, G3, G3, E3, D3, E3, C3, G3, D3, G3, D3, G3, D3, E3, C3, D3, G3, G3, G3, E3, D3, A3, G3, D3, G3],
  },
  {
    name: 'NEW BRITAIN',
    bpm: 84,
    melody: [[62, 1], [67, 2], [71, 0.5], [67, 0.5], [71, 2], [69, 1], [67, 2], [64, 1], [62, 2], [62, 1], [67, 2], [71, 0.5], [67, 0.5], [71, 2], [69, 1], [74, 3], [71, 1], [74, 1.5], [71, 0.5], [74, 0.5], [71, 0.5], [67, 2], [62, 1], [64, 1.5], [67, 0.5], [67, 0.5], [64, 0.5], [62, 2], [62, 1], [67, 2], [71, 0.5], [67, 0.5], [71, 2], [69, 1], [67, 3]],
    bass: [G3, G3, G3, G3, G3, D3, C3, C3, G3, G3, G3, G3, G3, G3, D3, D3, G3, G3, G3, G3, G3, G3, G3, C3, C3, C3, C3, G3, G3, G3, G3, G3, G3, D3, G3],
  },
  {
    name: 'NICAEA',
    bpm: 72,
    melody: [[62, 1], [62, 1], [66, 1], [66, 1], [69, 2], [69, 2], [71, 1], [71, 1], [71, 1], [71, 1], [69, 2], [66, 2], [69, 1], [69, 1], [69, 1], [69, 1], [74, 2], [74, 1], [74, 1], [73, 2], [71, 1], [71, 1], [69, 3]],
    bass: [D3, D3, D3, D3, D3, D3, G3, E3, G3, G3, D3, D3, D3, D3, F3 + 1, D3, G3, G3, E3, A3, G3, A3, D3],
  },
  {
    name: 'HYMN TO JOY',
    bpm: 92,
    melody: [[64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1], [60, 1], [60, 1], [62, 1], [64, 1], [64, 1.5], [62, 0.5], [62, 2], [64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1], [60, 1], [60, 1], [62, 1], [64, 1], [62, 1.5], [60, 0.5], [60, 2]],
    bass: [C3, C3, F3, C3, C3, F3, C3, G3, C3, C3, G3, C3, C3, G3, G3, C3, C3, F3, C3, C3, F3, C3, G3, C3, C3, G3, C3, G3, C3, C3],
  },
];

/** Tunes sung at Catholic mass (also public domain). */
const MASS: Tune[] = [
  {
    name: 'ADESTE FIDELES',
    bpm: 80,
    melody: [[67, 1], [67, 2], [62, 1], [67, 1], [69, 2], [62, 2], [71, 1], [69, 1], [71, 1], [72, 1], [71, 2], [69, 1], [67, 1], [67, 2], [66, 1], [64, 1], [66, 1], [67, 1], [69, 1], [71, 1], [66, 2], [64, 1.5], [62, 0.5], [62, 3]],
    bass: [G3, G3, G3, G3, D3, D3, G3, D3, G3, C3, G3, D3, E3, C3, D3, C3, D3, G3, D3, G3, D3, A3, D3, D3],
  },
  {
    name: 'LOURDES HYMN',
    bpm: 96,
    melody: [[62, 1], [67, 1], [67, 1], [71, 1], [67, 1], [67, 1], [71, 1], [69, 1], [69, 1], [72, 1], [69, 1], [69, 1], [72, 1], [71, 1], [71, 1], [74, 1], [72, 1], [71, 1], [69, 3], [74, 2], [71, 1], [74, 2], [71, 1], [72, 1], [71, 1], [69, 1], [67, 3]],
    bass: [G3, G3, G3, G3, G3, G3, G3, D3, D3, D3, D3, D3, D3, G3, G3, G3, C3, G3, D3, G3, G3, G3, G3, C3, G3, D3, G3],
  },
];

const freq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** Schedules one verse of a hymn from `start`; returns its length in seconds. */
export function scheduleHymn(ctx: AudioContext, out: AudioNode, start: number, index: number, mass = false): number {
  const list = mass ? MASS : TUNES;
  const tune = list[index % list.length];
  const beat = 60 / tune.bpm;
  // A wordless choir: a buzzy tone through two vowel formants ("aah").
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.frequency.value = 750;
  f1.Q.value = 3;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.frequency.value = 1150;
  f2.Q.value = 4;
  const choir = ctx.createGain();
  choir.gain.value = 0.9;
  f1.connect(choir);
  f2.connect(choir);
  choir.connect(out);
  let t = start;
  tune.melody.forEach(([note, beats], i) => {
    const dur = beats * beat;
    const end = t + dur;
    // Choir voices on the melody, slightly detuned for a group sound.
    for (const detune of [-6, 0, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq(note);
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.08);
      g.gain.setValueAtTime(0.05, end - 0.08);
      g.gain.linearRampToValueAtTime(0, end);
      o.connect(g);
      g.connect(f1);
      g.connect(f2);
      o.start(t);
      o.stop(end + 0.02);
    }
    // Organ: the melody an octave up softly, and the chord (root, third, fifth) below.
    const root = tune.bass[i] ?? tune.bass[tune.bass.length - 1];
    const major = [0, 4, 7];
    const chord = [note, ...major.map((s) => root + s + 12), root];
    for (const m of chord) {
      const o = ctx.createOscillator();
      o.type = m === root ? 'triangle' : 'sine';
      o.frequency.value = freq(m);
      const g = ctx.createGain();
      const v = m === note ? 0.07 : 0.045;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.04);
      g.gain.setValueAtTime(v, end - 0.04);
      g.gain.linearRampToValueAtTime(0, end);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(end + 0.02);
    }
    t = end;
  });
  return t - start + beat;
}

export const HYMN_COUNT = TUNES.length;

/**
 * Buddhist recitation: the steady knock of the muyu (wooden fish) keeps time while voices recite
 * on one note, rising and falling slightly at the end of each line, with the bowl bell (qing)
 * struck at the start of each round. A traditional way of chanting, not a recorded song.
 */
export function scheduleRecitation(ctx: AudioContext, out: AudioNode, start: number): number {
  const beat = 60 / 104;
  const beats = 32;
  const knock = (t: number, accent: boolean): void => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(accent ? 520 : 470, t);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(accent ? 0.5 : 0.35, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.14);
  };
  const bell = (t: number): void => {
    for (const [f, v] of [[880, 0.12], [2280, 0.05], [3500, 0.03]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 4);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 4.1);
    }
  };
  // Voices: a buzz through a vowel formant, one syllable per beat on the reciting note.
  const vowel = ctx.createBiquadFilter();
  vowel.type = 'bandpass';
  vowel.Q.value = 2.5;
  vowel.connect(out);
  bell(start);
  for (let i = 0; i < beats; i++) {
    const t = start + i * beat;
    knock(t, i % 4 === 0);
    const lineEnd = i % 8 === 7;
    const note = lineEnd ? 55 : i % 8 === 6 ? 58 : 57;
    vowel.frequency.setValueAtTime(i % 2 ? 750 : 520, t);
    for (const detune of [-8, 0, 9]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq(note);
      o.detune.value = detune;
      const g = ctx.createGain();
      const len = beat * (lineEnd ? 1.6 : 0.9);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.03, t + 0.05);
      g.gain.setValueAtTime(0.03, t + len - 0.08);
      g.gain.linearRampToValueAtTime(0, t + len);
      o.connect(g).connect(vowel);
      o.start(t);
      o.stop(t + len + 0.02);
    }
  }
  return beats * beat;
}
