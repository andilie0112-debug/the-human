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
  /** Conversation topics this person likes and dislikes (filled in on first talk for old saves). */
  likes?: string[];
  dislikes?: string[];
  /** Reactions the player has already seen, by topic id. */
  known?: Record<string, TopicReaction>;
}

export type TopicReaction = 'like' | 'dislike' | 'neutral';

export interface Topic {
  id: string;
  icon: string;
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
  topicLike: number;
  topicNeutral: number;
  topicDislike: number;
  visitChance: number;
  visitHour: number;
  visitWaitMinutes: number;
  visitMinRelationship: number;
  topics: Topic[];
}

/** Relationship levels: 0 orang asing, 1 kenalan, 2 teman, 3 teman baik, 4 sahabat. */
export const LEVEL_THRESHOLDS = [0, 15, 35, 60, 85] as const;

export function relLevel(relationship: number): number {
  let lv = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) if (relationship >= LEVEL_THRESHOLDS[i]) lv = i;
  return lv;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Gives a person two liked and one disliked topic, fixed by their id (so old saves agree). */
export function ensureTopics(n: Npc, topics: readonly Topic[]): void {
  if (n.likes && n.dislikes) return;
  const ids = topics.map((t) => t.id);
  let h = hash(n.id);
  const pick = (): string => {
    const i = h % ids.length;
    h = Math.floor(h / ids.length) + 7919;
    return ids.splice(i, 1)[0];
  };
  n.likes = [pick(), pick()];
  n.dislikes = [pick()];
}

export function reactionTo(n: Npc, topicId: string): TopicReaction {
  if (n.likes?.includes(topicId)) return 'like';
  if (n.dislikes?.includes(topicId)) return 'dislike';
  return 'neutral';
}

export interface NameData {
  male: string[];
  female: string[];
  family: string[];
}

const DAY = 24 * 60;

export function makeNpc(id: string, names: NameData, rng: () => number, role: NpcRole, relationship: number, now: number, fixedGender?: 'male' | 'female'): Npc {
  const gender = fixedGender ?? (rng() < 0.5 ? 'male' : 'female');
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
