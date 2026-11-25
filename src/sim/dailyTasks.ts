// "Tugas hari ini": a short, friendly to-do list for the day, built from the simulation state.
// It is guidance only: nothing is punished for skipping (worship never is).

export type DoneTag = 'makan' | 'mandi' | 'ibadah' | 'kerja' | 'olahraga' | 'tidur' | 'belanja' | 'lamar';

export interface TaskContext {
  done: ReadonlySet<DoneTag>;
  employed: boolean;
  workDay: boolean;
  /** Shift start hour when working today. */
  shiftStart?: number;
  fridgeItems: number;
  energy: number;
  sick: boolean;
}

export interface DailyTask {
  id: DoneTag | 'berobat';
  labelKey: string;
  params?: Record<string, string | number>;
  done: boolean;
}

export function dailyTasks(c: TaskContext): DailyTask[] {
  const t = (id: DailyTask['id'], labelKey: string, done: boolean, params?: DailyTask['params']): DailyTask => ({ id, labelKey, done, params });
  const out: DailyTask[] = [];
  if (c.employed && c.workDay) out.push(t('kerja', 'task.work', c.done.has('kerja'), { hour: String(c.shiftStart ?? 8).padStart(2, '0') }));
  if (!c.employed) out.push(t('lamar', 'task.apply', c.done.has('lamar')));
  out.push(t('ibadah', 'task.worship', c.done.has('ibadah')));
  out.push(t('makan', 'task.eat', c.done.has('makan')));
  out.push(t('mandi', 'task.shower', c.done.has('mandi')));
  if (c.fridgeItems === 0 || c.done.has('belanja')) out.push(t('belanja', 'task.shop', c.done.has('belanja')));
  if (c.sick) out.push(t('berobat', 'task.doctor', false));
  if (c.energy < 35 || c.done.has('tidur')) out.push(t('tidur', 'task.sleep', c.done.has('tidur')));
  return out;
}
