import { fmt, tDynamic } from '../data/strings';
import type { Message } from '../sim/career';
import { rupiah } from './format';

/** Text of an inbox message; money parameters are formatted as rupiah, level keys translated. */
export function messageText(m: Message): string {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(m.params)) {
    if ((k === 'salary' || k === 'amount') && typeof v === 'number') params[k] = rupiah(v);
    else if (k === 'level' && typeof v === 'string') params[k] = tDynamic(v);
    else params[k] = v;
  }
  return fmt(tDynamic(m.textKey), params);
}
