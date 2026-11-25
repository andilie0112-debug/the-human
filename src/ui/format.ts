import { tDynamic } from '../data/strings';
import type { DateParts } from '../sim/time';

const rupiahFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

/** "Rp3.500.000" (negative: "-Rp100.000"). */
export function rupiah(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}Rp${rupiahFormat.format(Math.abs(Math.round(amount)))}`;
}

/** "Jumat, 1 Januari 2027" */
export function longDate(p: DateParts): string {
  return `${tDynamic(`day.${p.weekday}`)}, ${p.day} ${tDynamic(`month.${p.month}`)} ${p.year}`;
}

/** "07:05" */
export function clockTime(p: DateParts): string {
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
