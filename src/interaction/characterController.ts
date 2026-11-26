import type { Gesture, HumanClip, HumanModel } from '../characters/humanModel';
import { WORSHIP } from '../characters/routines';
import type { KosRoom, ObjectInstance } from '../home/kosRoom';
import type { Point } from '../home/navGrid';
import type { ActionBlock, ActionDef, ActionStep } from '../sim/actions';
import type { GameSession, SimEvent } from '../sim/session';

// Drives the character in the home: an action queue the player fills by tapping objects, walking
// with pathfinding, and the pose and object effects of every step (open the fridge, cook at the
// stove, sit down to eat...). The simulation decides effects and timing; this class moves,
// animates and switches object visuals.

export interface QueueItem {
  instance: ObjectInstance;
  action: ActionDef;
  /** Shopping list for the go-shopping action. */
  purchase?: Record<string, number>;
  /** Chosen by the character itself (autonomy) rather than the player. */
  autonomous?: boolean;
  state: 'pending' | 'walking' | 'entering' | 'running' | 'exiting' | 'away';
}

/** Walking speed in m/s at 1x; a little faster at 2x and 3x so walks never feel slow. */
const WALK_SPEED = 1.45;
/** Ground speed of the walk clip at normal playback (feet do not slide when matched). */
const WALK_CLIP_SPEED = 0.94;
const SPEED_FACTOR = [1, 1, 1.3, 1.6] as const;
const TURN_RATE = 9;

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

/** Hand gesture layered on a step's animation. */
function gestureFor(step: ActionStep, actionId: string): Gesture | null {
  if (step.animation === 'eat' || step.prop === 'plate') return 'eat';
  if (step.animation === 'cook') return 'stir';
  if (step.animation === 'chop') return 'chop';
  if (step.animation === 'shower' || step.animation === 'dry') return 'scrub';
  if (step.animation === 'sit' && step.prop === 'screen' && (actionId === 'browse' || actionId === 'study' || actionId === 'design')) return 'type';
  return null;
}

/** World position of an object's interaction spot (or of a step's own spot in object space). */
export function spotOf(inst: ObjectInstance, local?: [number, number]): Point {
  const [sx, sz] = local ?? inst.def.spot;
  const c = Math.cos(inst.rot);
  const s = Math.sin(inst.rot);
  return { x: inst.x + sx * c + sz * s, z: inst.z - sx * s + sz * c };
}

export interface ControllerHooks {
  notify: (block: ActionBlock) => void;
  onQueueChange: () => void;
  /** Colour of an item id (food props). */
  itemColor: (id: string) => string | undefined;
  /** Called when a step starts (with its object and action id) or ends (nulls): sounds follow this. */
  onStepChange?: (step: ActionStep | null, instance: ObjectInstance | null, actionId: string | null) => void;
  /** Called on every footstep while walking. */
  onFootstep?: () => void;
  /** Called when the character has left the house for an away action (shopping, work, interview). */
  onAway?: (item: QueueItem) => void;
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
  /** Object the current step runs on (its prop is switched off when the step ends). */
  private stepInstance: ObjectInstance | null = null;
  private ignoreNav = false;
  private stride = 0;
  /** Pose of the step in progress, so it can be left properly (stand up, get out of bed). */
  private pose: ActionStep['animation'] | null = null;
  /** The front door stays open while going out or coming back. */
  frontDoorOpen = false;

  constructor(
    private readonly session: GameSession,
    private readonly room: KosRoom,
    private readonly character: HumanModel,
    private readonly hooks: ControllerHooks,
  ) {}

  /** Starts an away action (trip, hospital stay, jail) right outside the front door. */
  enqueueAwayNow(door: ObjectInstance, action: ActionDef): void {
    const o = this.room.outside;
    this.character.root.position.set(o.x, 0, o.z);
    this.ignoreNav = true;
    this.enqueue(door, action);
  }

  enqueue(instance: ObjectInstance, action: ActionDef, purchase?: Record<string, number>, autonomous = false): void {
    if (this.queue.length >= 6) return;
    this.queue.push({ instance, action, purchase, autonomous, state: 'pending' });
    this.floorTarget = null;
    this.hooks.onQueueChange();
  }

  /** Cancels a queued action; cancelling the active one makes the character stand up first. */
  cancel(index: number): void {
    const item = this.queue[index];
    if (!item) return;
    if (item.state === 'away') return; // already out shopping: comes back when done
    if (index > 0 || item.state === 'pending' || (item.state === 'walking' && !this.session.current)) {
      this.queue.splice(index, 1);
      if (index === 0) this.stopWalking();
      this.hooks.onQueueChange();
      return;
    }
    if (item.state === 'running' || item.state === 'entering' || item.state === 'walking') {
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
      if (e.kind !== 'actionStep' && e.kind !== 'actionDone') continue;
      const item = this.queue[0];
      if (!item || item.instance.id !== e.objectInstanceId) continue;
      if (e.kind === 'actionStep' && (item.state === 'running' || item.state === 'entering')) this.nextStep(item);
      if (e.kind === 'actionDone') {
        if (item.state === 'away') this.comeBack(item);
        else if (item.state === 'running' || item.state === 'entering') this.exit(item);
      }
    }
  }

  /** Nothing queued and not walking anywhere: free for autonomy. */
  get isIdle(): boolean {
    return this.queue.length === 0 && this.onArrive === null;
  }

  get position(): Point {
    return { x: this.character.root.position.x, z: this.character.root.position.z };
  }

  update(dt: number): void {
    // Clothes always follow the simulation (undressed, towel, pyjamas, daily).
    if (this.character.currentOutfit !== this.session.character.outfit) this.character.setOutfit(this.session.character.outfit);
    const item = this.queue[0];
    if (item && item.state === 'pending') this.approach(item, 0);
    this.move(dt);
    // Worship movements follow the action's progress, so the whole sequence always fits.
    if (this.pose === 'worship') this.character.setRoutineProgress(this.session.progress()?.fraction ?? 0);
    if ((this.pose === 'sweep' || this.pose === 'mop') && this.choreSpots.length) this.choreWalk(dt);
    this.character.update(dt);
  }

  // --- Housework moving around the room ----------------------------------------------------

  private choreSpots: Point[] = [];

  /** A few free spots spread over the floor. */
  private roomSpots(n: number): Point[] {
    const { width, depth } = this.room.layout;
    const out: Point[] = [];
    for (let i = 0; i < n * 4 && out.length < n; i++) {
      const p = { x: (Math.random() - 0.5) * (width - 1.4), z: (Math.random() - 0.5) * (depth - 1.4) };
      if (!this.room.nav.isBlockedAt(p)) out.push(p);
    }
    return out;
  }

  private choreWalk(dt: number): void {
    const root = this.character.root;
    const next = this.choreSpots[0];
    const dx = next.x - root.position.x;
    const dz = next.z - root.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.1) {
      // On to the next patch of floor (round and round until the action ends).
      this.choreSpots.push(this.choreSpots.shift()!);
      return;
    }
    const speed = 0.45 * SPEED_FACTOR[this.session.clock.speed];
    const step = Math.min(d, speed * dt);
    if (this.room.nav.isBlockedAt({ x: root.position.x + (dx / d) * step, z: root.position.z + (dz / d) * step })) {
      this.choreSpots.push(this.choreSpots.shift()!);
      return;
    }
    root.position.x += (dx / d) * step;
    root.position.z += (dz / d) * step;
    root.rotation.y = angleLerp(root.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 4));
  }

  // --- Steps -----------------------------------------------------------------------------

  /** The room instance where a step happens. */
  private stepTarget(item: QueueItem, step: ActionStep): ObjectInstance {
    if (step.object === 'self') return item.instance;
    let best: ObjectInstance | null = null;
    let bestD = Infinity;
    const p = this.position;
    for (const inst of this.room.instances.values()) {
      if (inst.def.id !== step.object) continue;
      const d = Math.hypot(inst.x - p.x, inst.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = inst;
      }
    }
    return best ?? item.instance;
  }

  private stepsOf(item: QueueItem): ActionStep[] {
    return this.session.current?.def === item.action ? this.session.current.steps : item.action.steps ?? [{ object: 'self', durationMinutes: item.action.durationMinutes, animation: item.action.animation, prop: item.action.prop }];
  }

  /** Walk to the object of step `index` (0 = before the action has started). */
  private approach(item: QueueItem, index: number): void {
    item.state = 'walking';
    const step = this.stepsOf(item)[index];
    const target = this.stepTarget(item, step);
    const heading = step.faceAway ? target.rot : target.rot + Math.PI;
    this.startWalk(spotOf(target, step.spot), heading, () => this.enter(item, index, target));
  }

  private nextStep(item: QueueItem): void {
    const index = this.session.current?.stepIndex ?? 0;
    this.leavePose(() => this.approach(item, index));
  }

  private enter(item: QueueItem, index: number, target: ObjectInstance): void {
    if (index === 0) {
      const block = this.session.actionBlock(item.action);
      if (block || !this.session.startAction(item.action, item.instance.id, item.purchase)) {
        this.hooks.notify(block ?? 'money');
        this.finishItem();
        return;
      }
    } else {
      this.session.continueAction();
    }
    const step = this.session.currentStep;
    if (!step) return;
    item.state = 'entering';
    this.stepInstance = target;
    const root = this.character.root;
    this.standSpot = { x: root.position.x, z: root.position.z };
    const food = this.session.current?.usedItems[0];
    if (step.prop) this.room.setProp(target.id, step.prop, food ? this.hooks.itemColor(food) : undefined);
    this.hooks.onStepChange?.(step, target, item.action.id);
    const running = (): void => {
      if (item.state === 'entering') item.state = 'running';
    };
    this.pose = step.animation;
    this.character.setGesture(gestureFor(step, item.action.id));
    switch (step.animation) {
      case 'lie': {
        // Lie on the back along the bed, head on the pillow (bed local -z).
        const c = Math.cos(target.rot);
        const s = Math.sin(target.rot);
        const lz = 0.85;
        root.position.set(target.x + lz * s, 0.6, target.z + lz * c);
        root.rotation.set(-Math.PI / 2, target.rot, 0, 'YXZ');
        this.character.setHandsHidden(true);
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
      case 'interact': {
        const id = target.def.id;
        if (item.action.id === 'water_plant') {
          this.character.play('Farm_Watering', 0.3);
          running();
        } else if (id === 'fridge' || id === 'wardrobe') {
          // Swing the door open, then wait with the door held.
          this.character.playOnce('Chest_Open', () => {
            this.character.play('Idle_Loop', 0.3);
            running();
          });
        } else {
          this.character.play('Interact', 0.3);
          running();
        }
        break;
      }
      case 'eat':
        // Standing snack or drink: the full eating/drinking motion instead of the hand gesture.
        this.character.setGesture(null);
        this.character.play('Consume', 0.3);
        running();
        break;
      case 'cook':
      case 'chop':
      case 'dry':
      case 'shower':
        if (step.animation === 'chop') this.character.holdProp('pisau');
        // Calm standing base; the hands are animated by the gesture layer.
        this.character.play('Idle_Loop', 0.3, 0.6);
        running();
        break;
      case 'exercise':
        this.character.play('Jog_Fwd_Loop', 0.3);
        running();
        break;
      case 'worship': {
        // The full movements of the character's own religion (sholat, kneeling prayer, sembah...).
        this.character.play('Idle_Loop', 0.4, 0.4);
        const religion = target.def.religion ?? this.session.character.religionId;
        this.character.setRoutine(WORSHIP[religion] ?? null);
        running();
        break;
      }
      case 'sweep':
      case 'mop': {
        // Work across the room with the broom or the mop, pushing it in front.
        this.character.holdProp(step.animation === 'sweep' ? 'sapu' : 'pel');
        this.choreSpots = this.roomSpots(5);
        this.character.play('Push_Loop', 0.3, 0.8);
        running();
        break;
      }
      case 'wipe':
        this.character.holdProp('lap');
        this.character.play('Interact', 0.3);
        this.character.setGesture('scrub');
        running();
        break;
      case 'wash':
        // Washing clothes or dishes by hand.
        this.character.holdProp(item.action.chore === 'lipat' || item.action.chore === 'jemur' ? 'baju' : null);
        this.character.play(item.action.chore === 'cuciBaju' ? 'Crouch_Idle_Loop' : 'Idle_Loop', 0.3, 0.7);
        this.character.setGesture('scrub');
        running();
        break;
      case 'away':
        this.goOut(item);
        break;
      default:
        this.character.play('Idle_Loop', 0.3);
        running();
    }
    this.hooks.onQueueChange();
  }

  /** Leaves the current step's pose and switches its object effect off, then calls `then`. */
  private leavePose(then: () => void): void {
    const pose = this.pose;
    this.pose = null;
    this.choreSpots = [];
    this.character.holdProp(null);
    this.character.setGesture(null);
    this.character.setRoutine(null);
    if (this.stepInstance) this.room.setProp(this.stepInstance.id, null);
    this.hooks.onStepChange?.(null, null, null);
    const root = this.character.root;
    this.character.setHandsHidden(false);
    if (pose === 'lie' && this.standSpot && this.stepInstance) {
      // Get up: sit on the edge of the bed facing away from it, then stand.
      const bed = this.stepInstance;
      root.position.set(this.standSpot.x, 0, this.standSpot.z);
      root.rotation.set(0, Math.atan2(this.standSpot.x - bed.x, this.standSpot.z - bed.z), 0, 'XYZ');
      this.character.playOnce('Sitting_Exit', () => {
        this.character.play('Idle_Loop', 0.3);
        then();
      }, 0.12);
    } else if (pose === 'sit') {
      this.character.playOnce('Sitting_Exit', then);
    } else {
      this.character.play('Idle_Loop', 0.3);
      then();
    }
  }

  private exit(item: QueueItem): void {
    if (item.state === 'exiting') return;
    item.state = 'exiting';
    this.leavePose(() => this.finishItem());
  }

  // --- Going out (shopping) ---------------------------------------------------------------

  private goOut(item: QueueItem): void {
    this.frontDoorOpen = true;
    this.ignoreNav = true;
    // Time only races ahead once the character is out of the door.
    this.session.clock.fastForward = false;
    this.startWalk(this.room.outside, null, () => {
      this.session.clock.fastForward = item.action.fastForward === true && this.session.current !== null;
      item.state = 'away';
      this.character.root.visible = false;
      this.frontDoorOpen = false;
      this.hooks.onQueueChange();
      this.hooks.onAway?.(item);
    });
  }

  private comeBack(item: QueueItem): void {
    item.state = 'exiting';
    this.character.root.visible = true;
    this.frontDoorOpen = true;
    this.ignoreNav = true;
    const spot = spotOf(item.instance);
    this.startWalk(spot, null, () => {
      this.ignoreNav = false;
      this.frontDoorOpen = false;
      if (this.stepInstance) this.room.setProp(this.stepInstance.id, null);
      this.character.play('Idle_Loop');
      this.finishItem();
    });
  }

  // --- Walking ---------------------------------------------------------------------------

  private startWalk(target: Point, face: number | null, onArrive: () => void): void {
    const pos = this.position;
    if (this.ignoreNav) {
      this.path = [];
    } else {
      const path = this.room.nav.findPath(pos, target);
      this.path = path ?? [];
    }
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
    const factor = SPEED_FACTOR[this.session.clock.speed];
    const next = this.path[0] ?? this.finalTarget;
    if (next) {
      const dx = next.x - root.position.x;
      const dz = next.z - root.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.03) {
        this.character.play('Walk_Loop', 0.2, (WALK_SPEED / WALK_CLIP_SPEED) * factor);
        root.rotation.y = angleLerp(root.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * TURN_RATE * factor));
        const step = Math.min(dist, WALK_SPEED * factor * dt);
        root.position.x += (dx / dist) * step;
        root.position.z += (dz / dist) * step;
        this.stride += step;
        if (this.stride > 0.62) {
          this.stride = 0;
          if (root.visible) this.hooks.onFootstep?.();
        }
        return;
      }
      if (this.path.length > 0) this.path.shift();
      else this.finalTarget = null;
      return;
    }
    // Arrived: turn to face the object, then act.
    if (this.faceHeading !== null && angleDiff(root.rotation.y, this.faceHeading) > 0.05) {
      this.character.play('Idle_Loop', 0.2);
      root.rotation.y = angleLerp(root.rotation.y, this.faceHeading, Math.min(1, dt * TURN_RATE * factor));
      return;
    }
    const done = this.onArrive;
    this.onArrive = null;
    this.ignoreNav = false;
    done();
  }

  private finishItem(): void {
    this.queue.shift();
    this.standSpot = null;
    this.stepInstance = null;
    this.hooks.onQueueChange();
    if (this.queue.length === 0 && this.floorTarget) {
      const p = this.floorTarget;
      this.floorTarget = null;
      this.startWalk(p, null, () => this.character.play('Idle_Loop'));
    }
  }
}
