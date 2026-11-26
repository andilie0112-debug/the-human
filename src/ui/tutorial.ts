import { t } from '../data/strings';

// A short guided start for new players: one hint card at a time that moves on by itself when
// the player does the thing (walk, tap an object, queue an action, open the phone, go out...).
// It can be skipped and is not shown again once finished or skipped.

export interface TutorialState {
  /** The player tapped the floor to walk (not the character walking by itself). */
  floorTapped: () => boolean;
  /** Distance walked outside since the tutorial began (metres). */
  walked: () => number;
  menuOpen: () => boolean;
  queued: () => boolean;
  needsOpen: () => boolean;
  phoneOpen: () => boolean;
  outside: () => boolean;
}

interface Step {
  key: string;
  done: (s: TutorialState) => boolean;
}

const STEPS: Step[] = [
  { key: 'tut.walk', done: (s) => s.floorTapped() },
  { key: 'tut.object', done: (s) => s.menuOpen() },
  { key: 'tut.queue', done: (s) => s.queued() },
  { key: 'tut.needs', done: (s) => s.needsOpen() },
  { key: 'tut.phone', done: (s) => s.phoneOpen() },
  { key: 'tut.outside', done: (s) => s.outside() },
  { key: 'tut.joystick', done: (s) => s.walked() > 6 },
];

const KEY = 'the-human.tutorial.done';

export function tutorialDone(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function markDone(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Storage blocked: the tutorial simply shows again next time.
  }
}

export class Tutorial {
  private readonly card: HTMLElement;
  private readonly text: HTMLElement;
  private readonly count: HTMLElement;
  private step = 0;
  private timer = 0;
  private finishedAt = 0;

  constructor(private readonly state: TutorialState) {
    this.card = document.createElement('div');
    this.card.className = 'tutorial';
    const head = document.createElement('div');
    head.className = 'tutorial-head';
    this.count = document.createElement('span');
    const skip = document.createElement('button');
    skip.className = 'tutorial-skip';
    skip.textContent = t('tut.skip');
    skip.addEventListener('click', () => this.finish());
    head.append(this.count, skip);
    this.text = document.createElement('div');
    this.text.className = 'tutorial-text';
    this.card.append(head, this.text);
    document.body.append(this.card);
    this.show();
  }

  private show(): void {
    this.count.textContent = `💡 ${this.step + 1}/${STEPS.length}`;
    this.text.textContent = t(STEPS[this.step].key as 'tut.walk');
    this.card.classList.remove('pop');
    void this.card.offsetWidth;
    this.card.classList.add('pop');
  }

  private finish(): void {
    markDone();
    this.card.remove();
    this.step = STEPS.length;
  }

  /** Call every frame with the real time step. */
  update(realDt: number): void {
    if (this.step >= STEPS.length) return;
    if (this.finishedAt > 0) {
      this.finishedAt -= realDt;
      if (this.finishedAt <= 0) this.finish();
      return;
    }
    this.timer -= realDt;
    if (this.timer > 0) return;
    this.timer = 0.4;
    if (!STEPS[this.step].done(this.state)) return;
    this.step++;
    if (this.step >= STEPS.length) {
      // Last card: a goodbye that fades by itself.
      this.step = STEPS.length - 1;
      this.count.textContent = '🎉';
      this.text.textContent = t('tut.done');
      this.finishedAt = 6;
      return;
    }
    this.show();
  }
}
