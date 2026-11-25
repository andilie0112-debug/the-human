import { type PerspectiveCamera, type Scene } from 'three';
import type { HumanModel } from '../characters/humanModel';
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
  private space: InteriorSpace | null = null;
  /** True while a dialog (shelf, cashier) is open: no walking. */
  paused = false;

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
      if (this.active) this.dragX = e.clientX;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.active || this.dragX === null || !this.player) return;
      this.player.turnCamera(e.clientX - this.dragX);
      this.dragX = e.clientX;
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
    this.character.root.visible = true;
    this.player = new PlayerController(this.character, space.colliders, space.bounds, { dist: 3.6, height: 2.7 });
    this.player.place(space.spawn.x, space.spawn.z, space.spawn.heading, true);
    this.player.resize();
    this.view.setOverride({ scene: space.scene, camera: this.player.camera });
    this.joystick.show(true);
    this.buttons.hidden = false;
    document.body.classList.add('outside', 'inside-place');
  }

  exit(): void {
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
    const input = this.paused ? { x: 0, y: 0 } : this.joystick.read();
    this.player.run = false;
    this.player.update(dt, input);
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
    this.near = this.paused ? null : best;
    this.useBtn.hidden = !this.near;
    if (this.near) this.useBtn.textContent = this.near.label;
  }
}
