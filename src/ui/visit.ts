import type { Camera } from 'three';
import { fmt, t, tDynamic } from '../data/strings';
import { HAIRSTYLES, HUMAN_SKIN_TONES, HumanModel, type HumanLook } from '../characters/humanModel';
import type { KosRoom } from '../home/kosRoom';
import type { Point } from '../home/navGrid';
import { spotOf } from '../interaction/characterController';
import type { GameSession, SimEvent } from '../sim/session';
import { relLevel, type Npc } from '../sim/social';
import { simData } from '../sim/gameData';
import { getAudio } from '../engine/audio';
import { ThoughtBubble } from './thoughtBubble';

// A neighbour or friend comes to the door: let them in, talk about topics they like (speech
// bubbles above both heads), then they say goodbye and walk out.

export interface VisitHost {
  session: GameSession;
  room: KosRoom;
  /** The player's character, standing still for the visit. */
  player: () => HumanModel | null;
  /** Stops whatever the player was doing. */
  stopPlayer: () => void;
  showEvents: (events: SimEvent[]) => void;
  toast: (text: string) => void;
}

const WALK = 1.2;
const CLIP_WALK = 0.94;
const MAX_TOPICS = 5;
const REACTION_ICON = { like: '😄', dislike: '😒', neutral: '🙂' } as const;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The same person always looks the same. */
export function lookOf(n: Npc): HumanLook {
  const h = hash(n.id);
  const body = n.gender;
  const shirts = ['#c0392b', '#2e86c1', '#27ae60', '#f4d03f', '#8e44ad', '#ecf0f1', '#e67e22', '#34495e'];
  return {
    body,
    skinTone: HUMAN_SKIN_TONES[h % HUMAN_SKIN_TONES.length],
    hair: HAIRSTYLES[body][h % HAIRSTYLES[body].length],
    hairColor: '#1a1310',
    hijab: body === 'female' && h % 5 < 2,
    hijabColor: ['#efe8dc', '#d98880', '#5d6d7e', '#a9cce3'][h % 4],
    shirtColor: shirts[(h >> 3) % shirts.length],
    pantsColor: ['#2f3a52', '#4a3b2a', '#1c1c1c', '#5d6d7e'][(h >> 6) % 4],
    shoesColor: '#5a3a2a',
    shoeStyle: 'sandal',
  };
}

function angleLerp(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export class Visit {
  private guest: HumanModel | null = null;
  private npc: Npc | null = null;
  private path: Point[] = [];
  private onArrive: (() => void) | null = null;
  private faceTarget: Point | null = null;
  private panel: HTMLElement | null = null;
  private prompt: HTMLElement | null = null;
  private readonly guestBubble = new ThoughtBubble(document.body, 'wide');
  private readonly playerBubble = new ThoughtBubble(document.body, 'wide');
  private savedSpeed: 0 | 1 | 2 | 3 = 1;
  private talks = 0;
  private busy = false;
  /** True from the knock until the guest has left (the game keeps autonomy off meanwhile). */
  active = false;
  /** Keeps the front door open while the guest walks through. */
  doorOpen = false;

  constructor(private readonly host: VisitHost) {}

  /** Someone knocks: ask the player whether to let them in. */
  knock(npcId: string): void {
    const s = this.host.session;
    const npc = s.npcs.find((n) => n.id === npcId);
    if (!npc || this.active) return;
    this.active = true;
    this.savedSpeed = s.clock.speed === 0 ? 1 : s.clock.speed;
    s.clock.speed = 0;
    getAudio().play('knock');
    const back = document.createElement('div');
    back.className = 'dialog-backdrop';
    const box = document.createElement('div');
    box.className = 'dialog interview visit-knock';
    const text = document.createElement('p');
    text.className = 'interview-q';
    text.textContent = fmt(t('visit.knock'), { name: npc.name });
    const level = document.createElement('div');
    level.className = 'visit-level';
    level.textContent = `${tDynamic(`rel.lv${relLevel(npc.relationship)}`)} · ${fmt(t('soc.rel'), { n: Math.round(npc.relationship) })}`;
    const yes = document.createElement('button');
    yes.className = 'interview-a';
    yes.textContent = `🚪 ${t('visit.letIn')}`;
    const no = document.createElement('button');
    no.className = 'interview-a';
    no.textContent = t('visit.decline');
    yes.addEventListener('click', () => {
      back.remove();
      this.prompt = null;
      void this.letIn(npc);
    });
    no.addEventListener('click', () => {
      back.remove();
      this.prompt = null;
      this.host.showEvents(s.declineVisit());
      this.finish();
    });
    box.append(text, level, yes, no);
    back.append(box);
    document.body.append(back);
    this.prompt = back;
  }

  private async letIn(npc: Npc): Promise<void> {
    const { session: s, room } = this.host;
    s.acceptVisit();
    this.host.stopPlayer();
    this.npc = npc;
    const guest = await HumanModel.load(lookOf(npc));
    if (!this.active) {
      guest.dispose();
      return;
    }
    this.guest = guest;
    guest.root.position.set(room.outside.x, 0, room.outside.z);
    room.scene.add(guest.root);
    getAudio().play('doorOpen');
    this.doorOpen = true;
    const door = this.doorSpot();
    const meet = this.meetSpot(door);
    this.walk([door], () => {
      this.walk(room.nav.findPath(door, meet) ?? [meet], () => {
        this.doorOpen = false;
        getAudio().play('doorClose');
        this.startTalk();
      });
    });
  }

  private doorSpot(): Point {
    const { room } = this.host;
    for (const inst of room.instances.values()) if (inst.def.id === 'front_door') return spotOf(inst);
    return { x: room.outside.x, z: room.outside.z - 1.2 };
  }

  /** About a metre in front of the player, on the side the guest comes from. */
  private meetSpot(door: Point): Point {
    const p = this.host.player()?.root.position;
    if (!p) return door;
    const dx = door.x - p.x;
    const dz = door.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const k = Math.min(1.25, d * 0.8);
    return { x: p.x + (dx / d) * k, z: p.z + (dz / d) * k };
  }

  private walk(points: Point[], then: () => void): void {
    this.path = [...points];
    this.onArrive = then;
    this.faceTarget = null;
  }

  private startTalk(): void {
    const guest = this.guest;
    const player = this.host.player();
    if (!guest || !this.npc) return;
    if (player) {
      this.faceTarget = { x: player.root.position.x, z: player.root.position.z };
      const g = guest.root.position;
      player.root.rotation.y = Math.atan2(g.x - player.root.position.x, g.z - player.root.position.z);
      player.play('Idle_Talking_Loop', 0.3);
    }
    guest.play('Idle_Talking_Loop', 0.3);
    this.guestBubble.show('👋', 2.5);
    this.host.toast(`${this.npc.name}: “${t('visit.greet')}”`);
    this.showPanel();
  }

  private showPanel(): void {
    const npc = this.npc;
    if (!npc) return;
    const s = this.host.session;
    this.panel?.remove();
    const panel = document.createElement('div');
    panel.className = 'visit-panel';
    const title = document.createElement('div');
    title.className = 'visit-title';
    title.textContent = fmt(t('visit.title'), { name: npc.name });
    const level = document.createElement('div');
    level.className = 'visit-level';
    level.textContent = `${tDynamic(`rel.lv${relLevel(npc.relationship)}`)} · ${fmt(t('soc.rel'), { n: Math.round(npc.relationship) })}`;
    const bar = document.createElement('div');
    bar.className = 'visit-bar';
    const fill = document.createElement('div');
    fill.style.width = `${npc.relationship}%`;
    bar.append(fill);
    const pick = document.createElement('div');
    pick.className = 'visit-pick';
    pick.textContent = t('visit.pick');
    const row = document.createElement('div');
    row.className = 'visit-topics';
    for (const id of s.topicChoices(npc.id)) {
      const topic = simData.config.social.topics.find((x) => x.id === id);
      const b = document.createElement('button');
      b.className = 'visit-topic';
      const known = npc.known?.[id];
      b.innerHTML = `<span class="visit-icon">${topic?.icon ?? '💬'}</span><span>${tDynamic(`topic.${id}`)}</span>${known === 'like' ? '<span class="visit-known">💛</span>' : ''}`;
      b.disabled = this.busy;
      b.addEventListener('click', () => this.talk(id));
      row.append(b);
    }
    const bye = document.createElement('button');
    bye.className = 'visit-bye';
    bye.textContent = t('visit.bye');
    bye.disabled = this.busy;
    bye.addEventListener('click', () => this.leave());
    panel.append(title, level, bar, pick, row, bye);
    document.body.append(panel);
    this.panel = panel;
  }

  private talk(topicId: string): void {
    const npc = this.npc;
    const guest = this.guest;
    if (!npc || !guest || this.busy) return;
    this.busy = true;
    this.showPanel();
    const icon = simData.config.social.topics.find((x) => x.id === topicId)?.icon ?? '💬';
    this.playerBubble.show(icon, 2.6);
    this.host.player()?.play('Idle_Talking_Loop', 0.2);
    window.setTimeout(() => {
      if (!this.npc) return;
      const { reaction, events } = this.host.session.talkTopic(npc.id, topicId);
      this.guestBubble.show(`${icon}${REACTION_ICON[reaction]}`, 3.2);
      if (reaction === 'like') guest.playOnce('Yes', () => guest.play('Idle_Talking_Loop', 0.3));
      else if (reaction === 'dislike') {
        guest.play('Idle_No_Loop', 0.25);
        window.setTimeout(() => this.guest?.play('Idle_Talking_Loop', 0.3), 2200);
      }
      this.host.toast(fmt(t(`visit.${reaction}`), { name: npc.name, topic: tDynamic(`topic.${topicId}`) }));
      this.host.showEvents(events);
      this.talks++;
      window.setTimeout(() => {
        this.busy = false;
        if (this.talks >= MAX_TOPICS) this.leave();
        else this.showPanel();
      }, 1400);
    }, 1200);
  }

  private leave(): void {
    const npc = this.npc;
    if (!npc || !this.guest) return;
    this.panel?.remove();
    this.panel = null;
    this.guestBubble.show('👋', 2);
    this.host.toast(fmt(t('visit.leave'), { name: npc.name }));
    this.host.player()?.play('Idle_Loop', 0.4);
    this.host.session.endVisit();
    const door = this.doorSpot();
    const from = { x: this.guest.root.position.x, z: this.guest.root.position.z };
    this.walk(this.host.room.nav.findPath(from, door) ?? [door], () => {
      this.doorOpen = true;
      getAudio().play('doorOpen');
      this.walk([this.host.room.outside], () => {
        this.doorOpen = false;
        getAudio().play('doorClose');
        this.finish();
      });
    });
  }

  private finish(): void {
    if (this.guest) {
      this.guest.root.removeFromParent();
      this.guest.dispose();
    }
    this.guest = null;
    this.npc = null;
    this.path = [];
    this.onArrive = null;
    this.panel?.remove();
    this.panel = null;
    this.prompt?.remove();
    this.prompt = null;
    this.talks = 0;
    this.busy = false;
    this.doorOpen = false;
    this.active = false;
    this.host.session.clock.speed = this.savedSpeed;
  }

  /** Cancels the visit at once (leaving the house, loading a save). */
  cancel(): void {
    if (!this.active) return;
    this.host.session.endVisit();
    this.finish();
  }

  update(dt: number, camera: Camera): void {
    const guest = this.guest;
    if (guest) {
      const r = guest.root;
      const next = this.path[0];
      if (next) {
        const dx = next.x - r.position.x;
        const dz = next.z - r.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.04) {
          guest.play('Walk_Loop', 0.2, WALK / CLIP_WALK);
          r.rotation.y = angleLerp(r.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 8));
          const step = Math.min(dist, WALK * dt);
          r.position.x += (dx / dist) * step;
          r.position.z += (dz / dist) * step;
        } else {
          this.path.shift();
          if (this.path.length === 0) {
            guest.play('Idle_Loop', 0.25);
            const done = this.onArrive;
            this.onArrive = null;
            done?.();
          }
        }
      } else if (this.faceTarget) {
        r.rotation.y = angleLerp(r.rotation.y, Math.atan2(this.faceTarget.x - r.position.x, this.faceTarget.z - r.position.z), Math.min(1, dt * 6));
      }
      guest.update(dt);
      this.guestBubble.update(r, camera);
    }
    const player = this.host.player();
    if (player) this.playerBubble.update(player.root, camera);
  }
}
