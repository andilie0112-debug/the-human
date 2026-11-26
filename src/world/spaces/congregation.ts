import type { Scene } from 'three';
import { HAIRSTYLES, HUMAN_SKIN_TONES, HumanModel, type HumanLook } from '../../characters/humanModel';
import { WORSHIP } from '../../characters/routines';
import { quality } from '../../engine/graphics';
import type { WorshipPhase } from '../../sim/worship';
import type { WorshipLayout } from './worship';

// The people at a service: worshippers fill the rows when the service is near and pray together,
// in step with the one who leads (the imam at the mosque, the pendeta or pastor at church, the
// bhante at the vihara, the pemangku at the pura). Dressed for worship in each faith.

export interface CongregationState {
  phase: WorshipPhase;
  progress: number;
}

/** How many times the movements repeat over a whole service (four rakaat at the mosque...). */
const CYCLES: Record<string, number> = { islam: 4, kristen: 1, katolik: 2, hindu: 3, buddha: 3, konghucu: 3 };

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** Clothes for worship, per religion and role. */
export function worshipLook(religion: string, body: 'male' | 'female', role: string | null): Partial<HumanLook> {
  const skin = HUMAN_SKIN_TONES[Math.floor(Math.random() * HUMAN_SKIN_TONES.length)];
  const hair = pick(HAIRSTYLES[body]);
  const base: Partial<HumanLook> = { body, skinTone: skin, hair, hairColor: '#1a1310', shoeStyle: 'sandal', shoesColor: '#5a3a2a' };
  if (role === 'bhante') return { ...base, body: 'male', hair: 'Hair_Buzzed', topStyle: 'kemeja', longSleeve: true, shirtColor: '#d35400', bottomStyle: 'rokPanjang', pantsColor: '#ba4a00' };
  if (role === 'pastor') return { ...base, body: 'male', topStyle: 'kemeja', longSleeve: true, shirtColor: '#f4f6f7', bottomStyle: 'rokPanjang', pantsColor: '#f4f6f7', shoeStyle: 'pantofel' };
  if (role === 'pendeta') return { ...base, body: 'male', topStyle: 'jaket', longSleeve: true, shirtColor: '#1c1c1c', pantsColor: '#1c1c1c', shoeStyle: 'pantofel' };
  if (religion === 'islam') {
    if (body === 'female') return { ...base, hijab: true, hijabColor: '#ffffff', topStyle: 'kemeja', longSleeve: true, shirtColor: '#fdfefe', bottomStyle: 'rokPanjang', pantsColor: '#fdfefe' };
    return { ...base, peci: true, topStyle: 'kemeja', longSleeve: true, shirtColor: role === 'imam' ? '#ffffff' : pick(['#ffffff', '#d5f5e3', '#d6eaf8', '#f9e79f']), bottomStyle: 'sarung', pantsColor: pick(['#5d6d7e', '#1e8449', '#7b241c', '#2e4053']) };
  }
  if (religion === 'hindu') return { ...base, topStyle: 'kemeja', longSleeve: body === 'female', shirtColor: '#fdfefe', bottomStyle: body === 'female' ? 'rokPanjang' : 'sarung', pantsColor: pick(['#f4d03f', '#fdfefe', '#a04000']) };
  if (religion === 'kristen' || religion === 'katolik') return { ...base, topStyle: pick(['kemeja', 'batik']), longSleeve: true, shirtColor: pick(['#fdfefe', '#aed6f1', '#f5cba7', '#d2b4de']), bottomStyle: body === 'female' ? 'rokPanjang' : 'chino', pantsColor: pick(['#2e4053', '#1c1c1c', '#5d4037']), shoeStyle: 'pantofel', shoesColor: '#1c1a18' };
  return { ...base, topStyle: 'kemeja', shirtColor: pick(['#fdfefe', '#f5cba7', '#fad7a0']), bottomStyle: body === 'female' ? 'rokPanjang' : 'chino', pantsColor: '#5d4037' };
}

export class Congregation {
  private readonly people: { model: HumanModel; sit: boolean; leader: boolean }[] = [];
  private spawned = false;
  private phase: WorshipPhase = 'none';

  constructor(
    private readonly scene: Scene,
    private readonly layout: WorshipLayout,
    private readonly religion: string,
    private readonly state: () => CongregationState,
  ) {}

  private spawn(): void {
    this.spawned = true;
    const max = quality.current === 'low' ? 7 : 12;
    const spots = this.layout.crowd.slice(0, max);
    const add = (spot: { x: number; z: number; heading: number; sit?: boolean }, look: Partial<HumanLook>, leader: boolean): void => {
      void HumanModel.load(look as HumanLook).then((m) => {
        m.root.position.set(spot.x, 0, spot.z);
        m.root.rotation.y = spot.heading;
        if (spot.sit) m.play('Sitting_Idle_Loop', 0);
        else m.play('Idle_Loop', 0);
        this.scene.add(m.root);
        this.people.push({ model: m, sit: !!spot.sit, leader });
      });
    };
    // At the mosque the men pray in the front row and the women behind.
    spots.forEach((spot, i) => {
      const front = this.religion === 'islam' ? spot.z === spots[0].z : Math.random() < 0.5;
      const body: 'male' | 'female' = this.religion === 'islam' ? (front ? 'male' : 'female') : i % 2 ? 'female' : 'male';
      add(spot, worshipLook(this.religion, body, null), false);
    });
    const lead = this.layout.leader;
    if (lead) add(lead, worshipLook(this.religion, 'male', lead.role), true);
  }

  /** Whether a service is on now (to join it in step). */
  get inService(): boolean {
    return this.phase === 'service';
  }

  /** Where everyone is in the movements (0..1), so a newcomer can pray in step. */
  routineFraction(): number {
    const s = this.state();
    return (s.progress * (CYCLES[this.religion] ?? 1)) % 1;
  }

  update(dt: number): void {
    const s = this.state();
    if (s.phase !== 'none' && !this.spawned) this.spawn();
    if (s.phase !== this.phase) {
      this.phase = s.phase;
      for (const p of this.people) this.applyPhase(p);
    }
    const f = this.routineFraction();
    for (const p of this.people) {
      if (this.phase === 'service' && !p.sit && !(p.leader && (this.layout.leader?.role === 'pendeta' || this.layout.leader?.role === 'pastor'))) p.model.setRoutineProgress(f);
      p.model.update(dt);
    }
  }

  private applyPhase(p: { model: HumanModel; sit: boolean; leader: boolean }): void {
    const m = p.model;
    const role = p.leader ? this.layout.leader?.role : null;
    if (this.phase !== 'service') {
      m.setRoutine(null);
      if (!p.sit) m.play('Idle_Loop', 0.4);
      return;
    }
    if (role === 'pendeta' || role === 'pastor') {
      m.play('Idle_Talking_Loop', 0.4);
      return;
    }
    if (p.sit) return;
    m.play('Idle_Loop', 0.4, 0.4);
    m.setRoutine(WORSHIP[this.religion] ?? null);
  }

  dispose(): void {
    for (const p of this.people) p.model.dispose();
  }
}
