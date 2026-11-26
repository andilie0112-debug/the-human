import { fmt, t, tDynamic } from '../data/strings';
import type { GameSession, SimEvent } from '../sim/session';
import type { Speed } from '../sim/clock';
import { NEED_KEYS } from '../sim/needs';
import { toParts } from '../sim/time';
import { clockTime, longDate, rupiah } from './format';
import { messageText } from './messages';
import { actionIcon } from './actionIcons';
import { NEED_ICONS } from './thoughtBubble';

// HTML overlay: clock, date, money, speed buttons, need bars and notifications.
// It reads the session a few times per second and only touches the DOM when a value changes.

interface Bar {
  fill: HTMLElement;
  value: HTMLElement;
  last: number;
  /** Stress: high is bad, so colours are inverted. */
  inverted: boolean;
}

const SPEEDS: { speed: Speed; label: string }[] = [
  { speed: 0, label: '⏸' },
  { speed: 1, label: '▶' },
  { speed: 2, label: '▶▶' },
  { speed: 3, label: '▶▶▶' },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  parent?.append(e);
  return e;
}

function barColor(v: number, inverted: boolean): string {
  const good = inverted ? 100 - v : v;
  if (good >= 60) return 'var(--good)';
  if (good >= 30) return 'var(--warn)';
  return 'var(--bad)';
}

export class Hud {
  private readonly time: HTMLElement;
  private readonly date: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly money: HTMLElement;
  private readonly speedButtons: HTMLButtonElement[] = [];
  private readonly bars = new Map<string, Bar>();
  private readonly kangenRow: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly progressBox: HTMLElement;
  private readonly progressLabel: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly progressTime: HTMLElement;
  private lastText = { time: '', date: '', money: '', badge: '' };
  private lastSpeed: Speed | -1 = -1;
  private sinceRefresh = 1;
  private readonly tasksPanel: HTMLElement;
  private readonly tasksList: HTMLElement;
  private tasksKey = '';
  private readonly wantedEl: HTMLElement;
  private readonly card: HTMLElement;
  private readonly cardRing: HTMLElement;
  private readonly cardFace: HTMLElement;
  private readonly cardMood: HTMLElement;
  private readonly cardBuffs: HTMLElement;
  private readonly progressIcon: HTMLElement;
  private cardKey = '';
  /** The character card was tapped at least once (for the tutorial). */
  cardTapped = false;

  /** Opens the task panel (e.g. when arriving home). */
  showTasks(): void {
    // On narrow phone screens the panel stays a button (it would cover the room).
    if (!window.matchMedia('(max-width: 640px)').matches) this.tasksPanel.classList.remove('collapsed');
    this.renderTasks(true);
  }

  private renderTasks(force = false): void {
    const tasks = this.session.todayTasks();
    const key = tasks.map((x) => `${x.id}${x.done ? 1 : 0}`).join();
    if (!force && key === this.tasksKey) return;
    this.tasksKey = key;
    this.tasksList.replaceChildren();
    for (const task of tasks) {
      const row = el('div', `hud-task${task.done ? ' done' : ''}`, this.tasksList);
      row.textContent = `${task.done ? '✅' : '⬜'} ${fmt(tDynamic(task.labelKey), task.params ?? {})}`;
    }
    if (tasks.every((x) => x.done)) el('div', 'hud-task all', this.tasksList).textContent = t('task.allDone');
  }

  constructor(root: HTMLElement, private readonly session: GameSession) {
    root.replaceChildren();
    root.classList.add('hud');

    const top = el('div', 'hud-top', root);
    const clock = el('div', 'hud-clock', top);
    this.time = el('div', 'hud-time', clock);
    this.date = el('div', 'hud-date', clock);
    this.badge = el('div', 'hud-badge', clock);

    const speed = el('div', 'hud-speed', top);
    for (const s of SPEEDS) {
      const b = el('button', 'hud-speed-btn', speed);
      b.textContent = s.label;
      b.setAttribute('aria-label', s.speed === 0 ? t('hud.pause') : `${s.speed}x`);
      b.addEventListener('click', () => this.setSpeed(s.speed));
      this.speedButtons.push(b);
    }
    this.money = el('div', 'hud-money', top);

    const panel = el('div', 'hud-needs', root);
    const toggle = el('button', 'hud-needs-toggle', panel);
    toggle.textContent = t('hud.needs');
    const list = el('div', 'hud-needs-list', panel);
    toggle.addEventListener('click', () => panel.classList.toggle('collapsed'));
    if (window.matchMedia('(max-height: 500px), (max-width: 640px)').matches) panel.classList.add('collapsed');

    const addBar = (key: string, label: string, inverted = false, icon = ''): HTMLElement => {
      const row = el('div', 'hud-bar', list);
      el('span', 'hud-bar-icon', row).textContent = icon;
      el('span', 'hud-bar-label', row).textContent = label;
      const track = el('div', 'hud-bar-track', row);
      const fill = el('div', 'hud-bar-fill', track);
      const value = el('span', 'hud-bar-value', row);
      this.bars.set(key, { fill, value, last: -1, inverted });
      return row;
    };
    addBar('mood', t('stat.mood'), false, '😊');
    for (const k of NEED_KEYS) addBar(k, tDynamic(`need.${k}`), false, NEED_ICONS[k] ?? '•');
    addBar('stres', t('stat.stres'), true, '😣');
    addBar('kesehatan', t('stat.kesehatan'), false, '❤️');
    this.kangenRow = addBar('kangen', t('stat.kangen'), true, '🏠');

    // Character card, bottom left: face and mood ring, name, mood and active moodlets.
    // Tapping it shows or hides the needs panel.
    this.card = el('button', 'hud-card', root);
    this.cardRing = el('span', 'hud-card-ring', this.card);
    this.cardFace = el('span', 'hud-card-face', this.cardRing);
    const info = el('span', 'hud-card-info', this.card);
    el('span', 'hud-card-name', info).textContent = session.character.name;
    this.cardMood = el('span', 'hud-card-mood', info);
    this.cardBuffs = el('span', 'hud-card-buffs', info);
    this.cardFace.style.background = session.character.appearance.skinTone;
    this.card.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      this.cardTapped = true;
    });

    // "Tugas hari ini" panel on the left, under the clock.
    this.tasksPanel = el('div', 'hud-needs hud-tasks', root);
    const tasksToggle = el('button', 'hud-needs-toggle', this.tasksPanel);
    tasksToggle.textContent = `📋 ${t('task.title')}`;
    this.tasksList = el('div', 'hud-needs-list hud-tasks-list', this.tasksPanel);
    tasksToggle.addEventListener('click', () => this.tasksPanel.classList.toggle('collapsed'));
    if (window.matchMedia('(max-height: 500px), (max-width: 640px)').matches) this.tasksPanel.classList.add('collapsed');

    this.progressBox = el('div', 'hud-progress', root);
    this.progressIcon = el('div', 'hud-progress-icon', this.progressBox);
    const progressText = el('div', 'hud-progress-text', this.progressBox);
    this.progressLabel = el('div', 'hud-progress-label', progressText);
    const track = el('div', 'hud-progress-track', progressText);
    this.progressFill = el('div', 'hud-progress-fill', track);
    this.progressTime = el('div', 'hud-progress-time', progressText);
    this.progressBox.hidden = true;

    this.toasts = el('div', 'hud-toasts', root);
    this.wantedEl = el('div', 'wanted-hud', root);
    this.wantedEl.hidden = true;

    window.addEventListener('keydown', (e) => {
      if (e.key === ' ') this.setSpeed(this.session.clock.speed === 0 ? 1 : 0);
      if (e.key === '1' || e.key === '2' || e.key === '3') this.setSpeed(Number(e.key) as Speed);
    });
    this.refresh();
  }

  setSpeed(speed: Speed): void {
    this.session.clock.speed = speed;
    this.refresh();
  }

  /** Call every frame; refreshes the DOM about 5 times per second. */
  update(dt: number): void {
    this.sinceRefresh += dt;
    if (this.sinceRefresh >= 0.2) this.refresh();
  }

  private refresh(): void {
    this.sinceRefresh = 0;
    this.renderTasks();
    const s = this.session;
    const w = s.crime.wanted;
    this.wantedEl.hidden = w <= 0;
    if (w > 0) this.wantedEl.textContent = fmt(t('crime.stars'), { stars: '★'.repeat(w) + '☆'.repeat(3 - w) });
    const p = toParts(s.clock.minutes);
    this.setText('time', this.time, clockTime(p));
    this.setText('date', this.date, longDate(p));
    this.setText('money', this.money, rupiah(s.wallet.balance));
    this.money.classList.toggle('negative', s.wallet.balance < 0);

    const c = s.character;
    const fasting = c.religionId === 'islam' && c.fastingEnabled && s.calendar.isFastingTime(s.clock.minutes);
    const badge = fasting ? `🌙 ${t('hud.fasting')}` : s.calendar.isRamadan(s.clock.minutes) ? `🌙 ${t('hud.ramadan')}` : '';
    this.setText('badge', this.badge, badge);
    this.badge.hidden = badge === '';

    if (this.lastSpeed !== s.clock.speed) {
      this.lastSpeed = s.clock.speed;
      this.speedButtons.forEach((b, i) => b.classList.toggle('active', SPEEDS[i].speed === s.clock.speed));
    }

    const prog = s.progress();
    this.progressBox.hidden = !prog;
    if (prog) {
      this.progressLabel.textContent = tDynamic(prog.labelKey);
      this.progressIcon.textContent = actionIcon(prog.actionId);
      this.progressFill.style.width = `${Math.round(prog.fraction * 100)}%`;
      const m = Math.max(1, Math.round(prog.minutesLeft));
      const time = m >= 60 ? fmt(t('time.hours'), { h: Math.floor(m / 60), m: m % 60 }) : fmt(t('time.minutes'), { m });
      this.progressTime.textContent = fmt(t('progress.left'), { time });
    }

    const v = c.vitals;
    this.setBar('mood', c.mood);
    for (const k of NEED_KEYS) this.setBar(k, v.needs[k]);
    this.setBar('stres', v.stress);
    this.setBar('kesehatan', v.health);
    this.setBar('kangen', v.kangen);
    this.kangenRow.hidden = !c.perantau;
    this.renderCard();
  }

  /** Hides the character card where the joystick takes the corner (outdoors, inside places). */
  setCardVisible(visible: boolean): void {
    this.card.hidden = !visible;
  }

  private renderCard(): void {
    const c = this.session.character;
    const mood = Math.round(c.mood);
    const lv = mood >= 80 ? 4 : mood >= 60 ? 3 : mood >= 40 ? 2 : mood >= 20 ? 1 : 0;
    const now = this.session.clock.minutes;
    const buffs = c.buffs.filter((b) => b.until > now);
    const key = `${mood}|${buffs.map((b) => b.id).join()}`;
    if (key === this.cardKey) return;
    this.cardKey = key;
    this.cardFace.textContent = ['😫', '😟', '😐', '🙂', '😄'][lv];
    this.cardRing.style.setProperty('--p', `${mood}%`);
    this.cardRing.style.setProperty('--c', barColor(mood, false));
    this.cardMood.textContent = `${tDynamic(`mood.lv${lv}`)} · ${mood}`;
    this.cardBuffs.replaceChildren();
    for (const b of buffs.slice(0, 3)) {
      const chip = el('span', `hud-buff${b.mood < 0 ? ' bad' : ''}`, this.cardBuffs);
      chip.textContent = `${tDynamic(`buff.${b.id}`)} ${b.mood > 0 ? '+' : ''}${b.mood}`;
    }
  }

  private setText(key: keyof Hud['lastText'], node: HTMLElement, text: string): void {
    if (this.lastText[key] === text) return;
    this.lastText[key] = text;
    node.textContent = text;
  }

  private setBar(key: string, value: number): void {
    const bar = this.bars.get(key);
    if (!bar) return;
    const rounded = Math.round(value);
    if (rounded === bar.last) return;
    bar.last = rounded;
    bar.fill.style.width = `${rounded}%`;
    bar.fill.style.background = barColor(rounded, bar.inverted);
    bar.value.textContent = String(rounded);
  }

  /** Shows notifications for simulation events. */
  showEvents(events: SimEvent[]): void {
    for (const e of events) {
      const text = this.eventText(e);
      if (text) this.toast(text);
    }
  }

  private eventText(e: SimEvent): string | null {
    switch (e.kind) {
      case 'salary':
        return fmt(t('toast.salary'), { amount: rupiah(e.payslip.net), bpjs: rupiah(e.payslip.bpjs), tax: rupiah(e.payslip.tax) });
      case 'thr':
        return fmt(t('toast.thr'), { amount: rupiah(e.amount) });
      case 'bill':
        return fmt(t('toast.bill'), { label: tDynamic(e.labelKey), amount: rupiah(e.amount) });
      case 'burnout':
        return t('toast.burnout');
      case 'sick':
        return t('toast.sick');
      case 'newDay': {
        const parts = e.holidays.map((name) => fmt(t('toast.holiday'), { name }));
        if (e.ramadanStart) parts.push(t('toast.ramadan'));
        return parts.length ? parts.join(' · ') : null;
      }
      case 'actionDone':
      case 'actionStep':
        return null;
      case 'shoppingDone':
        return t('toast.shoppingDone');
      case 'message':
        return `📩 ${e.message.from}: ${messageText(e.message)}`;
      case 'hired':
        return t('toast.hired');
      case 'fired':
        return t(e.reason === 'layoff' ? 'toast.layoff' : 'toast.fired');
      case 'lifeEvent':
        return null;
      case 'tradition':
      case 'social':
        return fmt(tDynamic(e.textKey), Object.fromEntries(Object.entries(e.params ?? {}).map(([k, v]) => [k, k === 'amount' && typeof v === 'number' ? rupiah(v) : v])));
      case 'met':
        return fmt(t('toast.met'), { name: e.name });
      case 'houseBuilt':
        return t('toast.houseBuilt');
      case 'relLevel':
        return fmt(t(e.up ? 'toast.relUp' : 'toast.relDown'), { name: e.name, level: tDynamic(`rel.lv${e.level}`) });
      case 'visit':
        return null;
      case 'business':
        return fmt(t(e.profit >= 0 ? 'biz.profit' : 'biz.loss'), { name: tDynamic(e.nameKey), amount: rupiah(Math.abs(e.profit)) });
      case 'delivery':
        return t('dlv.arrived');
      case 'weather':
        return e.flooded ? t('weather.flood') : e.raining ? t('weather.rain') : t('weather.stop');
    }
  }

  /** Called for every notification shown (the phone keeps a log). */
  onToast: ((text: string) => void) | null = null;

  toast(text: string): void {
    this.onToast?.(text);
    const node = el('div', 'hud-toast', this.toasts);
    node.textContent = text;
    while (this.toasts.childElementCount > 3) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => node.classList.add('hide'), 5000);
    window.setTimeout(() => node.remove(), 5600);
  }
}
