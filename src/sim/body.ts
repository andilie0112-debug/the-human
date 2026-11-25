// Body composition that changes slowly with eating and exercise. muscle and fat are 0..1
// and drive the character's body-shape morphs in the renderer.

export interface BodyConfig {
  fatNeutralFullness: number;
  fatPerDayAtFullStomach: number;
  fatBurnPerExerciseHour: number;
  musclePerExerciseHour: number;
  muscleLossPerDay: number;
  traitSportyExerciseFactor: number;
}

export interface BodyState {
  muscle: number;
  fat: number;
}

export interface DayActivity {
  /** Average "kenyang" (fullness) over the day, 0..100: a proxy for how much was eaten. */
  averageFullness: number;
  exerciseHours: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Applies one day of eating and exercise to the body. Mutates and returns `b`. */
export function updateBodyDaily(b: BodyState, day: DayActivity, traits: readonly string[], cfg: BodyConfig): BodyState {
  const sporty = traits.includes('sporty') ? cfg.traitSportyExerciseFactor : 1;
  const exercise = day.exerciseHours * sporty;
  const surplus = (day.averageFullness - cfg.fatNeutralFullness) / (100 - cfg.fatNeutralFullness);
  b.fat = clamp01(b.fat + surplus * cfg.fatPerDayAtFullStomach - exercise * cfg.fatBurnPerExerciseHour);
  b.muscle = clamp01(b.muscle + exercise * cfg.musclePerExerciseHour - cfg.muscleLossPerDay);
  return b;
}
