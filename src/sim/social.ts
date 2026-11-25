// NPC relationships: contacts, chatting, hanging out, dating, proposing and weddings.

export type NpcRole = 'keluarga' | 'tetangga' | 'rekan' | 'kenalan';

export interface Npc {
  id: string;
  name: string;
  gender: 'male' | 'female';
  role: NpcRole;
  /** 0..100 */
  relationship: number;
  /** Game minute when dating started. */
  datingSince: number | null;
  engaged: boolean;
  spouse: boolean;
  lastContact: number;
}

export type SocialAction = 'chat' | 'call' | 'hangout' | 'confess' | 'propose';

export interface SocialConfig {
  chatGain: number;
  callGain: number;
  hangoutGain: number;
  hangoutCost: number;
  confessMin: number;
  proposeMin: number;
  proposeDatingDays: number;
  decayPerDay: number;
  decayAfterDays: number;
  meetChance: number;
  weddingKuaCost: number;
  weddingAdatCost: number;
}

export interface NameData {
  male: string[];
  female: string[];
  family: string[];
}

const DAY = 24 * 60;

export function makeNpc(id: string, names: NameData, rng: () => number, role: NpcRole, relationship: number, now: number): Npc {
  const gender = rng() < 0.5 ? 'male' : 'female';
  const first = names[gender][Math.floor(rng() * names[gender].length)];
  const family = names.family[Math.floor(rng() * names.family.length)];
  return { id, name: `${first} ${family}`, gender, role, relationship, datingSince: null, engaged: false, spouse: false, lastContact: now };
}

/** Why a social action is not possible with this person right now, or null. */
export function socialBlock(n: Npc, a: SocialAction, cfg: SocialConfig, now: number, opts: { balance: number; hasPartner: boolean }): 'money' | 'relationship' | 'family' | 'partner' | 'time' | null {
  if (a === 'hangout' && opts.balance < cfg.hangoutCost) return 'money';
  if (a === 'confess') {
    if (n.role === 'keluarga') return 'family';
    if (n.datingSince !== null || n.spouse) return 'partner';
    if (opts.hasPartner) return 'partner';
    if (n.relationship < cfg.confessMin) return 'relationship';
  }
  if (a === 'propose') {
    if (n.datingSince === null || n.engaged || n.spouse) return 'partner';
    if (n.relationship < cfg.proposeMin) return 'relationship';
    if (now - n.datingSince < cfg.proposeDatingDays * DAY) return 'time';
  }
  return null;
}

/** Daily drift: relationships cool down without contact (family keeps a floor). */
export function decay(npcs: Npc[], cfg: SocialConfig, now: number): void {
  for (const n of npcs) {
    if (n.spouse) continue;
    if (now - n.lastContact > cfg.decayAfterDays * DAY) n.relationship = Math.max(n.role === 'keluarga' ? 50 : 0, n.relationship - cfg.decayPerDay);
  }
}
