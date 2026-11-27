import type { Scene } from 'three';
import { HAIRSTYLES, HUMAN_SKIN_TONES, HumanModel, type HumanLook } from '../../characters/humanModel';
import { WORSHIP } from '../../characters/routines';
import { quality } from '../../engine/graphics';
import type { WorshipPhase } from '../../sim/worship';
import type { WorshipLayout } from './worship';
import { separate } from '../separation';

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
  private readonly people: { model: HumanModel; sit: boolean; leader: boolean; leaving?: number }[] = [];
  private spawned = false;
  private phase: WorshipPhase = 'none';

  constructor(
    private readonly scene: Scene,
    private readonly layout: WorshipLayout,
    private readonly religion: string,
    private readonly state: () => CongregationState,
    /** The door: after the service people get up and walk out. */
    private readonly exit: { x: number; z: number } = { x: 0, z: 6 },
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

  private readonly bodies: { x: number; z: number }[] = [];
  /** People doing wudhu at the taps before the prayer (mosque only). */
  private readonly ablution: HumanModel[] = [];
  private ablutionTime = 0;

  /** Before the congregational prayer two men take wudhu at the taps, step by step. */
  private updateAblution(dt: number): void {
    const want = this.religion === 'islam' && this.phase === 'gathering';
    if (want && this.ablution.length === 0 && this.layout.taps.length > 1) {
      this.ablution.push(null as unknown as HumanModel);
      for (const tap of this.layout.taps.slice(1, 3)) {
        void HumanModel.load(worshipLook('islam', 'male', null) as HumanLook).then((m) => {
          if (this.phase !== 'gathering') {
            m.dispose();
            return;
          }
          m.root.position.set(tap.x - 0.45, 0, tap.z);
          m.root.rotation.y = Math.PI / 2; // facing the taps on the wall
          m.play('Idle_Loop', 0, 0.5);
          m.setGesture('washHands');
          this.scene.add(m.root);
          this.ablution.push(m);
        });
      }
    }
    if (!want && this.ablution.length) {
      for (const m of this.ablution) m?.dispose();
      this.ablution.length = 0;
    }
    if (!this.ablution.length) return;
    // Hands, mouth, face, arms, head, then feet, over and over.
    this.ablutionTime += dt;
    const order = ['washHands', 'toMouth', 'washFace', 'washArms', 'wipeHead', 'washHands'] as const;
    const i = Math.floor(this.ablutionTime / 2.5) % order.length;
    for (const m of this.ablution) {
      if (!m) continue;
      m.setGesture(order[i]);
      m.play(i === order.length - 1 ? 'Crouch_Idle_Loop' : 'Idle_Loop', 0.3, 0.5);
      m.update(dt);
    }
  }

  /** Where everyone is now (reused array). */
  positions(): readonly { x: number; z: number }[] {
    this.bodies.length = 0;
    for (const p of this.people) this.bodies.push(p.model.root.position);
    return this.bodies;
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
      const wasService = this.phase === 'service';
      this.phase = s.phase;
      for (const p of this.people) this.applyPhase(p);
      // The service is over: one by one they get up and go home (the leader stays a while).
      if (wasService && s.phase === 'none') this.people.forEach((p, i) => (p.leaving = p.leader ? 30 : 1 + i * 0.8));
    }
    // Ready for the next service.
    if (s.phase === 'none' && this.spawned && this.people.length === 0) this.spawned = false;
    this.updateAblution(dt);
    const f = this.routineFraction();
    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i];
      if (p.leaving !== undefined) {
        p.leaving -= dt;
        if (p.leaving <= 0 && this.walkOut(p, dt)) {
          p.model.root.removeFromParent();
          p.model.dispose();
          this.people.splice(i, 1);
          continue;
        }
        p.model.update(dt);
        continue;
      }
      if (this.phase === 'service' && !p.sit && !(p.leader && (this.layout.leader?.role === 'pendeta' || this.layout.leader?.role === 'pastor'))) p.model.setRoutineProgress(f);
      p.model.update(dt);
    }
    // Walking out in a line rather than through each other (those still in place stay put).
    if (this.people.some((p) => p.leaving !== undefined && p.leaving <= 0)) {
      separate(this.positions(), dt, (i) => { const p = this.people[i]; return p.leaving === undefined || p.leaving > 0; });
    }
  }

  /** Walks towards the door; true once out. */
  private walkOut(p: { model: HumanModel; sit: boolean }, dt: number): boolean {
    const r = p.model.root;
    if (p.sit) {
      p.sit = false;
      p.model.playOnce('Sitting_Exit', () => undefined);
      return false;
    }
    const dx = this.exit.x - r.position.x;
    const dz = this.exit.z - r.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.8) return true;
    r.position.x += (dx / d) * 1.1 * dt;
    r.position.z += (dz / d) * 1.1 * dt;
    r.rotation.y = Math.atan2(dx, dz);
    p.model.play('Walk_Loop', 0.3, 1.1 / 0.94);
    return false;
  }

  private applyPhase(p: { model: HumanModel; sit: boolean; leader: boolean }): void {
    const m = p.model;
    const role = p.leader ? this.layout.leader?.role : null;
    if (this.phase !== 'service') {
      m.setRoutine(null);
      m.holdProp(null);
      m.setGesture(null);
      if (!p.sit) m.play('Idle_Loop', 0.4);
      return;
    }
    if (role === 'pendeta' || role === 'pastor') {
      m.play('Idle_Talking_Loop', 0.4);
      return;
    }
    if (p.sit) {
      // In the pews, everyone follows the hymn in their book.
      if (this.religion === 'kristen' || this.religion === 'katolik') {
        m.holdProp('buku');
        m.setGesture('read');
      }
      return;
    }
    m.play('Idle_Loop', 0.4, 0.4);
    m.setRoutine(WORSHIP[this.religion] ?? null);
  }

  dispose(): void {
    for (const m of this.ablution) m?.dispose();
    for (const p of this.people) p.model.dispose();
  }
}
