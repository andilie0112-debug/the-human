import type { Expression } from './face';

// Which face a character shows, from how they are doing (no rendering here, so it is testable).

export interface Feelings {
  /** 0..100 */
  mood: number;
  /** 0..100, higher is worse */
  stress: number;
  /** 0..100 */
  energy: number;
  sick: boolean;
}

export function expressionFor(f: Feelings): Expression {
  if (f.energy < 15) return 'sleepy';
  if (f.stress > 70) return 'angry';
  if (f.mood < 30 || f.sick) return 'sad';
  if (f.mood > 75) return 'happy';
  return 'neutral';
}
