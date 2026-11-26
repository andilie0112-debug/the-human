import type { CharacterState } from '../sim/session';
import type { HumanLook } from './humanModel';

/** Renderer look for a simulated character (appearance + body composition). */
/** Mixes grey into the hair colour (aging). */
function greyed(hex: string, share: number): string {
  if (share <= 0) return hex;
  const n = parseInt(hex.replace('#', ''), 16);
  const mix = (c: number): number => Math.round(c + (0xb4 - c) * Math.min(1, share));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function lookFor(c: CharacterState): HumanLook {
  const a = c.appearance;
  return {
    body: c.gender,
    skinTone: a.skinTone,
    hair: a.hair,
    hairColor: greyed(a.hairColor, a.greyHair ?? 0),
    beard: a.beard,
    hijab: a.hijab,
    hijabColor: a.hijabColor,
    shirtColor: a.shirtColor,
    longSleeve: a.longSleeve,
    pantsColor: a.pantsColor,
    shorts: a.shorts,
    shoesColor: a.shoesColor,
    topStyle: a.topStyle,
    bottomStyle: a.bottomStyle,
    shoeStyle: a.shoeStyle,
    glasses: a.glasses,
    peci: a.peci && !a.hijab,
    height: a.height,
    muscle: c.body.muscle,
    fat: c.body.fat,
  };
}
