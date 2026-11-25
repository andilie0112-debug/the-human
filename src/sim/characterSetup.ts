import { defaultCharacter, type CharacterState } from './session';

// Turns the choices made in the character creator into the starting simulation state.
// Pure data: appearance is stored here so it can be saved and restored (M6).

export type Gender = 'male' | 'female';

export interface Appearance {
  skinTone: string;
  hair: string;
  hairColor: string;
  beard: boolean;
  hijab: boolean;
  hijabColor?: string;
  shirtColor: string;
  longSleeve: boolean;
  pantsColor: string;
  shorts: boolean;
  shoesColor: string;
  /** Style choices (stage 2); older saves fall back to the defaults. */
  topStyle?: TopStyle;
  bottomStyle?: BottomStyle;
  shoeStyle?: ShoeStyle;
  glasses?: GlassesStyle;
  peci?: boolean;
  /** -1 (short) .. 1 (tall), around the average height. */
  height?: number;
}

export type TopStyle = 'kaos' | 'kemeja' | 'batik' | 'polo' | 'jaket';
export type BottomStyle = 'jeans' | 'chino' | 'pendek' | 'rok' | 'rokPanjang' | 'sarung';
export type ShoeStyle = 'sneakers' | 'sandal' | 'pantofel';
export type GlassesStyle = 'none' | 'bulat' | 'kotak' | 'hitam';

export interface StartOption {
  age: number;
  education: string;
  savings: number;
  experienceYears: number;
  motorbike: boolean;
}

export interface CharacterSetup {
  name: string;
  gender: Gender;
  startAge: number;
  religionId: string;
  fatherEthnicityId: string;
  motherEthnicityId: string;
  cityId: string;
  traits: string[];
  fastingEnabled: boolean;
  muscle: number;
  fat: number;
  appearance: Appearance;
}

export interface EthnicityData {
  id: string;
  homeCityIds: string[];
}

/** A perantau lives in a city that is not a home city of either parent's ethnicity. */
export function isPerantau(cityId: string, fatherEthnicity: string, motherEthnicity: string, ethnicities: readonly EthnicityData[]): boolean {
  const homes = new Set<string>();
  for (const id of [fatherEthnicity, motherEthnicity]) for (const c of ethnicities.find((e) => e.id === id)?.homeCityIds ?? []) homes.add(c);
  return !homes.has(cityId);
}

/** Traditions come from both parents (mixed parentage is supported). */
export function traditionsOf(setup: Pick<CharacterSetup, 'fatherEthnicityId' | 'motherEthnicityId'>): string[] {
  return [...new Set([setup.fatherEthnicityId, setup.motherEthnicityId])];
}

export function validateSetup(setup: CharacterSetup): string[] {
  const issues: string[] = [];
  if (setup.name.trim().length === 0) issues.push('name');
  if (setup.traits.length !== 2 || setup.traits[0] === setup.traits[1]) issues.push('traits');
  return issues;
}

export interface CreatedCharacter {
  character: CharacterState;
  savings: number;
  start: StartOption;
}

export function createCharacter(setup: CharacterSetup, startOptions: readonly StartOption[], ethnicities: readonly EthnicityData[]): CreatedCharacter {
  const start = startOptions.find((o) => o.age === setup.startAge) ?? startOptions[0];
  const c = defaultCharacter();
  c.name = setup.name.trim();
  c.gender = setup.gender;
  c.age = start.age;
  c.education = start.education;
  c.experienceYears = start.experienceYears;
  c.ownsMotorbike = start.motorbike;
  c.religionId = setup.religionId;
  c.ethnicities = traditionsOf(setup);
  c.cityId = setup.cityId;
  c.traits = [...setup.traits];
  c.fastingEnabled = setup.religionId === 'islam' && setup.fastingEnabled;
  c.perantau = isPerantau(setup.cityId, setup.fatherEthnicityId, setup.motherEthnicityId, ethnicities);
  c.body = { muscle: setup.muscle, fat: setup.fat };
  c.appearance = { ...setup.appearance, hijab: setup.gender === 'female' && setup.appearance.hijab, beard: setup.gender === 'male' && setup.appearance.beard };
  return { character: c, savings: start.savings, start };
}
