import { fmt, t, tDynamic } from '../data/strings';
import { SKILLS } from '../sim/career';
import type { GameSession, SimEvent } from '../sim/session';
import type { ActionDef } from '../sim/actions';
import { relLevel, type SocialAction } from '../sim/social';
import { lifeStage } from '../sim/aging';
import { childStage } from '../sim/children';
import { simData } from '../sim/gameData';
import { dayIndex, fromDate, toParts } from '../sim/time';
import { SLOTS, type SaveStorage, type SlotId } from '../save/saveStorage';
import { decodeSave, encodeSave } from '../save/saveCodec';
import { clockTime, longDate, rupiah } from './format';
import { messageText } from './messages';
import { getQuality, setQuality } from '../engine/graphics';
import { canInstall, install } from '../engine/pwa';
import { getAudio } from '../engine/audio';

// The in-game smartphone: a home screen of apps drawn in HTML over the game.

type App = 'home' | 'loker' | 'bank' | 'chat' | 'kontak' | 'kalender' | 'notif' | 'profil' | 'simpan' | 'properti' | 'peta' | 'tiket' | 'setelan' | 'antar' | 'usaha' | 'keluarga';

const APPS: { id: Exclude<App, 'home'>; icon: string }[] = [
  { id: 'loker', icon: '💼' },
  { id: 'bank', icon: '🏦' },
  { id: 'chat', icon: '💬' },
  { id: 'kontak', icon: '👥' },
  { id: 'kalender', icon: '📅' },
  { id: 'notif', icon: '🔔' },
  { id: 'profil', icon: '🧍' },
  { id: 'peta', icon: '🗺️' },
  { id: 'antar', icon: '🛵' },
  { id: 'usaha', icon: '🏪' },
  { id: 'keluarga', icon: '👨‍👩‍👧' },
  { id: 'properti', icon: '🏠' },
  { id: 'tiket', icon: '🎫' },
  { id: 'simpan', icon: '💾' },
  { id: 'setelan', icon: '⚙️' },
];

export interface PhoneHooks {
  /** Opens build mode on the shop tab (the Toko app). */
  openShop: () => void;
  /** Called after moving house (the scene must be rebuilt). */
  onMoved: () => void;
  /** Places on the map with their distance from the character (metres). */
  mapPlaces: () => { id: string; nameKey: string; distance: number }[];
  /** Fast travel by ojol to a place. */
  travelTo: (placeId: string) => void;
  /** Shows sim events as toasts (social results). */
  showEvents: (events: SimEvent[]) => void;
  /** Leaves through the front door on a trip (mudik or holiday). */
  startTrip: (action: ActionDef) => void;
  /** Saves and reloads the game (after a graphics change). */
  reload: () => void;
}

export class Phone {
  private readonly root: HTMLElement;
  private app: App = 'home';
  private lokerTab: 'lowongan' | 'lamaran' | 'kerja' = 'lowongan';
  private readonly notifications: { time: number; text: string }[] = [];
  private unreadChat = 0;
  private readonly button: HTMLButtonElement;

  private clockEl: HTMLElement | null = null;

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
    // Keep the phone's status-bar clock in step with the game clock while it is open.
    window.setInterval(() => {
      if (this.isOpen && this.clockEl) this.clockEl.textContent = clockTime(toParts(this.session.clock.minutes));
    }, 500);
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

  /** Opens the phone straight into an app. */
  openApp(app: App): void {
    this.root.hidden = false;
    this.app = app;
    this.render();
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
    this.clockEl = this.el('span', '', status, clockTime(p));
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
      case 'peta':
        this.renderMap(body);
        break;
      case 'kontak':
        this.renderContacts(body);
        break;
      case 'tiket':
        this.renderTickets(body);
        break;
      case 'setelan':
        this.renderSettings(body);
        break;
      case 'antar':
        this.renderDelivery(body);
        break;
      case 'usaha':
        this.renderBusiness(body);
        break;
      case 'keluarga':
        this.renderFamily(body);
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
        this.el('div', 'phone-small', card, fmt(t('loker.detail'), { salary: rupiah(l.salary), edu: job.minEducation, hours: `${job.shiftStart}.00–${job.shiftEnd}.00`, days }) + (skills ? ` · ${t('loker.skills')}: ${skills}` : '') + (job.needsSkck ? t('job.reqSkck') : ''));
        const block = c.requirementBlock(job);
        if (block) this.el('div', 'phone-small', card, `⚠️ ${fmt(tDynamic(`job.block.${block}`), { edu: job.minEducation })}`);
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
    this.el('div', 'phone-small', card, fmt(t('profil.birthday'), { n: Math.max(0, this.session.birthdayIn()), stage: tDynamic(`age.${lifeStage(c.age)}`) }));
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

  private renderMap(body: HTMLElement): void {
    const s = this.session;
    const motor = this.el('div', 'phone-card', body);
    this.el('div', 'phone-card-title', motor, `🛵 ${t('map.motor')}`);
    if (s.character.ownsMotorbike) this.el('div', 'phone-small', motor, t('map.haveMotor'));
    else
      this.button2(motor, fmt(t('map.buyMotor'), { price: rupiah(s.cfgTravel.motorbikePrice) }), () => {
        if (s.buyMotorbike()) this.render();
      }, true, s.wallet.balance < s.cfgTravel.motorbikePrice);
    const car = this.el('div', 'phone-card', body);
    this.el('div', 'phone-card-title', car, `🚗 ${t('map.car')}`);
    if (s.character.ownsCar) this.el('div', 'phone-small', car, t('map.haveCar'));
    else {
      const tr = s.cfgTravel;
      this.button2(car, fmt(t('map.buyCarUsed'), { price: rupiah(tr.carPriceUsed) }), () => {
        if (s.buyCar('bekas')) this.render();
      }, false, s.wallet.balance < tr.carPriceUsed);
      this.button2(car, fmt(t('map.buyCarNew'), { price: rupiah(tr.carPriceNew) }), () => {
        if (s.buyCar('baru')) this.render();
      }, false, s.wallet.balance < tr.carPriceNew);
    }
    for (const p of this.hooks.mapPlaces().sort((a, b) => a.distance - b.distance)) {
      const card = this.el('div', 'phone-card', body);
      this.el('div', 'phone-card-title', card, tDynamic(p.nameKey));
      if (p.distance < 4) {
        this.el('div', 'phone-small', card, t('map.here'));
        continue;
      }
      const q = s.travelQuote(p.distance);
      this.el('div', 'phone-small', card, fmt(t('map.info'), { min: q.minutes, cost: rupiah(q.cost) }));
      this.button2(card, `🛵 ${t('map.travel')}`, () => {
        this.toggle();
        this.hooks.travelTo(p.id);
      }, false, s.wallet.balance < q.cost);
    }
  }

  private renderContacts(body: HTMLElement): void {
    const s = this.session;
    const order = { keluarga: 0, rekan: 2, tetangga: 3, kenalan: 4 } as const;
    const list = [...s.npcs].sort((a, b) => (a.spouse || a.datingSince !== null ? -1 : order[a.role]) - (b.spouse || b.datingSince !== null ? -1 : order[b.role]) || b.relationship - a.relationship);
    for (const n of list) {
      const card = this.el('div', 'phone-card', body);
      const status = n.spouse ? t('soc.spouse') : n.engaged ? t('soc.engaged') : n.datingSince !== null ? t('soc.dating') : tDynamic(`role.${n.role}`);
      this.el('div', 'phone-card-title', card, `${n.gender === 'male' ? '👨' : '👩'} ${n.name} · ${status} · ${tDynamic(`rel.lv${relLevel(n.relationship)}`)}`);
      // Topics learned while talking face to face.
      const known = Object.entries(n.known ?? {});
      const icon = (id: string): string => `${simData.config.social.topics.find((x) => x.id === id)?.icon ?? ''} ${tDynamic(`topic.${id}`)}`;
      const likes = known.filter(([, r]) => r === 'like').map(([id]) => icon(id));
      const dislikes = known.filter(([, r]) => r === 'dislike').map(([id]) => icon(id));
      if (likes.length) this.el('div', 'phone-small', card, fmt(t('soc.likes'), { list: likes.join(', ') }));
      if (dislikes.length) this.el('div', 'phone-small', card, fmt(t('soc.dislikes'), { list: dislikes.join(', ') }));
      const row = this.el('div', 'phone-bar', card);
      this.el('span', '', row, fmt(t('soc.rel'), { n: Math.round(n.relationship) }));
      const track = this.el('div', 'phone-track', row);
      this.el('div', 'phone-fill', track).style.width = `${n.relationship}%`;
      const btns = this.el('div', 'phone-row', card);
      const acts: SocialAction[] = ['chat', 'call', 'hangout'];
      if (n.role !== 'keluarga' && !n.spouse && n.datingSince === null) acts.push('confess');
      if (n.datingSince !== null && !n.engaged && !n.spouse) acts.push('propose');
      for (const a of acts) {
        this.button2(btns, t(`soc.${a}`), () => {
          const block = s.socialBlock(n.id, a);
          if (block) {
            this.toast(tDynamic(`soc.block.${block}`));
            return;
          }
          this.hooks.showEvents(s.social(n.id, a));
          this.render();
        }, a === 'confess' || a === 'propose');
      }
      if (n.engaged) {
        const cfg = s.cfgSocial;
        for (const kind of ['kua', 'adat'] as const) {
          const cost = kind === 'kua' ? cfg.weddingKuaCost : cfg.weddingAdatCost;
          const label = kind === 'kua' ? fmt(t('soc.weddingKua'), { cost: rupiah(cost) }) : fmt(t('soc.weddingAdat'), { ceremony: s.adatCeremony(), cost: rupiah(cost) });
          this.button2(card, label, () => {
            if (s.wedding(n.id, kind)) {
              this.toast(t('soc.married'));
              this.render();
            }
          }, true, s.wallet.balance < cost);
        }
      }
    }
  }

  private renderSettings(body: HTMLElement): void {
    const card = this.el('div', 'phone-card', body);
    this.el('div', 'phone-card-title', card, t('set.graphics'));
    const row = this.el('div', 'phone-row', card);
    const now = getQuality();
    for (const q of ['low', 'medium', 'high'] as const) {
      this.button2(row, tDynamic(`set.graphics.${q}`), () => {
        if (q === now) return;
        setQuality(q);
        this.hooks.reload();
      }, q === now);
    }
    this.el('div', 'phone-small', card, t('set.graphicsHint'));
    const remind = this.el('div', 'phone-card', body);
    this.el('div', 'phone-card-title', remind, t('set.remind'));
    const rrow = this.el('div', 'phone-row', remind);
    const remindOn = this.session.character.worshipReminders !== false;
    for (const on of [true, false]) {
      this.button2(rrow, t(on ? 'set.on' : 'set.off'), () => {
        this.session.character.worshipReminders = on;
        this.render();
      }, on === remindOn);
    }
    this.el('div', 'phone-small', remind, t('set.remindHint'));
    const credits = this.el('div', 'phone-card', body);
    this.el('div', 'phone-card-title', credits, t('set.credits'));
    this.el('div', 'phone-small', credits, t('set.creditsText'));
    const ageCard = this.el('div', 'phone-card', body);
    this.el('div', 'phone-card-title', ageCard, t('set.age'));
    const arow = this.el('div', 'phone-row', ageCard);
    const speed = this.session.character.ageSpeed ?? 'normal';
    for (const a of ['cepat', 'normal', 'realistis'] as const) {
      this.button2(arow, tDynamic(`set.age.${a}`), () => {
        this.session.character.ageSpeed = a;
        this.render();
      }, a === speed);
    }
    this.el('div', 'phone-small', ageCard, t('set.ageHint'));
    const music = this.el('div', 'phone-card', body);
    this.el('div', 'phone-card-title', music, `🎵 ${t('set.music')}`);
    const mrow = this.el('div', 'phone-row', music);
    const audio = getAudio();
    for (const on of [true, false]) {
      this.button2(mrow, t(on ? 'set.on' : 'set.off'), () => {
        audio.setMusicOn(on);
        if (on) audio.playMusic('welcome');
        this.render();
      }, audio.musicOn === on);
    }
    const inst = this.el('div', 'phone-card', body);
    this.el('div', 'phone-card-title', inst, t('set.install'));
    if (canInstall()) this.button2(inst, t('set.installBtn'), () => void install(), true);
    else this.el('div', 'phone-small', inst, t('set.installHint'));
    this.el('div', 'phone-small', body, fmt(t('set.version'), { v: __APP_VERSION__ }));
  }

  /** Keluarga: children (play, homework), trying for a baby or adopting. */
  private renderFamily(body: HTMLElement): void {
    const s = this.session;
    const day = dayIndex(s.clock.minutes);
    if (s.expecting) this.el('div', 'phone-card phone-highlight', body, fmt(t('kid.expecting'), { days: Math.max(0, s.expecting.dueDay - day) }));
    if (s.children.length === 0) this.el('div', 'phone-empty', body, t('kid.none'));
    for (const k of s.children) {
      const card = this.el('div', 'phone-card', body);
      const stage = childStage(k.age);
      this.el('div', 'phone-card-title', card, `${k.gender === 'male' ? '👦' : '👧'} ${k.name}`);
      this.el('div', 'phone-small', card, fmt(t('kid.age'), { age: k.age, stage: tDynamic(`kid.stage.${stage}`) }));
      const row = this.el('div', 'phone-bar', card);
      this.el('span', '', row, fmt(t('kid.happy'), { n: Math.round(k.happiness) }));
      this.el('div', 'phone-fill', this.el('div', 'phone-track', row)).style.width = `${k.happiness}%`;
      if (stage === 'dewasa') continue;
      const btns = this.el('div', 'phone-row', card);
      this.button2(btns, t('kid.play'), () => {
        this.hooks.showEvents(s.childTime(k.id, 'play'));
        this.toast(fmt(t('kid.played'), { name: k.name }));
        this.render();
      });
      if (stage === 'anak' || stage === 'remaja') this.button2(btns, t('kid.study'), () => {
        this.hooks.showEvents(s.childTime(k.id, 'study'));
        this.toast(fmt(t('kid.studied'), { name: k.name }));
        this.render();
      });
    }
    const plan = this.el('div', 'phone-card', body);
    if (!s.character.married) {
      this.el('div', 'phone-small', plan, t('kid.needMarried'));
      return;
    }
    this.button2(plan, t('kid.try'), () => {
      if (s.tryForBaby()) this.toast(fmt(t('kid.tryYes'), { days: Math.max(0, (s.expecting?.dueDay ?? day) - day) }));
      else this.toast(s.familyBlock('try') === 'today' ? t('kid.tryNo') : t('kid.today'));
      this.render();
    }, true, s.familyBlock('try') !== null);
    const cost = s.adoptionCost;
    this.button2(plan, fmt(t('kid.adopt'), { cost: rupiah(cost) }), () => {
      if (!s.adopt()) return this.toast(t('block.money'));
      this.toast(fmt(t('kid.adoptStarted'), { days: Math.max(0, (s.expecting?.dueDay ?? day) - day) }));
      this.render();
    }, false, s.familyBlock('adopt') !== null);
  }

  /** Usaha: start one side business, see how it is doing, close it. */
  private renderBusiness(body: HTMLElement): void {
    const s = this.session;
    const b = s.business;
    if (b) {
      const type = s.businessType(b.typeId);
      const card = this.el('div', 'phone-card phone-highlight', body);
      this.el('div', 'phone-card-title', card, `${type?.icon ?? '🏪'} ${fmt(t('biz.running'), { name: tDynamic(type?.nameKey ?? '') })}`);
      const row = this.el('div', 'phone-bar', card);
      this.el('span', '', row, fmt(t('biz.reputation'), { n: Math.round(b.reputation) }));
      this.el('div', 'phone-fill', this.el('div', 'phone-track', row)).style.width = `${b.reputation}%`;
      const worked = b.workedDay === dayIndex(s.clock.minutes);
      this.el('div', 'phone-small', card, fmt(t('biz.today'), { status: worked ? t('biz.worked') : t('biz.notWorked') }));
      this.el('div', 'phone-small', card, fmt(t('biz.last'), { amount: rupiah(b.lastProfit) }));
      this.el('div', 'phone-small', card, fmt(t('biz.total'), { amount: rupiah(b.totalProfit) }));
      this.button2(card, t('biz.close'), () => {
        s.closeBusiness();
        this.toast(t('biz.closed'));
        this.render();
      });
      return;
    }
    for (const type of simData.config.business.types) {
      const card = this.el('div', 'phone-card', body);
      this.el('div', 'phone-card-title', card, `${type.icon} ${tDynamic(type.nameKey)}`);
      this.el('div', 'phone-small', card, tDynamic(type.descKey));
      const label = type.capital > 0 ? fmt(t('biz.start'), { capital: rupiah(type.capital) }) : t('biz.startFree');
      this.button2(card, label, () => {
        if (!s.startBusiness(type.id)) return this.toast(t('block.money'));
        this.toast(t('biz.started'));
        this.render();
      }, true, s.wallet.balance < type.capital);
    }
  }

  /** AntarMakan: order dishes from local food stalls, delivered to the door. */
  private deliveryCart: Record<string, number> = {};

  private renderDelivery(body: HTMLElement): void {
    const s = this.session;
    this.el('div', 'phone-note', body, t('dlv.title'));
    for (const d of s.deliveries) {
      const min = Math.max(1, Math.round(d.arriveAt - s.clock.minutes));
      this.el('div', 'phone-card phone-highlight', body, fmt(t('dlv.onTheWay'), { min }));
    }
    for (const r of simData.config.delivery.restaurants) {
      const card = this.el('div', 'phone-card', body);
      this.el('div', 'phone-card-title', card, `🍽️ ${tDynamic(r.nameKey)}`);
      for (const id of r.dishes) {
        const item = simData.items.find((i) => i.id === id);
        if (!item) continue;
        const row = this.el('div', 'phone-row dlv-row', card);
        this.el('span', 'dlv-name', row, `${tDynamic(item.nameKey)} · ${rupiah(item.price)}`);
        const n = this.deliveryCart[id] ?? 0;
        this.button2(row, '−', () => {
          this.deliveryCart[id] = Math.max(0, n - 1);
          this.render();
        }, false, n === 0);
        this.el('span', 'dlv-qty', row, String(n));
        this.button2(row, '+', () => {
          this.deliveryCart[id] = Math.min(5, n + 1);
          this.render();
        });
      }
    }
    const q = s.deliveryQuote(this.deliveryCart);
    const sum = this.el('div', 'phone-card', body);
    this.el('div', 'phone-small', sum, fmt(t('dlv.fee'), { fee: rupiah(q.fee) }));
    if (q.rainFee > 0) this.el('div', 'phone-small', sum, `🌧️ ${fmt(t('dlv.rainFee'), { fee: rupiah(q.rainFee) })}`);
    this.el('div', 'phone-small', sum, fmt(t('dlv.eta'), { min: q.minutes }));
    this.button2(sum, fmt(t('dlv.order'), { total: rupiah(q.food > 0 ? q.total : 0) }), () => {
      const min = s.orderDelivery(this.deliveryCart);
      if (min === null) return this.toast(q.food > 0 ? t('block.money') : t('dlv.empty'));
      this.deliveryCart = {};
      this.toast(fmt(t('dlv.ordered'), { min }));
      this.render();
    }, true, q.food <= 0 || s.wallet.balance < q.total);
  }

  private renderTickets(body: HTMLElement): void {
    const s = this.session;
    this.el('div', 'phone-note', body, t('tiket.leave'));
    const go = (kind: 'mudik' | number): void => {
      if (s.isNyepi()) {
        this.toast(t('toast.nyepi'));
        return;
      }
      this.toggle();
      this.hooks.startTrip(s.tripAction(kind));
    };
    const m = s.mudikInfo();
    const card = this.el('div', 'phone-card', body);
    this.el('div', 'phone-card-title', card, `🚌 ${fmt(t('tiket.mudik'), { region: m.region })}`);
    this.el('div', 'phone-small', card, fmt(t('tiket.mudikInfo'), { days: m.days, cost: rupiah(m.cost) }));
    this.button2(card, t('tiket.buy'), () => go('mudik'), true, s.wallet.balance < m.cost);
    s.trips.forEach((trip, i) => {
      const c = this.el('div', 'phone-card', body);
      this.el('div', 'phone-card-title', c, `✈️ ${fmt(t('tiket.trip'), { dest: trip.destination })}`);
      this.el('div', 'phone-small', c, fmt(t('tiket.tripInfo'), { days: trip.days, cost: rupiah(trip.cost) }));
      this.button2(c, t('tiket.buy'), () => go(i), false, s.wallet.balance < trip.cost);
    });
  }

  private renderProperty(body: HTMLElement): void {
    const s = this.session;
    // Building a house on the family land.
    if (s.home.layoutId === 'tanah') {
      const card = this.el('div', 'phone-card', body);
      this.el('div', 'phone-card-title', card, `🏗️ ${t('build.title')}`);
      const c = s.home.construction;
      if (c) this.el('div', 'phone-small', card, fmt(t('build.progress'), { date: longDate(toParts(c.doneAt)) }));
      else {
        this.el('div', 'phone-small', card, fmt(t('build.info'), { cost: rupiah(s.buildCost()), days: s.cfgFinance.buildDays }));
        const block = s.buildBlock();
        if (block === 'money') this.el('div', 'phone-small', card, t('build.block.money'));
        this.button2(card, t('build.start'), () => {
          if (s.startBuilding()) this.render();
        }, true, block !== null);
      }
    }
    for (const id of ['kos', 'kontrakan', 'apartemen', 'rumah_sewa', 'rumah']) {
      const card = this.el('div', 'phone-card', body);
      this.el('div', 'phone-card-title', card, tDynamic(`home.${id === 'rumah_sewa' ? 'rumahSewa' : id}`));
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
