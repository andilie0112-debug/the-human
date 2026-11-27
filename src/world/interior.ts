import { type PerspectiveCamera, type Scene } from 'three';
import type { HumanModel } from '../characters/humanModel';
import { fadeFromBlack } from '../ui/fade';
import { PMREMGenerator, type Texture } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { t } from '../data/strings';
import { Joystick } from '../ui/joystick';
import type { OutdoorView } from './outdoor';
import type { Box2 } from './neighborhood';
import { PlayerController } from './playerController';

// A walkable inside space (minimarket, hospital, station): third-person walking with the
// joystick, collisions with counters and shelves, and "zones" you can use when standing near
// them (a shelf, the cashier, the exit). The building itself is made by a separate builder.

export interface Zone {
  id: string;
  label: string;
  x: number;
  z: number;
  /** Reach in metres. */
  r: number;
}

export interface InteriorSpace {
  scene: Scene;
  colliders: Box2[];
  bounds: Box2;
  zones: Zone[];
  spawn: { x: number; z: number; heading: number };
  /** Camera distance and height (big halls want a higher view). */
  cam?: { dist: number; height: number };
  /** People you can walk up to and talk with. */
  talkables?: () => HumanModel[];
  /** Everyone standing or walking inside (you bump into them); defaults to the talkables. */
  people?: () => readonly { x: number; z: number }[];
  /** Animates people and doors inside. */
  update?: (dt: number, player: { x: number; z: number }) => void;
  dispose: () => void;
}

export class Interior {
  active = false;
  private readonly joystick = new Joystick();
  private readonly buttons: HTMLElement;
  private readonly useBtn: HTMLButtonElement;
  private player: PlayerController | null = null;
  private near: Zone | null = null;
  private dragX: number | null = null;
  private dragY = 0;
  private space: InteriorSpace | null = null;
  /** True while a dialog (shelf, cashier) is open: no walking. */
  paused = false;
  private static env: Texture | null = null;
  /** Riding an escalator: the character's height is moved from outside. */
  setFloating(on: boolean): void {
    if (this.player) this.player.floating = on;
  }

  /** The person you would talk to now (see `talkables`). */
  talkTarget: HumanModel | null = null;
  /** Seconds left of the automatic steps in through the door. */
  private walkIn = 0;
  /** Walking by itself to a point (through a ticket gate, to the train door), then `then`. */
  private auto: { path: { x: number; z: number }[]; then: () => void; clip: 'Walk_Loop' | 'Walk_Carry_Loop' } | null = null;

  /** Walks the character along these points (ignoring counters and gates), then calls `then`. */
  autoWalk(path: { x: number; z: number }[], then: () => void, clip: 'Walk_Loop' | 'Walk_Carry_Loop' = 'Walk_Loop'): void {
    this.auto = { path: [...path], then, clip };
  }

  get walking(): boolean {
    return this.auto !== null;
  }

  constructor(
    private readonly view: OutdoorView,
    private readonly character: HumanModel,
    private readonly onZone: (zone: Zone) => void,
  ) {
    this.buttons = document.createElement('div');
    this.buttons.className = 'world-btns';
    this.buttons.hidden = true;
    this.useBtn = document.createElement('button');
    this.useBtn.className = 'world-btn';
    this.buttons.append(this.useBtn);
    document.body.append(this.buttons);
    this.useBtn.addEventListener('click', () => {
      if (this.near) this.onZone(this.near);
    });
    const canvas = view.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => {
      if (this.active) {
        this.dragX = e.clientX;
        this.dragY = e.clientY;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.active || this.dragX === null || !this.player) return;
      // Sideways turns the camera around; up and down tilts it (low to look up at the city).
      this.player.turnCamera(e.clientX - this.dragX, e.clientY - this.dragY);
      this.dragX = e.clientX;
      this.dragY = e.clientY;
    });
    const stop = (): void => {
      this.dragX = null;
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
  }

  get camera(): PerspectiveCamera | null {
    return this.player?.camera ?? null;
  }

  enter(space: InteriorSpace): void {
    this.space = space;
    this.active = true;
    this.paused = false;
    space.scene.add(this.character.root);
    // Soft bounce light and reflections indoors (one shared environment).
    if (!space.scene.environment) {
      Interior.env ??= (() => {
        const pmrem = new PMREMGenerator(this.view.renderer);
        const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
        return tex;
      })();
      space.scene.environment = Interior.env;
      space.scene.environmentIntensity = 0.45;
    }
    this.character.root.visible = true;
    this.player = new PlayerController(this.character, space.colliders, space.bounds, space.cam ?? { dist: 3.6, height: 2.7 });
    this.player.people = space.people ?? (space.talkables ? () => space.talkables!().map((m) => m.root.position) : null);
    // Start in the doorway and walk a few steps in, after a short fade.
    this.player.place(space.spawn.x, space.spawn.z + 1.0, space.spawn.heading, true);
    this.walkIn = 0.9;
    fadeFromBlack();
    this.player.resize();
    this.view.setOverride({ scene: space.scene, camera: this.player.camera });
    this.joystick.show(true);
    this.buttons.hidden = false;
    document.body.classList.add('outside', 'inside-place');
  }

  private stepAuto(dt: number): void {
    const a = this.auto!;
    const r = this.character.root;
    const next = a.path[0];
    if (!next) {
      this.auto = null;
      this.character.play('Idle_Loop', 0.25);
      a.then();
      return;
    }
    const dx = next.x - r.position.x;
    const dz = next.z - r.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.08) {
      a.path.shift();
    } else {
      const step = Math.min(d, 1.2 * dt);
      r.position.x += (dx / d) * step;
      r.position.z += (dz / d) * step;
      r.rotation.y = Math.atan2(dx, dz);
      this.character.play(a.clip, 0.2, 1.2 / (a.clip === 'Walk_Loop' ? 0.94 : 0.65));
    }
    this.character.update(dt);
    this.player?.follow(dt);
  }

  exit(): void {
    this.auto = null;
    this.active = false;
    this.joystick.show(false);
    this.buttons.hidden = true;
    document.body.classList.remove('inside-place');
    this.space?.dispose();
    this.space = null;
    this.player = null;
  }

  update(dt: number): void {
    if (!this.active || !this.player || !this.space) return;
    let input = this.paused ? { x: 0, y: 0 } : this.joystick.read();
    if (this.walkIn > 0) {
      this.walkIn -= dt;
      input = { x: 0, y: -0.75 };
    }
    this.player.run = false;
    if (this.auto) this.stepAuto(dt);
    else this.player.update(dt, input);
    // The walk may have ended the visit (boarded the train): nothing more to update here.
    if (!this.active || !this.space) return;
    const me = this.character.root.position;
    this.space.update?.(dt, { x: me.x, z: me.z });
    let best: Zone | null = null;
    let bestD = Infinity;
    for (const z of this.space.zones) {
      const d = Math.hypot(z.x - me.x, z.z - me.z);
      if (d < z.r && d < bestD) {
        bestD = d;
        best = z;
      }
    }
    // Someone close by (and no counter or seat nearer): talk to them.
    this.talkTarget = null;
    if (!this.paused && this.space.talkables) {
      let bestP: HumanModel | null = null;
      let pd = 1.4;
      for (const m of this.space.talkables()) {
        const d = Math.hypot(m.root.position.x - me.x, m.root.position.z - me.z);
        if (d < pd && m.root.visible) {
          pd = d;
          bestP = m;
        }
      }
      if (bestP && !best) {
        this.talkTarget = bestP;
        best = { id: 'talk', label: `💬 ${t('talk.button')}`, x: bestP.root.position.x, z: bestP.root.position.z, r: 1.4 };
      }
    }
    this.near = this.paused ? null : best;
    this.useBtn.hidden = !this.near;
    if (this.near) this.useBtn.textContent = this.near.label;
  }
}
