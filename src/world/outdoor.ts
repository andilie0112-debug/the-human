import { Group } from 'three';
import { t, tDynamic } from '../data/strings';
import type { ObjectDef } from '../data/objectCatalog';
import type { HumanModel } from '../characters/humanModel';
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { ObjectInstance } from '../home/kosRoom';
import type { ActionDef } from '../sim/actions';
import type { GameSession, SimEvent } from '../sim/session';
import { minuteOfDay } from '../sim/time';
import { Joystick } from '../ui/joystick';
import { createNeighborhood, type Neighborhood, type PlaceData } from './neighborhood';
import { Pedestrians } from './pedestrians';
import { PlayerController } from './playerController';
import { Traffic, motorbike } from './traffic';
import places from '../data/places.json';

// The neighborhood as a mode of the game: walking with the joystick, entering places through
// their doors, riding the motorbike, fast travel. Built lazily the first time the player goes out.

export interface PlaceInfo extends PlaceData {
  actions: ActionDef[];
}

export const PLACES = places as unknown as PlaceInfo[];

/** The part of the room view the outdoor mode needs. */
export interface OutdoorView {
  renderer: WebGLRenderer;
  setOverride: (o: { scene: Scene; camera: PerspectiveCamera } | null) => void;
}

export interface OutdoorHooks {
  /** Opens the action menu for a place (as if it were an object). */
  openMenu: (inst: ObjectInstance, extra: ActionDef[], religion?: string) => void;
  enterHome: () => void;
  toast: (text: string) => void;
}

export class Outdoor {
  active = false;
  private hood: Neighborhood | null = null;
  private traffic: Traffic | null = null;
  private walkers: Pedestrians | null = null;
  private player: PlayerController | null = null;
  private readonly joystick = new Joystick();
  private readonly buttons: HTMLElement;
  private readonly interactBtn: HTMLButtonElement;
  private readonly runBtn: HTMLButtonElement;
  private readonly rideBtn: HTMLButtonElement;
  private nearPlace: PlaceInfo | null = null;
  /** The place whose action is running (the character is inside). */
  private inside: PlaceInfo | null = null;
  private dragX: number | null = null;

  constructor(
    private readonly session: GameSession,
    private readonly view: OutdoorView,
    private readonly character: HumanModel,
    private readonly hooks: OutdoorHooks,
  ) {
    this.buttons = document.createElement('div');
    this.buttons.className = 'world-btns';
    this.buttons.hidden = true;
    this.interactBtn = this.makeBtn('🚪');
    this.runBtn = this.makeBtn(`🏃 ${t('world.run')}`);
    this.rideBtn = this.makeBtn(`🛵 ${t('world.ride')}`);
    this.interactBtn.addEventListener('click', () => this.interact());
    this.runBtn.addEventListener('click', () => {
      if (!this.player) return;
      this.player.run = !this.player.run;
      this.runBtn.classList.toggle('on', this.player.run);
    });
    this.rideBtn.addEventListener('click', () => this.toggleRide());
    document.body.append(this.buttons);
    // Drag anywhere on the view (outside the joystick) to turn the camera.
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

  private makeBtn(label: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'world-btn';
    b.textContent = label;
    this.buttons.append(b);
    return b;
  }

  /** Camera used outside (for screen overlays such as the thought bubble). */
  get camera(): PerspectiveCamera | null {
    return this.player?.camera ?? null;
  }

  private build(): void {
    if (this.hood) return;
    this.hood = createNeighborhood(PLACES);
    this.traffic = new Traffic(this.hood.scene);
    this.walkers = new Pedestrians(this.hood.scene);
    this.player = new PlayerController(this.character, this.hood.colliders, this.hood.bounds);
    const kos = this.hood.doors.get('kos')!;
    this.player.bikeAt = { x: kos.x + 3, z: kos.z + 1.5, heading: 0 };
  }

  private syncBike(): void {
    if (!this.hood || !this.player) return;
    if (this.session.character.ownsMotorbike && !this.player.bike) {
      this.player.bike = motorbike('#c0392b', false);
      this.hood.scene.add(this.player.bike);
    }
    const b = this.player.bike;
    if (b && !this.player.riding) {
      b.position.set(this.player.bikeAt.x, 0, this.player.bikeAt.z);
      b.rotation.y = this.player.bikeAt.heading;
    }
  }

  /** Goes outside, standing at a place's door (default: the kos). */
  enter(placeId = 'kos'): void {
    this.build();
    if (!this.hood || !this.player) return;
    this.active = true;
    this.inside = null;
    this.hood.scene.add(this.character.root);
    this.character.root.visible = true;
    this.character.setOutfit(this.session.character.outfit === 'none' ? 'towel' : this.session.character.outfit);
    const door = this.hood.doors.get(placeId) ?? this.hood.doors.get('kos')!;
    this.player.place(door.x, door.z, door.heading + Math.PI);
    this.player.resize();
    this.view.setOverride({ scene: this.hood.scene, camera: this.player.camera });
    this.joystick.show(true);
    this.buttons.hidden = false;
    document.body.classList.add('outside');
    this.syncBike();
  }

  /** Leaves the neighborhood (the caller shows the home again). */
  exit(): void {
    if (this.player?.riding) this.toggleRide();
    this.active = false;
    this.view.setOverride(null);
    this.joystick.show(false);
    this.buttons.hidden = true;
    document.body.classList.remove('outside');
  }

  /** Teleports to a place's door (fast travel). */
  teleport(placeId: string): void {
    if (!this.active) this.enter(placeId);
    const door = this.hood?.doors.get(placeId);
    if (door && this.player) this.player.place(door.x, door.z, door.heading + Math.PI);
  }

  /** Straight-line distance from the player (or the kos when at home) to a place. */
  distanceTo(placeId: string): number {
    const door = this.hood?.doors.get(placeId);
    const target = door ?? PLACES.find((p) => p.id === placeId);
    const from = this.active && this.player ? this.character.root.position : (this.hood?.doors.get('kos') ?? { x: -40, z: -6 });
    if (!target) return 0;
    return Math.hypot(target.x - from.x, target.z - from.z);
  }

  private toggleRide(): void {
    const p = this.player;
    if (!p || !p.bike) return;
    if (p.riding) {
      p.riding = false;
      p.bikeAt = { x: this.character.root.position.x + 1, z: this.character.root.position.z, heading: p.bike.rotation.y };
      this.character.root.position.y = 0;
      this.syncBike();
    } else {
      p.riding = true;
    }
    this.rideBtn.textContent = p.riding ? `🛵 ${t('world.getOff')}` : `🛵 ${t('world.ride')}`;
  }

  private interact(): void {
    const place = this.nearPlace;
    if (!place) return;
    const inst = {
      id: `place:${place.id}`,
      def: { id: place.id, nameKey: place.nameKey, model: 'none', footprint: [1, 1], spot: [0, 0], actions: place.actions } as ObjectDef,
      group: new Group(),
      x: place.x,
      z: place.z,
      rot: 0,
    } as ObjectInstance;
    this.hooks.openMenu(inst, this.dynamicActions(place), place.religion);
  }

  /** Work and interviews at the office building, when they are due. */
  private dynamicActions(place: PlaceInfo): ActionDef[] {
    if (place.kind !== 'work') return [];
    const out: ActionDef[] = [];
    const c = this.session.career;
    const now = this.session.clock.minutes;
    const job = c.job;
    if (job && c.canGoToWork(now)) {
      const data = c.jobData(job.jobId);
      out.push({ id: 'work_here', labelKey: 'act.workHere', durationMinutes: Math.max(60, data.shiftEnd * 60 - minuteOfDay(now)), activity: 'working', fastForward: true, animation: 'away', needsPerHour: { kenyang: 4, sosial: 6, hiburan: -1 }, stressPerHour: this.session.cfgCareerStress * data.stressFactor });
    }
    if (c.interviewNow()) out.push({ id: 'interview_here', labelKey: 'act.interviewHere', durationMinutes: 60, ui: 'interview', animation: 'away', needsPerHour: { sosial: 4 }, stressPerHour: 3 });
    return out;
  }

  /** The player chose a place action: the character goes inside until it is done. */
  startedPlaceAction(placeId: string): void {
    const place = PLACES.find((p) => p.id === placeId) ?? null;
    this.inside = place;
    if (place && place.kind !== 'park') this.character.root.visible = false;
  }

  handleEvents(events: SimEvent[]): void {
    for (const e of events) {
      if (e.kind === 'actionDone' && e.objectInstanceId.startsWith('place:') && this.inside) {
        const door = this.hood?.doors.get(this.inside.id);
        if (door && this.player) this.player.place(door.x, door.z, door.heading + Math.PI);
        this.character.root.visible = true;
        this.inside = null;
      }
    }
  }

  update(dt: number, realDt: number, night: boolean): void {
    if (!this.active || !this.hood || !this.player) return;
    this.hood.setNight(night);
    this.syncBike();
    const busy = this.inside !== null || this.session.current !== null;
    const input = busy ? { x: 0, y: 0 } : this.joystick.read();
    this.player.run = this.player.run || this.joystick.runKey;
    if (!busy || this.inside?.kind === 'park') this.player.update(dt, input);
    else this.character.update(dt);
    const me = this.character.root.position;
    this.traffic?.update(dt, [{ x: me.x, z: me.z }, ...(this.walkers?.positions() ?? [])]);
    this.walkers?.update(dt);
    void realDt;

    // Nearest door within reach.
    let best: PlaceInfo | null = null;
    let bestD = 3;
    for (const p of PLACES) {
      const d = this.hood.doors.get(p.id);
      if (!d) continue;
      const dist = Math.hypot(d.x - me.x, d.z - me.z);
      if (dist < bestD) {
        bestD = dist;
        best = p;
      }
    }
    this.nearPlace = busy ? null : best;
    this.interactBtn.hidden = !this.nearPlace;
    if (this.nearPlace) this.interactBtn.textContent = `🚪 ${tDynamic(this.nearPlace.nameKey)}`;
    const bike = this.player.bike;
    this.rideBtn.hidden = !bike || busy || (!this.player.riding && Math.hypot(bike.position.x - me.x, bike.position.z - me.z) > 2.5);
  }
}
