import { fmt, t, tDynamic } from '../data/strings';
import { SKILLS } from '../sim/career';
import type { GameSession } from '../sim/session';
import { dayIndex, fromDate, toParts } from '../sim/time';
import { SLOTS, type SaveStorage, type SlotId } from '../save/saveStorage';
import { decodeSave, encodeSave } from '../save/saveCodec';
import { clockTime, longDate, rupiah } from './format';
import { messageText } from './messages';

// The in-game smartphone: a home screen of apps drawn in HTML over the game.

type App = 'home' | 'loker' | 'bank' | 'chat' | 'kalender' | 'notif' | 'profil' | 'simpan' | 'properti';

const APPS: { id: Exclude<App, 'home'>; icon: string }[] = [
  { id: 'loker', icon: '💼' },
  { id: 'bank', icon: '🏦' },
  { id: 'chat', icon: '💬' },
  { id: 'kalender', icon: '📅' },
  { id: 'notif', icon: '🔔' },
  { id: 'profil', icon: '🧍' },
  { id: 'properti', icon: '🏠' },
  { id: 'simpan', icon: '💾' },
];

export interface PhoneHooks {
  /** Opens build mode on the shop tab (the Toko app). */
  openShop: () => void;
  /** Called after moving house (the scene must be rebuilt). */
  onMoved: () => void;
}

export class Phone {
  private readonly root: HTMLElement;
  private app: App = 'home';
  private lokerTab: 'lowongan' | 'lamaran' | 'kerja' = 'lowongan';
  private readonly notifications: { time: number; text: string }[] = [];
  private unreadChat = 0;
  private readonly button: HTMLButtonElement;

  constructor(
    private readonly session: GameSession,
    private readonly storage: SaveStorage,
    private readonly onSaved: (slot: SlotId) => void,
    private readonly toast: (text: string) => void,
    private readonly hooks: PhoneHooks,
  ) {
    this.button = document.createElement('button');
    this.button.className = 'phone-btn';
    this.button.textContent = '📱';
    this.button.addEventListener('click', () => this.toggle());
    document.body.append(this.button);
    this.root = document.createElement('div');
    this.root.className = 'phone';
    this.root.hidden = true;
    document.body.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
    if (!this.root.hidden) {
      this.app = 'home';
      this.render();
    }
  }

  /** Records a notification (shown in the Notifikasi app). */
  notify(text: string, isChat = false): void {
    this.notifications.unshift({ time: this.session.clock.minutes, text });
    if (this.notifications.length > 60) this.notifications.pop();
    if (isChat) this.unreadChat++;
    this.button.classList.toggle('badge', this.unreadChat > 0);
    if (this.isOpen) this.render();
  }

  /** Re-renders the open app (e.g. after the day changes). */
  refresh(): void {
    if (this.isOpen && this.app !== 'simpan') this.render();
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    parent.append(e);
    return e;
  }

  private button2(parent: HTMLElement, label: string, onClick: () => void, primary = false, disabled = false): HTMLButtonElement {
    const b = this.el('button', primary ? 'btn-primary' : 'btn-secondary', parent, label);
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  }

  private render(): void {
    const s = this.session;
    this.root.replaceChildren();
    const frame = this.el('div', 'phone-frame', this.root);
    const status = this.el('div', 'phone-status', frame);
    const p = toParts(s.clock.minutes);
    this.el('span', '', status, clockTime(p));
    this.el('span', '', status, rupiah(s.wallet.balance));
    const header = this.el('div', 'phone-header', frame);
    if (this.app !== 'home') this.button2(header, '‹', () => {
      this.app = 'home';
      this.render();
    });
    this.el('span', 'phone-title', header, this.app === 'home' ? longDate(p) : t(`app.${this.app}`));
    this.button2(header, '✕', () => this.toggle());
    const body = this.el('div', 'phone-body', frame);

    switch (this.app) {
      case 'home': {
        const grid = this.el('div', 'phone-grid', body);
        const shop = this.el('button', 'phone-app', grid);
        this.el('span', 'phone-icon', shop, '🛋️');
        this.el('span', '', shop, t('app.toko'));
        shop.addEventListener('click', () => {
          this.toggle();
          this.hooks.openShop();
        });
        for (const a of APPS) {
          const b = this.el('button', 'phone-app', grid);
          this.el('span', 'phone-icon', b, a.icon);
          this.el('span', '', b, t(`app.${a.id}`));
          if (a.id === 'chat' && this.unreadChat > 0) this.el('span', 'phone-badge', b, String(this.unreadChat));
          b.addEventListener('click', () => {
            this.app = a.id;
            if (a.id === 'chat') {
              this.unreadChat = 0;
              this.button.classList.remove('badge');
            }
            this.render();
          });
        }
        break;
      }
      case 'loker':
        this.renderLoker(body);
        break;
      case 'bank':
        this.renderBank(body);
        break;
      case 'chat': {
        const msgs = [...s.career.inbox].reverse();
        if (msgs.length === 0) this.el('div', 'phone-empty', body, t('phone.noChat'));
        for (const m of msgs) {
          const card = this.el('div', 'phone-card', body);
          const mp = toParts(m.time);
          this.el('div', 'phone-card-title', card, `${m.from} · ${mp.day}/${mp.month} ${clockTime(mp)}`);
          this.el('div', '', card, messageText(m));
        }
        break;
      }
      case 'kalender':
        this.renderCalendar(body);
        break;
      case 'notif':
        if (this.notifications.length === 0) this.el('div', 'phone-empty', body, t('phone.noNotif'));
        for (const n of this.notifications) {
          const card = this.el('div', 'phone-card', body);
          const np = toParts(n.time);
          this.el('div', 'phone-card-title', card, `${np.day}/${np.month} ${clockTime(np)}`);
          this.el('div', '', card, n.text);
        }
        break;
      case 'profil':
        this.renderProfile(body);
        break;
      case 'simpan':
        this.renderSave(body);
        break;
      case 'properti':
        this.renderProperty(body);
        break;
    }
  }

  private renderLoker(body: HTMLElement): void {
    const s = this.session;
    const c = s.career;
    const tabs = this.el('div', 'phone-tabs', body);
    for (const tab of ['lowongan', 'lamaran', 'kerja'] as const) {
      const b = this.el('button', `phone-tab${tab === this.lokerTab ? ' on' : ''}`, tabs, t(`loker.${tab}`));
      b.addEventListener('click', () => {
        this.lokerTab = tab;
        this.render();
      });
    }
    if (this.lokerTab === 'lowongan') {
      this.el('div', 'phone-note', body, t('loker.weekly'));
      for (const l of c.listings) {
        const job = c.jobData(l.jobId);
        const card = this.el('div', 'phone-card', body);
        this.el('div', 'phone-card-title', card, `${job.title} · ${l.company}`);
        const skills = Object.entries(job.requiredSkills).map(([k, v]) => `${tDynamic(`skill.${k}`)} ${v}`).join(', ');
        const days = job.workDays.map((d) => tDynamic(`day.${d}`).slice(0, 3)).join(' ');
        this.el('div', 'phone-small', card, fmt(t('loker.detail'), { salary: rupiah(l.salary), edu: job.minEducation, hours: `${job.shiftStart}.00–${job.shiftEnd}.00`, days }) + (skills ? ` · ${t('loker.skills')}: ${skills}` : ''));
        const applied = c.hasApplied(l.id);
        this.button2(card, applied ? t('loker.applied') : t('loker.apply'), () => {
          c.apply(l.id);
          this.toast(t('loker.sent'));
          this.render();
        }, !applied, applied || c.job !== null);
      }
    }
    if (this.lokerTab === 'lamaran') {
      if (c.applications.length === 0) this.el('div', 'phone-empty', body, t('loker.noApps'));
      for (const a of [...c.applications].reverse()) {
        const job = c.jobData(a.jobId);
        const card = this.el('div', 'phone-card', body);
        this.el('div', 'phone-card-title', card, `${job.title} · ${a.company}`);
        let status = tDynamic(`app.status.${a.status}`);
        if (a.status === 'interview' && a.interviewAt !== undefined) {
          const ip = toParts(a.interviewAt);
          status += ` · ${tDynamic(`day.${ip.weekday}`)} ${ip.day}/${ip.month} ${clockTime(ip)} · ${t('loker.goHint')}`;
        }
        this.el('div', 'phone-small', card, status);
        if (a.status === 'offer') {
          const row = this.el('div', 'phone-row', card);
          this.button2(row, t('loker.accept'), () => {
            c.acceptOffer(a.id);
            this.toast(t('loker.accepted'));
            this.render();
          }, true);
          this.button2(row, t('loker.decline'), () => {
            c.declineOffer(a.id);
            this.render();
          });
        }
      }
    }
    if (this.lokerTab === 'kerja') {
      const job = c.job;
      if (!job) {
        this.el('div', 'phone-empty', body, c.pendingStart ? fmt(t('loker.startsOn'), { date: longDate(toParts(c.pendingStart.startAt)) }) : t('loker.noJob'));
        return;
      }
      const data = c.jobData(job.jobId);
      const card = this.el('div', 'phone-card', body);
      this.el('div', 'phone-card-title', card, `${tDynamic(`level.${job.level}`)} ${data.title} · ${job.company}`);
      this.el('div', 'phone-small', card, fmt(t('loker.jobInfo'), { salary: rupiah(job.monthlyGross), hours: `${data.shiftStart}.00–${data.shiftEnd}.00`, days: data.workDays.map((d) => tDynamic(`day.${d}`).slice(0, 3)).join(' ') }));
      this.el('div', 'phone-small', card, fmt(t('loker.jobStatus'), { perf: Math.round(job.performance), sp: job.warnings, leave: job.leaveDaysLeft, absent: job.absentDaysThisMonth }));
      const today = s.clock.minutes;
      this.el('div', 'phone-note', body, c.isWorkDay(today) ? t('loker.workToday') : t('loker.offToday'));
      const row = this.el('div', 'phone-row', body);
      this.button2(row, t('loker.sick'), () => {
        const ok = c.requestSickLeave(today, s.character.vitals.sick);
        this.toast(ok ? t('loker.sickOk') : t('loker.notSick'));
        this.render();
      });
      this.button2(row, t('loker.leave'), () => {
        const ok = c.requestLeave(today);
        this.toast(ok ? t('loker.leaveOk') : t('loker.noLeave'));
        this.render();
      }, false, job.leaveDaysLeft <= 0);
    }
  }

  private renderBank(body: HTMLElement): void {
    const s = this.session;
    const card = this.el('div', 'phone-card big', body);
    this.el('div', 'phone-small', card, t('bank.balance'));
    this.el('div', 'phone-balance', card, rupiah(s.wallet.balance));
    const ps = s.lastPayslip;
    if (ps) {
      const slip = this.el('div', 'phone-card', body);
      this.el('div', 'phone-card-title', slip, t('bank.payslip'));
      for (const [k, v] of [['bank.gross', ps.gross], ['bank.bpjs', -ps.bpjs], ['bank.tax', -ps.tax], ['bank.absence', -ps.absenceDeduction], ['bank.net', ps.net]] as const) {
        const row = this.el('div', 'phone-line', slip);
        this.el('span', '', row, t(k));
        this.el('span', '', row, rupiah(v));
      }
    }
    this.el('div', 'phone-note', body, t('bank.history'));
    for (const tx of [...s.wallet.history].reverse().slice(0, 40)) {
      const row = this.el('div', 'phone-line', body);
      const tp = toParts(tx.time);
      this.el('span', '', row, `${tp.day}/${tp.month} ${tDynamic(tx.labelKey)}`);
      this.el('span', tx.amount < 0 ? 'neg' : 'pos', row, rupiah(tx.amount));
    }
  }

  private renderCalendar(body: HTMLElement): void {
    const s = this.session;
    const now = toParts(s.clock.minutes);
    this.el('div', 'phone-card-title', body, `${tDynamic(`month.${now.month}`)} ${now.year}`);
    const grid = this.el('div', 'cal-grid', body);
    for (let d = 0; d < 7; d++) this.el('div', 'cal-head', grid, tDynamic(`day.${d}`).slice(0, 2));
    const first = fromDate(now.year, now.month, 1);
    const offset = toParts(first).weekday;
    for (let i = 0; i < offset; i++) this.el('div', 'cal-cell empty', grid);
    const interviews = new Set(s.career.applications.filter((a) => a.status === 'interview' && a.interviewAt !== undefined).map((a) => dayIndex(a.interviewAt!)));
    for (let d = 1; d <= 31; d++) {
      const t0 = fromDate(now.year, now.month, d);
      if (toParts(t0).month !== now.month) break;
      const cls = ['cal-cell'];
      if (d === now.day) cls.push('today');
      if (s.calendar.isPublicHoliday(t0)) cls.push('holiday');
      if (s.career.isWorkDay(t0)) cls.push('work');
      if (s.calendar.isRamadan(t0)) cls.push('ramadan');
      const cell = this.el('div', cls.join(' '), grid, String(d));
      const marks: string[] = [];
      if (d === 1) marks.push('🏠');
      if (d === 25) marks.push('💰');
      if (interviews.has(dayIndex(t0))) marks.push('🤝');
      if (marks.length) this.el('span', 'cal-mark', cell, marks.join(''));
    }
    this.el('div', 'phone-note', body, t('cal.legend'));
    for (const h of [...new Array(31).keys()].flatMap((i) => s.calendar.holidaysOn(fromDate(now.year, now.month, i + 1)).map((x) => `${i + 1}: ${x.name}`))) this.el('div', 'phone-small', body, h);
  }

  private renderProfile(body: HTMLElement): void {
    const c = this.session.character;
    const card = this.el('div', 'phone-card', body);
    this.el('div', 'phone-card-title', card, `${c.name}, ${c.age} th`);
    this.el('div', 'phone-small', card, `${c.education} · ${tDynamic(`cr.${c.perantau ? 'perantau' : 'local'}`)}`);
    this.el('div', 'phone-note', body, t('profil.skills'));
    for (const k of SKILLS) {
      const row = this.el('div', 'phone-bar', body);
      this.el('span', '', row, tDynamic(`skill.${k}`));
      const track = this.el('div', 'phone-track', row);
      const fill = this.el('div', 'phone-fill', track);
      fill.style.width = `${(c.skills[k] / 10) * 100}%`;
      this.el('span', '', row, c.skills[k].toFixed(1));
    }
    this.el('div', 'phone-note', body, t('profil.body'));
    for (const [k, v] of [['style.muscle', c.body.muscle], ['style.fat', c.body.fat]] as const) {
      const row = this.el('div', 'phone-bar', body);
      this.el('span', '', row, t(k));
      const track = this.el('div', 'phone-track', row);
      const fill = this.el('div', 'phone-fill', track);
      fill.style.width = `${v * 100}%`;
      this.el('span', '', row, `${Math.round(v * 100)}`);
    }
  }

  private renderProperty(body: HTMLElement): void {
    const s = this.session;
    for (const id of ['kos', 'kontrakan', 'rumah']) {
      const card = this.el('div', 'phone-card', body);
      this.el('div', 'phone-card-title', card, tDynamic(`home.${id}`));
      if (id === 'rumah') {
        const price = s.housePrice();
        const dp = Math.round(price * s.cfgFinance.mortgageDownPayment);
        const monthly = s.home.debts.find((d) => d.id === 'mortgage')?.monthly;
        this.el('div', 'phone-small', card, fmt(t('prop.mortgage'), { price: rupiah(price), dp: rupiah(dp), monthly: rupiah(monthly ?? Math.round(((price - dp) * (0.08 / 12)) / (1 - (1 + 0.08 / 12) ** -180))) }));
      } else {
        this.el('div', 'phone-small', card, fmt(t('prop.rent'), { rent: rupiah(s.rentOf(id)) }));
      }
      if (id === s.home.layoutId) {
        this.el('div', 'phone-note', card, t('prop.here'));
        continue;
      }
      const block = s.houseMoveBlock(id);
      if (block && block !== 'same') this.el('div', 'phone-small', card, t(`prop.block.${block}`));
      this.button2(card, t('prop.move'), () => {
        if (s.moveHouse(id)) return;
        this.toggle();
        this.toast(t('prop.moved'));
        this.hooks.onMoved();
      }, true, block !== null);
    }
    if (s.home.debts.length) {
      this.el('div', 'phone-note', body, t('prop.debts'));
      for (const d of s.home.debts) this.el('div', 'phone-small', body, fmt(t('prop.debt'), { label: tDynamic(d.labelKey), amount: rupiah(d.monthly), months: d.monthsLeft }));
    }
  }

  private renderSave(body: HTMLElement): void {
    const s = this.session;
    this.el('div', 'phone-note', body, t('save.hint'));
    void this.storage.list().then((infos) => {
      for (const slot of SLOTS) {
        const info = infos.find((i) => i.slot === slot);
        const card = this.el('div', 'phone-card', body);
        this.el('div', 'phone-card-title', card, t(`save.${slot}`));
        this.el('div', 'phone-small', card, info ? `${info.name} · ${longDate(toParts(info.gameMinutes))}` : t('save.empty'));
        if (slot !== 'auto') {
          this.button2(card, t('save.saveHere'), () => {
            void this.storage.save(slot, s.toSave()).then(() => {
              this.onSaved(slot);
              this.render();
            });
          }, true);
        }
      }
      this.el('div', 'phone-note', body, t('save.export'));
      const area = this.el('textarea', 'phone-code', body);
      area.readOnly = true;
      area.value = encodeSave(s.toSave());
      this.button2(body, t('save.copy'), () => {
        area.select();
        void navigator.clipboard?.writeText(area.value).then(() => this.toast(t('save.copied')), () => this.toast(t('save.copyManual')));
      });
      this.el('div', 'phone-note', body, t('save.import'));
      const input = this.el('textarea', 'phone-code', body);
      input.placeholder = 'TH1:...';
      this.button2(body, t('save.load'), () => {
        try {
          const data = decodeSave(input.value);
          void this.storage.save('auto', data).then(() => location.reload());
        } catch {
          this.toast(t('save.bad'));
        }
      });
    });
  }
}
