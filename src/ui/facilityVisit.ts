import type { Gesture } from '../characters/humanModel';
import { placeSoundFor, type PlaceEvent, type PlaceSoundId } from '../engine/placeSounds';
import { fmt, t, tDynamic } from '../data/strings';
import type { ActionDef } from '../sim/actions';
import type { Payer } from '../sim/health';
import type { GameSession } from '../sim/session';
import type { Interior, Zone } from '../world/interior';
import type { HumanModel } from '../characters/humanModel';
import { WORSHIP } from '../characters/routines';
import { blockKey } from './actionMenu';
import { actionIcon } from './actionIcons';
import type { Station } from '../world/spaces/walkin';
import { simData } from '../sim/gameData';
import { Mesh, BoxGeometry, MeshStandardMaterial, Vector3, type Group, type Object3D } from 'three';
import { suitcase } from '../world/spaces/crowd';
import { handPropModel, type HandProp } from '../characters/accessories';
import { buildFacility, type FacilityKind, type FacilitySpace } from '../world/spaces/facility';
import { rupiah } from './format';

// Walking through the hospital, the station or the airport, step by step:
//   hospital: registration (BPJS / umum / insurance) -> wait for your number -> doctor -> pharmacy
//   station:  ticket office -> ticket gate -> platform, the train arrives -> board
//   airport:  check-in -> X-ray security -> departure gate -> board
// Leaving may start time away from home (a hospital stay or the trip itself).

export interface FacilityHooks {
  toast: (text: string) => void;
  speak: (text: string) => void;
  sound: (id: 'click' | 'pay' | 'notify' | 'bell') => void;
  onLeave: (away: ActionDef | null) => void;
  /** The player's character (posed for sitting and praying). */
  character: () => HumanModel | null;
  /** Place actions with their own screen (shop list, job board, asking for work). */
  placeUi: (placeId: string, action: ActionDef) => void;
  /** Background sounds inside (prayer murmur, hymns, chanting, running water). */
  loops: (ids: ('murmur' | 'hymn' | 'misa' | 'chant' | 'muyu' | 'water')[]) => void;
  /** The sound of the place (crowd, music, machines; null = leaving). */
  placeSound?: (id: PlaceSoundId | null) => void;
  /** Something heard at a moment (the train coming in, a boarding call). */
  placeEvent?: (ev: PlaceEvent) => void;
}

export interface FacilityStart {
  /** The place's own actions (café coffee, worship and visit). */
  actions?: ActionDef[];
  /** House of worship: its religion. */
  religion?: string;
  /** Airport: flight destinations for the board. */
  destinations?: string[];
  /** Walk-in places: which interior (warung, market, gym, mall, police, clinic). */
  variant?: string;
}

type TripPick = { kind: 'mudik' | number; label: string; cost: number };

export class FacilityVisit {
  private kind: FacilityKind = 'hospital';
  private space: FacilitySpace | null = null;
  private dialog: HTMLElement | null = null;
  // Hospital state.
  private payer: Payer | null = null;
  private number = '';
  private called = false;
  private treated = false;
  private stay: ActionDef | null = null;
  // Trip state.
  private trip: TripPick | null = null;
  private passed = false;
  private boarding = false;
  // Café and worship state.
  private placeId = '';
  private placeActions: ActionDef[] = [];
  private religion = 'islam';
  private ordered: ActionDef | null = null;
  private activity: 'sit' | 'pray' | 'pose' | 'work' | 'wudhu' | 'dupa' | null = null;
  /** What the character keeps in hand while walking about (shopping bag, queue slip, medicine). */
  private carried: HandProp | null = null;
  /** The spot of the pose now running (what to do when it ends). */
  private posed: Station | null = null;
  /** A tray or plate put down on the table while eating. */
  private onTable: Group | null = null;
  /** Ablution done (needed before sholat), joined the congregation's service. */
  private wudhu = false;
  private jamaah = false;
  private sitting = false;
  private loopKey = '';
  /** A walk-in action started from another screen (shopping): pose once it runs. */
  private pendingStation: Station | null = null;

  constructor(
    private readonly session: GameSession,
    private readonly interior: Interior,
    private readonly hooks: FacilityHooks,
  ) {}

  get active(): boolean {
    return this.space !== null;
  }

  private placeName = '';
  private startOpts: FacilityStart = {};

  start(kind: FacilityKind, name: string, placeId = '', opts: FacilityStart = {}): void {
    this.placeName = name;
    this.startOpts = opts;
    this.kind = kind;
    this.placeId = placeId;
    this.placeActions = opts.actions ?? [];
    this.religion = opts.religion ?? 'islam';
    this.ordered = null;
    this.activity = null;
    this.carried = null;
    this.posed = null;
    this.examined = false;
    this.clearTable();
    this.pendingStation = null;
    this.wudhu = false;
    this.jamaah = false;
    this.sitting = false;
    this.payer = null;
    this.called = false;
    this.treated = false;
    this.stay = null;
    this.trip = null;
    this.passed = false;
    this.boarding = false;
    const labels: Record<string, string> = {
      exit: `🚪 ${t('rs.exit')}`,
      loket: `🪪 ${kind === 'hospital' ? t('rs.register') : t('station.loket')}`,
      tunggu: `🪑 ${t('rs.wait')}`,
      dokter: `🩺 ${t('rs.doctor')}`,
      apotek: `💊 ${t('rs.pharmacy')}`,
      gerbang: `🎫 ${t('station.gate')}`,
      peron: `🚆 ${t('station.platform')}`,
      checkin: `🧳 ${t('airport.checkin')}`,
      xray: `🛃 ${t('airport.security')}`,
      gate: `🛫 ${t('airport.gate')}`,
      kasir: `☕ ${t('cafe.order')}`,
      meja: `🪑 ${t('cafe.sit')}`,
      ibadah: `🙏 ${t(this.religion === this.session.character.religionId ? 'worship.pray' : 'worship.visit')}`,
      wudhu: `💧 ${t('worship.wudhu')}`,
      dupa: `🪔 ${t('worship.incense')}`,
      'spot.naik': `⬆️ ${t('spot.naik')}`,
      'spot.turun': `⬇️ ${t('spot.turun')}`,
      'spot.latihan': `🏃 ${t('spot.latihan')}`,
      'spot.beban': `🏋️ ${t('spot.beban')}`,
      'spot.matras': `🧘 ${t('spot.matras')}`,
      'spot.bench': `💪 ${t('spot.bench')}`,
    };
    for (const a of this.placeActions) labels[a.id] ??= `${actionIcon(a.id)} ${tDynamic(a.labelKey)}`;
    const coffee = this.placeActions.find((a) => a.id === 'coffee');
    this.space = buildFacility(kind, labels, {
      destinations: kind === 'airport' ? opts.destinations : this.session.city.trainLines,
      religion: this.religion,
      variant: opts.variant,
      congregation: kind === 'worship' ? () => this.session.congregation(this.religion) : undefined,
      menu: [`Kopi susu aren  ${rupiah(coffee?.cost ?? 35000)}`, 'Es teh manis  Rp8.000', 'Roti bakar  Rp15.000', 'Pisang goreng  Rp10.000'],
    });
    this.interior.enter(this.space);
    this.hooks.placeSound?.(placeSoundFor(kind, opts.variant));
    // Travellers pull their suitcase into the airport.
    this.pullSuitcase(kind === 'airport');
    // Station announcements over the speakers: chime, then the voice.
    const st = this.space.station();
    if (st) {
      st.onChime = () => this.hooks.placeEvent?.('paChime');
      st.onSound = (ev) => this.hooks.placeEvent?.(ev);
      st.onAnnounce = (text) => {
        this.hooks.toast(`📢 ${text}`);
        this.hooks.speak(text);
      };
    }
    if (kind === 'hospital') {
      this.hooks.toast(fmt(t('rs.welcome'), { name }));
      this.space.onChime = () => this.hooks.sound('notify');
    }
    if (kind === 'cafe') this.staffSays(t('cafe.welcome'));
    if (kind === 'worship') this.hooks.toast(fmt(t('worship.welcome'), { name }));
  }

  // --- Dialog helpers ------------------------------------------------------------------------
  private open(title: string): HTMLElement {
    this.close();
    this.interior.paused = true;
    const back = document.createElement('div');
    back.className = 'dialog-backdrop';
    const box = document.createElement('div');
    box.className = 'dialog store-dialog';
    const h = document.createElement('div');
    h.className = 'dialog-title';
    h.textContent = title;
    box.append(h);
    back.append(box);
    document.body.append(back);
    this.dialog = back;
    return box;
  }

  private close(): void {
    this.dialog?.remove();
    this.dialog = null;
    this.interior.paused = false;
  }

  private text(box: HTMLElement, s: string): void {
    const p = document.createElement('p');
    p.textContent = s;
    box.append(p);
  }

  private button(box: HTMLElement, label: string, onClick: () => void, primary = false, disabled = false): void {
    const b = document.createElement('button');
    b.className = primary ? 'btn-primary' : 'btn-secondary';
    b.textContent = label;
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    box.append(b);
  }

  private staffSays(line: string): void {
    this.hooks.toast(`🗣️ "${line}"`);
    this.hooks.speak(line);
  }

  // --- Zones -----------------------------------------------------------------------------------
  onZone(zone: Zone): void {
    if (zone.id === 'exit') return this.leave();
    if (zone.id === 'talk') return this.talkTo();
    if (this.activity) return;
    if (this.kind === 'hospital') return this.hospitalZone(zone.id);
    if (this.kind === 'cafe') return this.cafeZone(zone.id);
    if (this.kind === 'worship') return this.worshipZone(zone.id);
    if (this.kind === 'walkin') return this.walkinZone(zone.id);
    return this.tripZone(zone.id);
  }

  // --- Walk-in places: each spot runs one of the place's actions ------------------------------

  private walkinZone(id: string): void {
    const st = this.space?.activity(id);
    const action = st && this.placeActions.find((a) => a.id === st.actionId);
    if (st?.actionId === 'escalator') return this.rideEscalator(st.id === 'naik');
    if (!st || !action) return;
    if (action.ui) {
      // Shopping list, job board or asking for work: their own screens.
      this.pendingStation = action.ui === 'shopNow' ? st : null;
      this.hooks.placeUi(this.placeId, action);
      return;
    }
    const block = this.session.actionBlock(action);
    if (block) return this.hooks.toast(t(blockKey(block)));
    if (!this.session.startAction(action, `place:${this.placeId}`)) return;
    if ((action.cost ?? 0) > 0) this.hooks.sound('pay');
    this.pose(st);
  }

  // --- Escalator between the mall's floors ------------------------------------------------------

  private ride: { from: Vector3; to: Vector3; t: number; dur: number; up: boolean } | null = null;

  private rideEscalator(up: boolean): void {
    const ch = this.hooks.character();
    if (!ch || this.ride) return;
    const x = ch.root.position.x;
    // Stand on the step and glide up (or down) the slope, then arrive on the other floor.
    const from = up ? new Vector3(x, 0, 4.4) : new Vector3(x, 0, 1.4);
    const to = up ? new Vector3(x, 3.0, -1.6) : new Vector3(x, -2.0, 5.2);
    this.ride = { from, to, t: 0, dur: 4, up };
    this.interior.paused = true;
    this.interior.setFloating(true);
    ch.root.position.copy(from);
    ch.root.rotation.y = up ? Math.PI : 0;
    ch.play('Idle_Loop', 0.3);
  }

  private updateRide(dt: number): void {
    const r = this.ride;
    const ch = this.hooks.character();
    if (!r || !ch) return;
    r.t += dt;
    const k = Math.min(1, r.t / r.dur);
    ch.root.position.lerpVectors(r.from, r.to, k);
    if (k < 1) return;
    this.ride = null;
    this.interior.setFloating(false);
    ch.root.position.y = 0;
    // The other floor of the mall.
    const actions = this.placeActions;
    const variant = r.up ? 'mall2' : 'mall';
    this.space = null;
    this.hooks.placeSound?.(null);
    this.interior.exit();
    this.start('walkin', this.placeName, this.placeId, { ...this.startOpts, actions, variant });
    if (!r.up) {
      ch.root.position.set(ch.root.position.x, 0, 5.4);
    }
    this.hooks.toast(t(r.up ? 'mall.up' : 'mall.down'));
  }

  // --- Talking with people you meet -------------------------------------------------------------

  private talkTo(): void {
    const m = this.interior.talkTarget;
    const ch = this.hooks.character();
    if (!m || !ch || !this.space) return;
    const s = this.session;
    // The first chat makes them an acquaintance (in the phone's contacts).
    let npc = s.npcs.find((n) => n.id === m.root.userData.npcId);
    if (!npc) {
      npc = s.meetSomeone('kenalan', true, m.gender) ?? undefined;
      if (!npc) return;
      m.root.userData.npcId = npc.id;
      this.hooks.toast(fmt(t('talk.met'), { name: npc.name }));
    }
    const who = npc;
    this.space.holdStill(m, true);
    m.lookAt(ch.root.position.x, 1.5, ch.root.position.z);
    m.root.rotation.y = Math.atan2(ch.root.position.x - m.root.position.x, ch.root.position.z - m.root.position.z);
    m.play('Idle_Talking_Loop', 0.3);
    ch.root.rotation.y = Math.atan2(m.root.position.x - ch.root.position.x, m.root.position.z - ch.root.position.z);
    ch.play('Idle_Talking_Loop', 0.3);
    const finish = (): void => {
      this.close();
      this.space?.holdStill(m, false);
      m.clearLook();
      m.play('Idle_Loop', 0.3);
      ch.play('Idle_Loop', 0.3);
    };
    const show = (line: string | null): void => {
      const box = this.open(fmt(t('talk.title'), { name: who.name }));
      if (line) this.text(box, line);
      else this.text(box, fmt(t('talk.hello'), { name: who.name }));
      for (const id of s.topicChoices(who.id)) {
        const topic = simData.config.social.topics.find((x) => x.id === id);
        this.button(box, `${topic?.icon ?? '💬'} ${tDynamic(`topic.${id}`)}`, () => {
          const { reaction } = s.talkTopic(who.id, id);
          const icon = reaction === 'like' ? '😄' : reaction === 'dislike' ? '😒' : '🙂';
          show(`${icon} ${fmt(t(`visit.${reaction}`), { name: who.name, topic: tDynamic(`topic.${id}`) })}`);
        });
      }
      this.button(box, t('talk.done'), finish, true);
    };
    show(null);
  }

  private pose(st: Station): void {
    const ch = this.hooks.character();
    if (!ch) return;
    this.interior.stopWalkIn();
    if (st.seat) return this.trayToSeat(st, st.seat);
    this.posed = st;
    this.activity = st.pose === 'sit' ? 'sit' : 'pose';
    this.interior.paused = true;
    ch.root.position.set(st.x, 0, st.z);
    ch.root.rotation.y = st.heading;
    // The bench press: sit on the bench and push the bar up and down.
    if (st.pose === 'sit') ch.playOnce('Sitting_Enter', () => {
      ch.play('Sitting_Idle_Loop', 0.2);
      if (st.id === 'bench') {
        ch.holdProp('barbel');
        ch.setGesture('press');
      }
    });
    else if (st.pose === 'run') ch.play('Jog_Fwd_Loop', 0.3, 0.85);
    else if (st.pose === 'lift') {
      // Dumbbell curls by the rack.
      ch.play('Idle_Loop', 0.3);
      ch.holdProp('dumbel');
      ch.setGesture('curl');
    }
    else if (st.pose === 'stretch') ch.play('Fixing_Kneeling', 0.3);
    else if (st.pose === 'shop') ch.play('Interact', 0.3);
    else if (st.pose === 'browse') ch.play('Idle_TalkingPhone_Loop', 0.3);
    else ch.play('Idle_Talking_Loop', 0.3);
    if (st.actionId === 'eat_warung') ch.setGesture('eat');
    if (st.actionId === 'see_doctor') this.doctorExam(st.x, st.z, [{ x: st.x - 1.0, z: st.z - 1.5 }, { x: st.x - 1.0, z: st.z }]);
  }

  /**
   * Food court: the order comes on a tray at the counter; carry it with both hands to a free
   * table, put it down, sit and eat with a spoon.
   */
  private trayToSeat(st: Station, seat: { x: number; z: number; heading: number }): void {
    const ch = this.hooks.character();
    if (!ch) return;
    this.interior.paused = true;
    ch.root.position.set(st.x, 0, st.z);
    ch.root.rotation.y = st.heading;
    ch.play('Interact', 0.2);
    this.staffSays(t('mall.trayReady'));
    window.setTimeout(() => {
      if (!this.active) return;
      ch.holdProp('nampan');
      // Round the bench to the seat's open side, then sit down.
      const back = seat.z + Math.cos(seat.heading) * -0.75;
      this.interior.autoWalk([{ x: st.x, z: back }, { x: seat.x, z: back }], () => {
        ch.holdProp(null);
        ch.root.position.set(seat.x, 0, seat.z);
        ch.root.rotation.y = seat.heading;
        this.putOnTable('nampan', seat.x + Math.sin(seat.heading) * 0.42, seat.z + Math.cos(seat.heading) * 0.42, seat.heading);
        this.posed = st;
        this.activity = 'sit';
        ch.playOnce('Sitting_Enter', () => {
          ch.play('Sitting_Idle_Loop', 0.2);
          ch.holdProp('sendok');
          ch.setGesture('eat');
        });
      }, 'Walk_Carry_Loop');
    }, 1400);
  }

  private putOnTable(kind: HandProp, x: number, z: number, heading: number, y = 0.775): void {
    const scene = this.hooks.character()?.root.parent;
    if (!scene) return;
    this.clearTable();
    const m = handPropModel(kind);
    m.position.set(x, y, z);
    m.rotation.y = heading;
    scene.add(m);
    this.onTable = m;
  }

  private clearTable(): void {
    const m = this.onTable;
    if (!m) return;
    m.removeFromParent();
    m.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        (o.material as MeshStandardMaterial).dispose();
      }
    });
    this.onTable = null;
  }

  /** The doctor nearest to this spot (the one who examines the patient). */
  private doctorNear(x: number, z: number): HumanModel | null {
    let best: HumanModel | null = null;
    let bd = 4;
    for (const m of this.space?.talkables?.() ?? []) {
      const d = Math.hypot(m.root.position.x - x, m.root.position.z - z);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  private exam: { doc: HumanModel; home: Vector3; heading: number; path: Vector3[]; back: Vector3[]; t: number; phase: 'go' | 'check' | 'back'; face: number; then?: () => void } | null = null;
  private examined = false;

  /**
   * The doctor comes round the desk (by `via`) with a stethoscope, stands beside the patient,
   * listens to the chest and checks the blood pressure, then goes back to the desk.
   */
  private doctorExam(px: number, pz: number, via: { x: number; z: number }[], then?: () => void): void {
    const doc = this.doctorNear(px, pz);
    const ch = this.hooks.character();
    if (!doc || !ch || !this.space || this.exam) return;
    this.space.holdStill(doc, true);
    const to = new Vector3(px - 0.6, 0, pz);
    const viaV = via.map((p) => new Vector3(p.x, 0, p.z));
    const home = doc.root.position.clone();
    this.exam = { doc, home, heading: doc.root.rotation.y, path: [...viaV, to], back: [...viaV.reverse(), home], t: 0, phase: 'go', face: Math.PI / 2, then };
    doc.holdProp('stetoskop');
  }

  private updateExam(dt: number): void {
    const e = this.exam;
    if (!e) return;
    if (e.phase === 'check') {
      e.t += dt;
      if (e.t > 4.5) {
        e.doc.setGesture(null);
        e.phase = 'back';
        e.then?.();
      }
      return;
    }
    const list = e.phase === 'go' ? e.path : e.back;
    const goal = list[0];
    const r = e.doc.root.position;
    if (!goal) {
      if (e.phase === 'go') {
        e.phase = 'check';
        e.t = 0;
        e.doc.root.rotation.y = e.face;
        e.doc.play('Idle_Loop', 0.25);
        e.doc.setGesture('holdUp');
        const bp = `${110 + Math.floor(Math.random() * 25)}/${70 + Math.floor(Math.random() * 15)}`;
        this.hooks.toast(fmt(t('rs.exam'), { bp }));
      } else {
        e.doc.root.rotation.y = e.heading;
        e.doc.play('Idle_Loop', 0.25);
        e.doc.holdProp(null);
        this.space?.holdStill(e.doc, false);
        this.exam = null;
      }
      return;
    }
    const dx = goal.x - r.x;
    const dz = goal.z - r.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.06) {
      list.shift();
      return;
    }
    const step = Math.min(d, 1.0 * dt);
    r.x += (dx / d) * step;
    r.z += (dz / d) * step;
    e.doc.root.rotation.y = Math.atan2(dx, dz);
    e.doc.play('Walk_Loop', 0.2);
  }

  private endExam(): void {
    const e = this.exam;
    if (!e) return;
    e.doc.root.position.copy(e.home);
    e.doc.root.rotation.y = e.heading;
    e.doc.setGesture(null);
    e.doc.holdProp(null);
    e.doc.play('Idle_Loop', 0.2);
    this.space?.holdStill(e.doc, false);
    this.exam = null;
  }

  // --- Café: order at the counter, then sit and enjoy it ----------------------------------------

  private cafeZone(id: string): void {
    const coffee = this.placeActions.find((a) => a.id === 'coffee');
    if (id === 'kasir') {
      if (!coffee) return;
      if (this.ordered) return this.staffSays(t('cafe.coming'));
      const box = this.open(`☕ ${t('cafe.order')}`);
      this.button(box, `${tDynamic(coffee.labelKey)} · ${rupiah(coffee.cost ?? 0)}`, () => {
        this.ordered = coffee;
        this.close();
        this.hooks.sound('click');
        this.staffSays(t('cafe.coming'));
      }, true, this.session.wallet.balance < (coffee.cost ?? 0));
      this.button(box, t('store.back'), () => this.close());
      return;
    }
    if (id === 'meja') {
      if (!this.ordered) return this.hooks.toast(t('cafe.orderFirst'));
      const seat = this.space?.spot('seat');
      const ch = this.hooks.character();
      if (!seat || !ch) return;
      if (!this.session.startAction(this.ordered, `place:${this.placeId}`)) return this.hooks.toast(t('block.money'));
      this.hooks.sound('pay');
      this.activity = 'sit';
      this.interior.paused = true;
      ch.root.position.set(seat.x, 0, seat.z);
      ch.root.rotation.y = seat.heading;
      ch.playOnce('Sitting_Enter', () => ch.play('Sitting_Idle_Loop', 0.2));
    }
  }

  // --- House of worship: pray in one's own faith, or visit respectfully -------------------------

  private worshipZone(id: string): void {
    const ch = this.hooks.character();
    if (!ch) return;
    if (id === 'wudhu') return this.doWudhu(ch);
    if (id === 'dupa') {
      // Light three incense sticks, hold them up to the forehead and bow three times, then stand
      // them in the burner.
      this.activity = 'dupa';
      this.interior.paused = true;
      ch.holdProp('dupa');
      ch.play('Interact', 0.3);
      this.hooks.toast(t('worship.incenseLit'));
      window.setTimeout(() => {
        if (this.activity !== 'dupa') return;
        ch.play('Idle_Loop', 0.3, 0.5);
        ch.setGesture('holdUp');
        this.hooks.toast(t('worship.incensePray'));
      }, 1800);
      window.setTimeout(() => {
        if (this.activity !== 'dupa') return;
        ch.setGesture(null);
        ch.play('Interact', 0.3);
        this.hooks.toast(t('worship.incensePlace'));
      }, 7000);
      window.setTimeout(() => {
        if (this.activity !== 'dupa') return;
        this.activity = null;
        ch.holdProp(null);
        ch.play('Idle_Loop', 0.3);
        this.interior.paused = false;
      }, 9000);
      return;
    }
    if (id !== 'ibadah') return;
    const own = this.religion === this.session.character.religionId;
    if (own && this.religion === 'islam' && !this.wudhu) return this.hooks.toast(t('worship.needWudhu'));
    const action = this.placeActions.find((a) => a.id === (own ? 'worship_place' : 'visit_place'));
    const holy = this.space?.worship();
    const service = holy?.congregation?.inService ?? false;
    // During a service you take your place among the others (a gap in the rows, a free seat).
    const spot = service && holy ? holy.join : this.space?.spot('prayer');
    if (!action || !spot) return;
    if (this.session.actionBlock(action, this.religion) || !this.session.startAction(action, `place:${this.placeId}`)) return;
    this.activity = 'pray';
    this.jamaah = own && service;
    this.interior.paused = true;
    ch.root.position.set(spot.x, 0, spot.z);
    ch.root.rotation.y = spot.heading;
    if ('sit' in spot && spot.sit) {
      // A church service: sit in the pew with everyone.
      this.sitting = true;
      ch.playOnce('Sitting_Enter', () => {
        ch.play('Sitting_Idle_Loop', 0.2);
        // The hymn book open on the lap, singing along.
        if (this.religion === 'kristen' || this.religion === 'katolik') {
          ch.holdProp('buku');
          ch.setGesture('read');
        }
      });
    } else if (own) {
      ch.play('Idle_Loop', 0.4, 0.4);
      ch.setRoutine(WORSHIP[this.religion] ?? null);
    } else {
      ch.play('Idle_Loop', 0.4);
    }
    if (this.jamaah) this.hooks.toast(t(this.religion === 'islam' ? 'worship.jamaah' : 'worship.joinService'));
  }

  /** Wudhu at the running taps, step by step. */
  private doWudhu(ch: HumanModel): void {
    if (this.religion !== 'islam' || this.activity) return;
    const spot = this.space?.spot('wudhu');
    const holy = this.space?.worship();
    if (!spot) return;
    this.activity = 'wudhu';
    this.interior.paused = true;
    ch.root.position.set(spot.x, 0, spot.z);
    ch.root.rotation.y = spot.heading;
    if (holy?.water) holy.water.on = true;
    // Each step of wudhu with its own movement: hands, mouth, nose, face, arms, head, feet.
    const steps: { key: string; gesture: Gesture; crouch?: boolean }[] = [
      { key: 'wudhu.1', gesture: 'washHands' },
      { key: 'wudhu.2', gesture: 'toMouth' },
      { key: 'wudhu.3', gesture: 'toMouth' },
      { key: 'wudhu.4', gesture: 'washFace' },
      { key: 'wudhu.5', gesture: 'washArms' },
      { key: 'wudhu.6', gesture: 'wipeHead' },
      { key: 'wudhu.7', gesture: 'washHands', crouch: true },
    ];
    const STEP = 2200;
    steps.forEach((st, i) => window.setTimeout(() => {
      if (this.activity !== 'wudhu') return;
      this.hooks.toast(`💧 ${t(st.key as 'wudhu.1')}`);
      ch.play(st.crouch ? 'Crouch_Idle_Loop' : 'Idle_Loop', 0.3, 0.5);
      ch.setGesture(st.gesture);
    }, i * STEP));
    window.setTimeout(() => {
      if (this.activity !== 'wudhu') return;
      if (holy?.water) holy.water.on = false;
      this.activity = null;
      this.wudhu = true;
      ch.setGesture(null);
      ch.play('Idle_Loop', 0.3);
      this.interior.paused = false;
      this.hooks.toast(t('worship.wudhuDone'));
    }, steps.length * STEP + 300);
  }

  /** Prayer murmur, hymns, chanting and running water, by what is happening inside. */
  private updateLoops(): void {
    const ids: ('murmur' | 'hymn' | 'misa' | 'chant' | 'muyu' | 'water')[] = [];
    if (this.kind === 'worship') {
      const service = this.space?.worship()?.congregation?.inService || this.activity === 'pray';
      const r = this.religion;
      if (service) ids.push(r === 'islam' ? 'murmur' : r === 'kristen' ? 'hymn' : r === 'katolik' ? 'misa' : r === 'buddha' || r === 'konghucu' ? 'muyu' : 'chant');
      if (this.activity === 'wudhu') ids.push('water');
    }
    const key = ids.join();
    if (key === this.loopKey) return;
    this.loopKey = key;
    this.hooks.loops(ids);
  }

  /** Shows the shift at the workplace: the character works at their spot while time races. */
  startWork(workplace: 'office' | 'factory' | 'counter', company: string): void {
    this.start('walkin', company, '', { variant: `work_${workplace}` });
    const st = this.space?.activity('kerja');
    const ch = this.hooks.character();
    if (!st || !ch) return;
    this.pose(st);
    this.activity = 'work';
    if (workplace === 'office') {
      ch.setGesture('type');
      // A cup of coffee on the desk beside the keyboard.
      const h = st.heading;
      this.putOnTable('cangkir', st.x + Math.sin(h) * 0.5 - Math.cos(h) * 0.5, st.z + Math.cos(h) * 0.5 + Math.sin(h) * 0.5, h, 0.825);
    }
    this.hooks.toast(fmt(t('work.arrived'), { company }));
  }

  /** The shift is over: leave the workplace (the game takes the character home). */
  endWork(): void {
    if (this.activity !== 'work') return;
    this.clearTable();
    const ch = this.hooks.character();
    ch?.setGesture(null);
    ch?.play('Idle_Loop', 0.2);
    this.activity = null;
    this.close();
    this.space = null;
    this.hooks.placeSound?.(null);
    this.interior.exit();
  }

  /** Inside the mosque (the adzan is heard clearly there). */
  get inMosque(): boolean {
    return this.active && this.kind === 'worship' && this.religion === 'islam';
  }

  get atWork(): boolean {
    return this.activity === 'work';
  }

  /**
   * Gets up from a seat and gives the controls back. If anything cuts the stand-up animation
   * short, the controls still come back (the character must never be stuck).
   */
  private standUp(ch: HumanModel): void {
    let done = false;
    const free = (): void => {
      if (done) return;
      done = true;
      ch.play('Idle_Loop', 0.3);
      this.interior.paused = false;
    };
    ch.playOnce('Sitting_Exit', free);
    window.setTimeout(free, 2500);
  }

  /** Call every frame while inside: ends sitting or praying when the action is done. */
  update(dt = 1 / 60): void {
    if (this.ride) this.updateRide(dt);
    if (this.pendingStation && this.session.current?.def.id === this.pendingStation.actionId) {
      const st = this.pendingStation;
      this.pendingStation = null;
      this.pose(st);
    }
    this.updateLoops();
    this.updateExam(dt);
    if (!this.activity || this.activity === 'work' || this.activity === 'wudhu' || this.activity === 'dupa') return;
    const ch = this.hooks.character();
    const p = this.session.progress();
    // Praying together: in step with the imam and the rows; alone: at your own pace.
    const cong = this.space?.worship()?.congregation;
    if (this.activity === 'pray' && this.jamaah && cong?.inService) ch?.setRoutineProgress(cong.routineFraction());
    else if (p && this.activity === 'pray') ch?.setRoutineProgress(p.fraction);
    if (this.session.current) return;
    const was = this.activity;
    this.activity = null;
    if (!ch) {
      this.interior.paused = false;
      return;
    }
    ch.setGesture(null);
    // Bought clothes come in a shopping bag, carried from then on.
    if (this.posed?.actionId === 'mall_clothes') {
      this.carried = 'kantong';
      this.staffSays(t('mall.bagReady'));
    }
    this.posed = null;
    this.clearTable();
    ch.holdProp(this.carried);
    if (was === 'sit') {
      this.ordered = null;
      this.standUp(ch);
      if (this.kind === 'cafe') this.staffSays(t('cafe.thanks'));
    } else if (was === 'pose') {
      ch.play('Idle_Loop', 0.3);
      this.interior.paused = false;
    } else if (this.sitting) {
      this.sitting = false;
      this.standUp(ch);
      this.hooks.toast(t('worship.done'));
    } else {
      ch.setRoutine(null);
      ch.play('Idle_Loop', 0.3);
      this.interior.paused = false;
      this.hooks.toast(t('worship.done'));
    }
  }

  private hospitalZone(id: string): void {
    const s = this.session;
    if (id === 'loket') {
      const box = this.open(t('rs.register'));
      if (this.payer) {
        this.text(box, fmt(t('rs.number'), { number: this.number }));
        this.button(box, t('store.done'), () => this.close(), true);
        return;
      }
      for (const payer of s.payerOptions()) {
        this.button(box, tDynamic(`rs.payer.${payer}`), () => {
          const r = s.hospitalRegister(payer);
          if (!r) return this.hooks.toast(t('block.money'));
          this.payer = payer;
          this.number = r.number;
          // The printed queue slip, kept in hand until the doctor.
          this.carried = 'nomor';
          this.hooks.character()?.holdProp('nomor');
          this.close();
          this.hooks.sound('click');
          this.staffSays(fmt(t('rs.number'), { number: r.number }));
          if (r.fee > 0) this.hooks.toast(fmt(t('rs.admin'), { fee: rupiah(r.fee) }));
        }, payer !== 'umum');
      }
      if (!s.bpjsActive()) this.button(box, t('rs.joinBpjs'), () => {
        s.registerBpjsMandiri();
        this.hooks.toast(t('rs.joined'));
        this.hospitalZone('loket');
      });
      if (!s.character.asuransi) this.button(box, t('rs.joinInsurance'), () => {
        s.buyInsurance();
        this.hooks.toast(t('rs.joined'));
        this.hospitalZone('loket');
      });
      this.button(box, t('store.back'), () => this.close());
      return;
    }
    if (id === 'tunggu') {
      if (!this.payer) return this.hooks.toast(t('rs.needNumber'));
      if (this.called) return;
      // Sitting in the waiting room until the number is called (time passes).
      const wait = this.payer === 'bpjs' ? 90 : this.payer === 'umum' ? 35 : 20;
      this.hooks.toast(fmt(t('rs.waitInfo'), { min: wait }));
      this.session.simulate(wait);
      this.called = true;
      this.space?.callNumber(this.number);
      this.hooks.sound('bell');
      this.staffSays(fmt(t('rs.called'), { number: this.number }));
      return;
    }
    if (id === 'dokter') {
      if (!this.payer) return this.hooks.toast(t('rs.needNumber'));
      if (!this.called) return this.hooks.toast(t('rs.notCalled'));
      if (this.treated) return this.hooks.toast(t('rs.done'));
      if (!this.examined) {
        // First the examination: the doctor comes round with the stethoscope and the cuff.
        const ch = this.hooks.character();
        if (ch) {
          this.examined = true;
          this.carried = null;
          ch.holdProp(null);
          this.interior.paused = true;
          ch.root.position.set(0, 0, -3.7);
          ch.root.rotation.y = Math.PI;
          ch.play('Idle_Loop', 0.25);
          this.doctorExam(0, -3.7, [{ x: -1.1, z: -5.4 }, { x: -1.1, z: -3.7 }], () => {
            this.interior.paused = false;
            this.hospitalZone('dokter');
          });
          return;
        }
      }
      const d = s.diagnosis();
      const box = this.open(`🩺 ${t('rs.doctor')}`);
      this.text(box, tDynamic(d.textKey));
      this.hooks.speak(tDynamic(d.textKey));
      this.text(box, t('rs.choose'));
      const payer = this.payer;
      for (const tr of d.treatments) {
        const covered = payer === 'bpjs' ? tr.bpjs : payer === 'asuransi' ? tr.insurance : false;
        const pay = covered ? 0 : tr.cost;
        const label = `${tDynamic(tr.labelKey)} · ${rupiah(tr.cost)} · ${covered ? `✅ ${t('rs.covered')}` : payer === 'umum' ? t('rs.pay').replace('{amount}', rupiah(pay)) : `❌ ${t('rs.notCovered')}`}`;
        this.button(box, label, () => {
          const r = s.treat(tr, payer);
          if (!r) return this.hooks.toast(t('block.money'));
          this.treated = true;
          this.stay = r.stay;
          if (r.paid > 0) this.hooks.sound('pay');
          this.close();
          this.staffSays(t('rs.done'));
        }, true, s.wallet.balance < pay);
      }
      this.button(box, t('store.back'), () => this.close());
      return;
    }
    if (id === 'apotek') {
      if (!this.treated) return this.hooks.toast(t('rs.notCalled'));
      this.staffSays(t('rs.medicineBag'));
      this.carried = 'kantongObat';
      this.hooks.character()?.holdProp('kantongObat');
    }
  }

  private tripOptions(): TripPick[] {
    const s = this.session;
    const mode = this.kind === 'station' ? 'kereta' : 'pesawat';
    const m = s.mudikInfo();
    const out: TripPick[] = [{ kind: 'mudik', label: fmt(t('tiket.mudik'), { region: m.region }), cost: Math.round(m.cost * (mode === 'kereta' ? 0.8 : 1.2)) }];
    s.trips.forEach((tr, i) => {
      if ((tr.mode ?? 'pesawat') === mode) out.push({ kind: i, label: fmt(t('tiket.trip'), { dest: tr.destination }), cost: tr.cost });
    });
    return out;
  }

  private tripZone(id: string): void {
    const ticketZone = this.kind === 'station' ? 'loket' : 'checkin';
    const checkZone = this.kind === 'station' ? 'gerbang' : 'xray';
    const boardZone = this.kind === 'station' ? 'peron' : 'gate';
    if (id === ticketZone) {
      const box = this.open(t('trip.choose'));
      for (const o of this.tripOptions()) {
        this.button(box, `${o.label} · ${rupiah(o.cost)}`, () => {
          this.trip = o;
          this.close();
          this.hooks.sound('click');
          if (this.kind === 'airport') this.checkInSuitcase();
          this.staffSays(fmt(t('trip.ticketOk'), { next: this.kind === 'station' ? t('station.gate') : t('airport.security') }));
        }, true, this.session.wallet.balance < o.cost);
      }
      this.button(box, t('store.back'), () => this.close());
      return;
    }
    if (id === checkZone) {
      if (!this.trip) return this.hooks.toast(t('trip.needTicket'));
      if (this.passed) return;
      const ch = this.hooks.character();
      const z = this.space?.zones.find((x) => x.id === checkZone);
      if (!ch || !z) return;
      this.passed = true;
      this.interior.paused = true;
      if (this.kind === 'station') {
        // Tap the card on the reader, the gate beeps, and walk through the gap to the platform.
        ch.holdProp('kartu');
        ch.play('Interact', 0.2);
        window.setTimeout(() => {
          this.hooks.sound('click');
          this.hooks.toast(t('trip.scanned'));
          ch.holdProp(null);
          this.interior.autoWalk([{ x: z.x, z: 0.5 }, { x: z.x, z: -0.9 }], () => (this.interior.paused = false));
        }, 1100);
      } else {
        // The bag goes into a tray on the X-ray belt; walk through the scanner and pick it up.
        ch.play('PickUp_Table', 0.2, 0.9);
        const tray = this.trayOnBelt(z.x - 0.9, z.z);
        window.setTimeout(() => {
          this.hooks.sound('notify');
          this.hooks.toast(t('trip.xray'));
          this.interior.autoWalk([{ x: z.x, z: 0.6 }, { x: z.x, z: -0.9 }], () => {
            tray?.removeFromParent();
            this.interior.paused = false;
            this.hooks.toast(t('trip.scanned'));
          });
        }, 1600);
      }
      return;
    }
    if (id === boardZone) {
      if (!this.trip || !this.passed) return this.hooks.toast(t('trip.needTicket'));
      const ch = this.hooks.character();
      if (!this.boarding) {
        this.boarding = true;
        this.space?.arrive(this.trip.label.replace(/^.*?(ke|tujuan)\s+/i, ''));
        const dest = this.trip.label;
        this.staffSays(fmt(t(this.kind === 'station' ? 'trip.trainArriving' : 'trip.boarding'), { dest }));
        if (this.kind === 'airport') this.hooks.placeEvent?.('boarding');
        else this.hooks.sound('bell');
        // Waiting behind the yellow line, looking at the phone.
        if (ch && this.kind === 'station') {
          ch.holdProp('hp');
          ch.setGesture('read');
        }
        return;
      }
      const action = this.session.tripAction(this.trip.kind);
      action.cost = this.trip.cost;
      if (!ch) return this.leave(action);
      if (this.kind === 'station') {
        // Only once the doors are open: walk to the nearest door and step into the carriage.
        if (!this.space?.station()?.doorsOpen()) return this.hooks.toast(t('trip.waitTrain'));
        ch.holdProp(null);
        ch.setGesture(null);
        const r = ch.root.position;
        const doorX = [-6, -2, 2, 6].reduce((a, b) => (Math.abs(b - r.x) < Math.abs(a - r.x) ? b : a));
        this.interior.paused = true;
        this.interior.autoWalk([{ x: doorX, z: -3.0 }, { x: doorX, z: -4.0 }], () => {
          this.interior.paused = false;
          this.leave(action);
        });
      } else {
        // Show the boarding pass at the gate, then walk down the jet bridge.
        const z = this.space?.zones.find((x) => x.id === boardZone);
        ch.holdProp('tiket');
        ch.play('Interact', 0.2);
        this.interior.paused = true;
        this.staffSays(t('trip.passOk'));
        window.setTimeout(() => {
          ch.holdProp(null);
          this.interior.autoWalk([{ x: (z?.x ?? 6) - 0.4, z: (z?.z ?? -3.5) - 0.8 }, { x: (z?.x ?? 6) - 0.4, z: (z?.z ?? -3.5) - 2.4 }], () => {
            this.interior.paused = false;
            this.leave(action);
          });
        }, 1400);
      }
    }
  }

  /** A grey tray with a bag in it, sliding along the X-ray belt. */
  private trayOnBelt(x: number, z: number): Object3D | null {
    const ch = this.hooks.character();
    const scene = ch?.root.parent;
    if (!scene) return null;
    const tray = new Mesh(new BoxGeometry(0.5, 0.08, 0.36), new MeshStandardMaterial({ color: '#7f8c8d', roughness: 0.6 }));
    const bag = new Mesh(new BoxGeometry(0.34, 0.2, 0.2), new MeshStandardMaterial({ color: '#2c3e50', roughness: 0.7 }));
    bag.position.y = 0.14;
    tray.add(bag);
    tray.position.set(x, 0.85, z + 0.2);
    scene.add(tray);
    const start = performance.now();
    const slide = (): void => {
      const k = Math.min(1, (performance.now() - start) / 2500);
      tray.position.z = z + 0.2 - k * 1.4;
      if (k < 1 && tray.parent) requestAnimationFrame(slide);
    };
    requestAnimationFrame(slide);
    return tray;
  }

  /** The suitcase the player pulls into the airport (handed in at check-in). */
  private koper: Group | null = null;

  private pullSuitcase(on: boolean): void {
    const ch = this.hooks.character();
    if (on && ch && !this.koper) {
      const k = suitcase();
      const s = 1 / (ch.root.scale.x || 1);
      k.scale.setScalar(s);
      k.position.set(-0.32 * s, 0, -0.25 * s);
      ch.root.add(k);
      this.koper = k;
    } else if (!on && this.koper) {
      this.koper.removeFromParent();
      this.koper = null;
    }
  }

  /** At check-in the suitcase is weighed and rides off on the belt behind the counter. */
  private checkInSuitcase(): void {
    const ch = this.hooks.character();
    const k = this.koper;
    if (!ch || !k) return;
    const scene = ch.root.parent;
    k.getWorldPosition(this.tmp);
    this.pullSuitcase(false);
    if (!scene) return;
    const bag = suitcase();
    bag.position.set(this.tmp.x - 0.3, 0.05, this.tmp.z - 0.6);
    scene.add(bag);
    const start = performance.now();
    const ride = (): void => {
      const k2 = Math.min(1, (performance.now() - start) / 3000);
      bag.position.x = this.tmp.x - 0.3 - k2 * 2.0;
      if (k2 < 1) requestAnimationFrame(ride);
      else bag.removeFromParent();
    };
    requestAnimationFrame(ride);
  }

  private readonly tmp = new Vector3();

  private leave(away: ActionDef | null = null): void {
    if (this.activity) return;
    this.pullSuitcase(false);
    this.endExam();
    this.clearTable();
    this.carried = null;
    this.posed = null;
    const ch = this.hooks.character();
    ch?.holdProp(null);
    ch?.setGesture(null);
    this.hooks.loops([]);
    this.loopKey = '';
    this.close();
    this.space = null;
    this.hooks.placeSound?.(null);
    this.interior.exit();
    this.hooks.onLeave(away ?? this.stay);
  }
}
