import type { HumanClip, HumanModel } from '../characters/humanModel';
import type { KosRoom, ObjectInstance } from '../home/kosRoom';
import type { Point } from '../home/navGrid';
import type { ActionBlock, ActionDef } from '../sim/actions';
import type { GameSession, SimEvent } from '../sim/session';

// Drives the character in the home: an action queue the player fills by tapping objects,
// walking with pathfinding, and entering/exiting the pose for each action. The simulation
// decides effects and duration; this class only moves and animates.

export interface QueueItem {
  instance: ObjectInstance;
  action: ActionDef;
  state: 'pending' | 'walking' | 'entering' | 'running' | 'exiting';
}

const WALK_SPEED = 1.15; // m/s
const TURN_RATE = 8;

function angleLerp(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** World position of an object's interaction spot. */
export function spotOf(inst: ObjectInstance): Point {
  const [sx, sz] = inst.def.spot;
  const c = Math.cos(inst.rot);
  const s = Math.sin(inst.rot);
  return { x: inst.x + sx * c + sz * s, z: inst.z - sx * s + sz * c };
}

export class CharacterController {
  readonly queue: QueueItem[] = [];
  private path: Point[] = [];
  /** Final exact target after the path (spots can be inside walk-on objects). */
  private finalTarget: Point | null = null;
  private faceHeading: number | null = null;
  private floorTarget: Point | null = null;
  private onArrive: (() => void) | null = null;
  private standSpot: Point | null = null;

  constructor(
    private readonly session: GameSession,
    private readonly room: KosRoom,
    private readonly character: HumanModel,
    private readonly notify: (block: ActionBlock) => void,
    private readonly onQueueChange: () => void,
  ) {}

  enqueue(instance: ObjectInstance, action: ActionDef): void {
    if (this.queue.length >= 6) return;
    this.queue.push({ instance, action, state: 'pending' });
    this.floorTarget = null;
    this.onQueueChange();
  }

  /** Cancels a queued action; cancelling the active one makes the character stand up first. */
  cancel(index: number): void {
    const item = this.queue[index];
    if (!item) return;
    if (index > 0 || item.state === 'pending' || item.state === 'walking') {
      this.queue.splice(index, 1);
      if (index === 0) this.stopWalking();
      this.onQueueChange();
      return;
    }
    if (item.state === 'running' || item.state === 'entering') {
      this.session.cancelAction();
      this.exit(item);
    }
  }

  /** Tap on the floor: drop everything and walk there. */
  walkTo(p: Point): void {
    for (let i = this.queue.length - 1; i >= 0; i--) this.cancel(i);
    if (this.queue.length === 0) this.startWalk(p, null, () => this.character.play('Idle_Loop'));
    else this.floorTarget = p; // after standing up
  }

  handleEvents(events: SimEvent[]): void {
    for (const e of events) {
      if (e.kind !== 'actionDone') continue;
      const item = this.queue[0];
      if (item && item.state === 'running' && item.instance.id === e.objectInstanceId) this.exit(item);
    }
  }

  update(dt: number): void {
    const item = this.queue[0];
    if (item && item.state === 'pending') this.approach(item);
    this.move(dt);
    this.character.update(dt);
  }

  private approach(item: QueueItem): void {
    item.state = 'walking';
    const spot = spotOf(item.instance);
    this.startWalk(spot, item.instance.rot + Math.PI, () => this.enter(item));
  }

  private startWalk(target: Point, face: number | null, onArrive: () => void): void {
    const pos = this.character.root.position;
    const path = this.room.nav.findPath({ x: pos.x, z: pos.z }, target);
    this.path = path ?? [];
    this.finalTarget = target;
    this.faceHeading = face;
    this.onArrive = onArrive;
  }

  private stopWalking(): void {
    this.path = [];
    this.finalTarget = null;
    this.onArrive = null;
    this.character.play('Idle_Loop');
  }

  private move(dt: number): void {
    if (!this.onArrive) return;
    const root = this.character.root;
    const next = this.path[0] ?? this.finalTarget;
    if (next) {
      const dx = next.x - root.position.x;
      const dz = next.z - root.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.03) {
        this.character.play('Walk_Loop', 0.25);
        root.rotation.y = angleLerp(root.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * TURN_RATE));
        const step = Math.min(dist, WALK_SPEED * dt);
        root.position.x += (dx / dist) * step;
        root.position.z += (dz / dist) * step;
        return;
      }
      if (this.path.length > 0) this.path.shift();
      else this.finalTarget = null;
      return;
    }
    // Arrived: turn to face the object, then act.
    if (this.faceHeading !== null && angleDiff(root.rotation.y, this.faceHeading) > 0.05) {
      this.character.play('Idle_Loop', 0.25);
      root.rotation.y = angleLerp(root.rotation.y, this.faceHeading, Math.min(1, dt * TURN_RATE));
      return;
    }
    const done = this.onArrive;
    this.onArrive = null;
    done();
  }

  private enter(item: QueueItem): void {
    const block = this.session.actionBlock(item.action);
    if (block) {
      this.notify(block);
      this.finishItem();
      return;
    }
    if (!this.session.startAction(item.action, item.instance.id)) {
      this.finishItem();
      return;
    }
    item.state = 'entering';
    const root = this.character.root;
    this.standSpot = { x: root.position.x, z: root.position.z };
    const running = (): void => {
      if (item.state === 'entering') item.state = 'running';
    };
    switch (item.action.animation) {
      case 'lie': {
        // Lie on the back along the bed, head on the pillow (bed local -z).
        const inst = item.instance;
        const c = Math.cos(inst.rot);
        const s = Math.sin(inst.rot);
        const lz = 0.85;
        root.position.set(inst.x + lz * s, 0.6, inst.z + lz * c);
        root.rotation.set(-Math.PI / 2, inst.rot, 0, 'YXZ');
        this.character.play('Idle_Loop', 0.2, 0.35);
        running();
        break;
      }
      case 'sit': {
        const clip: HumanClip = item.action.id === 'video_call' ? 'Sitting_Talking_Loop' : 'Sitting_Idle_Loop';
        this.character.playOnce('Sitting_Enter', () => {
          this.character.play(clip, 0.2);
          running();
        });
        break;
      }
      case 'interact':
        this.character.play('Interact', 0.3);
        running();
        break;
      case 'exercise':
        this.character.play('Jog_Fwd_Loop', 0.3);
        running();
        break;
      case 'worship':
        this.character.play('Idle_Loop', 0.4, 0.4);
        running();
        break;
      default:
        this.character.play('Idle_Loop', 0.3);
        running();
    }
    this.onQueueChange();
  }

  private exit(item: QueueItem): void {
    if (item.state === 'exiting') return;
    item.state = 'exiting';
    const root = this.character.root;
    if (item.action.animation === 'lie' && this.standSpot) {
      root.position.set(this.standSpot.x, 0, this.standSpot.z);
      root.rotation.set(0, item.instance.rot + Math.PI / 2, 0, 'XYZ');
      this.character.play('Idle_Loop', 0.2);
      this.finishItem();
    } else if (item.action.animation === 'sit') {
      this.character.playOnce('Sitting_Exit', () => this.finishItem());
    } else {
      this.character.play('Idle_Loop', 0.3);
      this.finishItem();
    }
  }

  private finishItem(): void {
    this.queue.shift();
    this.standSpot = null;
    this.onQueueChange();
    if (this.queue.length === 0 && this.floorTarget) {
      const p = this.floorTarget;
      this.floorTarget = null;
      this.startWalk(p, null, () => this.character.play('Idle_Loop'));
    }
  }
}
