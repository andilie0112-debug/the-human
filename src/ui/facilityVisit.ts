import { fmt, t, tDynamic } from '../data/strings';
import type { ActionDef } from '../sim/actions';
import type { Payer } from '../sim/health';
import type { GameSession } from '../sim/session';
import type { Interior, Zone } from '../world/interior';
import type { HumanModel } from '../characters/humanModel';
import { WORSHIP } from '../characters/routines';
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
}

export interface FacilityStart {
  /** The place's own actions (café coffee, worship and visit). */
  actions?: ActionDef[];
  /** House of worship: its religion. */
  religion?: string;
  /** Airport: flight destinations for the board. */
  destinations?: string[];
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
  private activity: 'sit' | 'pray' | null = null;

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
    };
    const coffee = this.placeActions.find((a) => a.id === 'coffee');
    this.space = buildFacility(kind, labels, {
      destinations: kind === 'airport' ? opts.destinations : this.session.city.trainLines,
      religion: this.religion,
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
    return this.tripZone(zone.id);
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
    if (id === 'wudhu') {
      this.hooks.toast(t('worship.wudhuDone'));
      return;
    }
    if (id !== 'ibadah' || !ch) return;
    const own = this.religion === this.session.character.religionId;
    const action = this.placeActions.find((a) => a.id === (own ? 'worship_place' : 'visit_place'));
    const spot = this.space?.spot('prayer');
    if (!action || !spot) return;
    if (this.session.actionBlock(action, this.religion) || !this.session.startAction(action, `place:${this.placeId}`)) return;
    this.activity = 'pray';
    this.interior.paused = true;
    ch.root.position.set(spot.x, 0, spot.z);
    ch.root.rotation.y = spot.heading;
    if (own) {
      ch.play('Idle_Loop', 0.4, 0.4);
      ch.setRoutine(WORSHIP[this.religion] ?? null);
    } else {
      ch.play('Idle_Loop', 0.4);
    }
  }

  /** Call every frame while inside: ends sitting or praying when the action is done. */
  update(): void {
    if (!this.activity) return;
    const ch = this.hooks.character();
    const p = this.session.progress();
    if (p && this.activity === 'pray') ch?.setRoutineProgress(p.fraction);
    if (this.session.current) return;
    const was = this.activity;
    this.activity = null;
    if (!ch) {
      this.interior.paused = false;
      return;
    }
    if (was === 'sit') {
      this.ordered = null;
      ch.playOnce('Sitting_Exit', () => {
        ch.play('Idle_Loop', 0.3);
        this.interior.paused = false;
      });
      this.staffSays(t('cafe.thanks'));
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
    this.close();
    this.space = null;
    this.interior.exit();
    this.hooks.onLeave(away ?? this.stay);
  }
}
