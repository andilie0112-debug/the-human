// Church music for services: hymn tunes that are in the public domain (all written before 1900),
// played as an organ with a wordless choir ("aah") singing the melody. No lyrics are used.
//   OLD HUNDREDTH (Genevan Psalter, 1551) - "Doxology"
//   NEW BRITAIN (1829/1835) - "Amazing Grace"
//   NICAEA (J. B. Dykes, 1861) - "Holy, Holy, Holy"
//   HYMN TO JOY (Beethoven, 1824) - "Joyful, Joyful"
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

const freq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** Schedules one verse of a hymn from `start`; returns its length in seconds. */
export function scheduleHymn(ctx: AudioContext, out: AudioNode, start: number, index: number): number {
  const tune = TUNES[index % TUNES.length];
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
