import type { CharacterState } from '../sim/session';
import type { HumanLook } from './humanModel';

/** Renderer look for a simulated character (appearance + body composition). */
export function lookFor(c: CharacterState): HumanLook {
  const a = c.appearance;
  return {
    body: c.gender,
    skinTone: a.skinTone,
    hair: a.hair,
    hairColor: a.hairColor,
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
