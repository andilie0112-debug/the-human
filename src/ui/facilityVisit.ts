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
  loops: (ids: ('murmur' | 'hymn' | 'chant' | 'water')[]) => void;
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

  start(kind: FacilityKind, name: string, placeId = '', opts: FacilityStart = {}): void {
    this.kind = kind;
    this.placeId = placeId;
    this.placeActions = opts.actions ?? [];
    this.religion = opts.religion ?? 'islam';
    this.ordered = null;
    this.activity = null;
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
    // Station announcements over the speakers: chime, then the voice.
    const st = this.space.station();
    if (st) {
      st.onChime = () => this.hooks.sound('notify');
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

  private pose(st: Station): void {
    const ch = this.hooks.character();
    if (!ch) return;
    this.activity = st.pose === 'sit' ? 'sit' : 'pose';
    this.interior.paused = true;
    ch.root.position.set(st.x, 0, st.z);
    ch.root.rotation.y = st.heading;
    if (st.pose === 'sit') ch.playOnce('Sitting_Enter', () => ch.play('Sitting_Idle_Loop', 0.2));
    else if (st.pose === 'run') ch.play('Jog_Fwd_Loop', 0.3, 0.85);
    else if (st.pose === 'shop') ch.play('Interact', 0.3);
    else if (st.pose === 'browse') ch.play('Idle_TalkingPhone_Loop', 0.3);
    else ch.play('Idle_Talking_Loop', 0.3);
    if (st.actionId === 'eat_warung') ch.setGesture('eat');
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
      // Light the incense sticks and hold them up before praying.
      this.activity = 'dupa';
      this.interior.paused = true;
      ch.play('Interact', 0.3);
      this.hooks.toast(t('worship.incenseLit'));
      window.setTimeout(() => {
        if (this.activity !== 'dupa') return;
        this.activity = null;
        ch.play('Idle_Loop', 0.3);
        this.interior.paused = false;
      }, 3500);
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
      ch.playOnce('Sitting_Enter', () => ch.play('Sitting_Idle_Loop', 0.2));
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
    ch.play('Interact', 0.3, 0.8);
    if (holy?.water) holy.water.on = true;
    const steps = ['wudhu.1', 'wudhu.2', 'wudhu.3', 'wudhu.4', 'wudhu.5', 'wudhu.6', 'wudhu.7'] as const;
    steps.forEach((key, i) => window.setTimeout(() => {
      if (this.activity === 'wudhu') this.hooks.toast(`💧 ${t(key)}`);
    }, i * 1500));
    window.setTimeout(() => {
      if (this.activity !== 'wudhu') return;
      if (holy?.water) holy.water.on = false;
      this.activity = null;
      this.wudhu = true;
      ch.play('Idle_Loop', 0.3);
      this.interior.paused = false;
      this.hooks.toast(t('worship.wudhuDone'));
    }, steps.length * 1500 + 300);
  }

  /** Prayer murmur, hymns, chanting and running water, by what is happening inside. */
  private updateLoops(): void {
    const ids: ('murmur' | 'hymn' | 'chant' | 'water')[] = [];
    if (this.kind === 'worship') {
      const service = this.space?.worship()?.congregation?.inService || this.activity === 'pray';
      if (service) ids.push(this.religion === 'islam' ? 'murmur' : this.religion === 'kristen' || this.religion === 'katolik' ? 'hymn' : 'chant');
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
    if (workplace === 'office') ch.setGesture('type');
    this.hooks.toast(fmt(t('work.arrived'), { company }));
  }

  /** The shift is over: leave the workplace (the game takes the character home). */
  endWork(): void {
    if (this.activity !== 'work') return;
    const ch = this.hooks.character();
    ch?.setGesture(null);
    ch?.play('Idle_Loop', 0.2);
    this.activity = null;
    this.close();
    this.space = null;
    this.interior.exit();
  }

  /** Inside the mosque (the adzan is heard clearly there). */
  get inMosque(): boolean {
    return this.active && this.kind === 'worship' && this.religion === 'islam';
  }

  get atWork(): boolean {
    return this.activity === 'work';
  }

  /** Call every frame while inside: ends sitting or praying when the action is done. */
  update(): void {
    if (this.pendingStation && this.session.current?.def.id === this.pendingStation.actionId) {
      const st = this.pendingStation;
      this.pendingStation = null;
      this.pose(st);
    }
    this.updateLoops();
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
    if (was === 'sit') {
      this.ordered = null;
      ch.playOnce('Sitting_Exit', () => {
        ch.play('Idle_Loop', 0.3);
        this.interior.paused = false;
      });
      if (this.kind === 'cafe') this.staffSays(t('cafe.thanks'));
    } else if (was === 'pose') {
      ch.play('Idle_Loop', 0.3);
      this.interior.paused = false;
    } else if (this.sitting) {
      this.sitting = false;
      ch.playOnce('Sitting_Exit', () => {
        ch.play('Idle_Loop', 0.3);
        this.interior.paused = false;
      });
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
      this.staffSays(t('rs.medicine'));
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
          this.staffSays(fmt(t('trip.ticketOk'), { next: this.kind === 'station' ? t('station.gate') : t('airport.security') }));
        }, true, this.session.wallet.balance < o.cost);
      }
      this.button(box, t('store.back'), () => this.close());
      return;
    }
    if (id === checkZone) {
      if (!this.trip) return this.hooks.toast(t('trip.needTicket'));
      this.passed = true;
      this.hooks.sound('notify');
      this.hooks.toast(t('trip.scanned'));
      return;
    }
    if (id === boardZone) {
      if (!this.trip || !this.passed) return this.hooks.toast(t('trip.needTicket'));
      if (!this.boarding) {
        this.boarding = true;
        this.space?.arrive(this.trip.label.replace(/^.*?(ke|tujuan)\s+/i, ''));
        const dest = this.trip.label;
        this.staffSays(fmt(t(this.kind === 'station' ? 'trip.trainArriving' : 'trip.boarding'), { dest }));
        this.hooks.sound('bell');
        return;
      }
      // Board: the trip itself runs as time away from home.
      const action = this.session.tripAction(this.trip.kind);
      action.cost = this.trip.cost;
      this.leave(action);
    }
  }

  private leave(away: ActionDef | null = null): void {
    if (this.activity) return;
    this.hooks.loops([]);
    this.loopKey = '';
    this.close();
    this.space = null;
    this.interior.exit();
    this.hooks.onLeave(away ?? this.stay);
  }
}
