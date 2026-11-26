import { Group } from 'three';
import { fmt, t, tDynamic } from '../data/strings';
import { HumanModel } from '../characters/humanModel';
import { rupiah } from '../ui/format';
import type { ObjectDef } from '../data/objectCatalog';
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { ObjectInstance } from '../home/kosRoom';
import type { ActionDef } from '../sim/actions';
import type { GameSession, SimEvent } from '../sim/session';
import { minuteOfDay } from '../sim/time';
import { Joystick } from '../ui/joystick';
import { createNeighborhood, type Neighborhood, type PlaceData } from './neighborhood';
import { Pedestrians } from './pedestrians';
import { Weather } from './rain';
import { PlayerController } from './playerController';
import { Traffic, motorbike } from './traffic';
import places from '../data/places.json';
import { cityLabels } from './cityLook';

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
  /** Plays a one-shot sound (whistle...). */
  sound?: (id: 'whistle' | 'alarm') => void;
  /** The police caught the player. */
  onArrest?: () => void;
}

export class Outdoor {
  active = false;
  private hood: Neighborhood | null = null;
  private traffic: Traffic | null = null;
  private walkers: Pedestrians | null = null;
  private weather: Weather | null = null;
  /** The player's position, for people who turn to look (reused every frame). */
  private readonly focus = { x: 0, z: 0 };
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
  private labels: Record<string, string> = {};
  private greeted = false;
  private nearParkir = false;
  private police: HumanModel | null = null;
  private policeLoading = false;
  private readonly pickBtn: HTMLButtonElement;
  private nearWalker = false;
  private pickCooldown = 0;

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
    this.pickBtn = this.makeBtn(t('crime.pickpocket'));
    this.pickBtn.hidden = true;
    this.pickBtn.addEventListener('click', () => {
      const r = this.session.pickpocket();
      if (r.seen) {
        this.hooks.sound?.('whistle');
        this.hooks.toast(t('crime.seen.copet'));
      } else this.hooks.toast(fmt(t('crime.free.copet'), { amount: rupiah(r.loot) }));
      this.pickBtn.hidden = true;
      this.pickCooldown = 20;
    });
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
    this.labels = cityLabels(this.session.city);
    this.hood = createNeighborhood(PLACES, this.labels);
    const city = this.session.city;
    this.traffic = new Traffic(this.hood.scene, 9, { angkotColor: city.angkot ? city.angkotColor : undefined, bajaj: city.id === 'jkt' });
    this.walkers = new Pedestrians(this.hood.scene);
    this.walkers.groundY = 0.14;
    this.player = new PlayerController(this.character, this.hood.colliders, this.hood.bounds, undefined, this.hood.heightAt);
    const kos = this.hood.doors.get('kos')!;
    this.player.bikeAt = { x: kos.x + 3, z: kos.z + 1.5, heading: 0 };
    // Rain, puddles on the road and the sidewalks, floods.
    const puddles: { x: number; z: number; r: number }[] = [];
    for (let i = 0; i < 40; i++) puddles.push({ x: (Math.random() - 0.5) * 110, z: (Math.random() - 0.5) * 7.5, r: 0.5 + Math.random() * 1.1 });
    this.weather = new Weather(this.hood.scene, puddles);
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
    if (!this.greeted) {
      this.greeted = true;
      this.hooks.toast(fmt(t('city.greeting'), { text: this.session.city.localGreeting }));
    }
  }

  /** Leaves the neighborhood (the caller shows the home again). */
  exit(): void {
    if (this.player?.riding) this.toggleRide();
    this.police?.dispose();
    this.police = null;
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
    // The monthly job fair at the mall.
    if (place.kind === 'mall' && this.session.career.isJobFair(this.session.clock.minutes)) return [{ id: 'bursa_kerja', labelKey: 'act.jobFair', durationMinutes: 10, ui: 'jobFair', animation: 'stand' }];
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

  /** Police officers look for wanted people: one comes jogging towards you (run or ride away). */
  private updatePolice(dt: number, x: number, z: number): void {
    const wanted = this.session.crime.wanted > 0;
    if (wanted && !this.police && !this.policeLoading && this.hood) {
      this.policeLoading = true;
      void HumanModel.load({ body: 'male', skinTone: '#be8c69', hair: 'Hair_Buzzed', hairColor: '#1a1310', shirtColor: '#8a6d3b', topStyle: 'kemeja', longSleeve: false, pantsColor: '#4a3520', shoesColor: '#1c1a18', shoeStyle: 'pantofel' }).then((m) => {
        this.policeLoading = false;
        if (!this.hood || !this.active) {
          m.dispose();
          return;
        }
        // Appears down the road, about 25 m away.
        const me = this.character.root.position;
        m.root.position.set(me.x + (me.x > 0 ? -25 : 25), 0, 0);
        m.play('Jog_Fwd_Loop', 0);
        this.hood.scene.add(m.root);
        this.police = m;
        this.hooks.toast(t('crime.policeComing'));
      });
    }
    const p = this.police;
    if (!p) return;
    if (!wanted) {
      p.dispose();
      this.police = null;
      return;
    }
    const dx = x - p.root.position.x;
    const dz = z - p.root.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.0 && this.inside === null) {
      p.dispose();
      this.police = null;
      this.hooks.onArrest?.();
      return;
    }
    if (d > 70) {
      // Lost you: he gives up for now.
      p.dispose();
      this.police = null;
      return;
    }
    const speed = 3.1;
    p.root.position.x += (dx / d) * speed * dt;
    p.root.position.z += (dz / d) * speed * dt;
    p.root.rotation.y = Math.atan2(dx, dz);
    p.update(dt);
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
    const w = this.session.weatherNow();
    this.weather?.set(w.intensity, w.flooded);
    this.hood.setGloom(this.weather?.gloom ?? 0);
    if (this.player) this.player.speedFactor = w.flooded ? 0.55 : 1;
    this.syncBike();
    const busy = this.inside !== null || this.session.current !== null;
    const input = busy ? { x: 0, y: 0 } : this.joystick.read();
    this.player.run = this.player.run || this.joystick.runKey;
    if (!busy || this.inside?.kind === 'park') this.player.update(dt, input);
    else this.character.update(dt);
    const me = this.character.root.position;
    this.traffic?.update(dt, [{ x: me.x, z: me.z }, ...(this.walkers?.positions() ?? [])]);
    this.focus.x = me.x;
    this.focus.z = me.z;
    this.walkers?.update(dt, this.focus);
    this.weather?.update(dt, me.x, me.z);
    this.hood.update(dt, this.focus);
    this.updatePolice(dt, me.x, me.z);
    // Pickpocketing: only when a neighbour walks right past you.
    this.pickCooldown = Math.max(0, this.pickCooldown - realDt);
    this.nearWalker = !busy && !this.player.riding && this.pickCooldown === 0 && (this.walkers?.positions() ?? []).some((w) => Math.hypot(w.x - me.x, w.z - me.z) < 1.4);
    this.pickBtn.hidden = !this.nearWalker;
    // The parking attendant whistles when you walk away from the minimarket.
    const pk = this.hood.parkir;
    if (pk) {
      const d = Math.hypot(pk.x - me.x, pk.z - me.z);
      if (d < 4) this.nearParkir = true;
      else if (d > 7 && this.nearParkir) {
        this.nearParkir = false;
        this.hooks.sound?.('whistle');
      }
    }
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
    if (this.nearPlace) this.interactBtn.textContent = `🚪 ${this.labels[this.nearPlace.id] ?? tDynamic(this.nearPlace.nameKey)}`;
    const bike = this.player.bike;
    this.rideBtn.hidden = !bike || busy || (!this.player.riding && Math.hypot(bike.position.x - me.x, bike.position.z - me.z) > 2.5);
  }
}
