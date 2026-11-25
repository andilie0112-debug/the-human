import { fmt, t, tDynamic } from '../data/strings';
import type { ActionDef } from '../sim/actions';
import type { Payer } from '../sim/health';
import type { GameSession } from '../sim/session';
import type { Interior, Zone } from '../world/interior';
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

  constructor(
    private readonly session: GameSession,
    private readonly interior: Interior,
    private readonly hooks: FacilityHooks,
  ) {}

  get active(): boolean {
    return this.space !== null;
  }

  start(kind: FacilityKind, name: string): void {
    this.kind = kind;
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
    };
    this.space = buildFacility(kind, labels, this.session.city.trainLines);
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
    if (kind === 'hospital') this.hooks.toast(fmt(t('rs.welcome'), { name }));
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
    if (this.kind === 'hospital') return this.hospitalZone(zone.id);
    return this.tripZone(zone.id);
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
        this.space?.arrive();
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
    this.close();
    this.space = null;
    this.interior.exit();
    this.hooks.onLeave(away ?? this.stay);
  }
}
